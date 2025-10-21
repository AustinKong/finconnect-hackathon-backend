import prisma from '../utils/prisma';
import custodyWallet from '../mock/CustodyStablecoinMock';
import lendingProtocol from '../mock/LendingProtocolMock';
import fiatBridge from './FiatSettlementBridge';

/**
 * YieldStrategyManager - Manages user shares with fiat deposits/withdrawals
 * 
 * This service manages the yield strategy by:
 * - Converting fiat deposits to stablecoins via FiatSettlementBridge
 * - Depositing stablecoins directly into LendingProtocol
 * - Managing user shares in the pooled custody wallet
 * - Auto-unstaking from LendingProtocol for withdrawals
 * - Converting stablecoins back to fiat for cash withdrawals
 */
export class YieldStrategyManager {
  private strategyId: string | null = null;
  private custodyWalletId: string | null = null;

  /**
   * Initialize or get the yield strategy
   */
  async initializeStrategy(): Promise<any> {
    try {
      let strategy = await prisma.yieldStrategy.findFirst();

      if (!strategy) {
        strategy = await prisma.yieldStrategy.create({
          data: {
            minLiquidityBuffer: 0,  // No liquidity buffer
            maxLiquidityBuffer: 0,  // No liquidity buffer
            currentLiquidity: 0,
            totalStaked: 0,
            rebalanceThreshold: 0,
            autoRebalance: false,  // No auto-rebalancing
            lastRebalanceAt: new Date()
          }
        });
      }

      this.strategyId = strategy.id;
      
      // Initialize custody wallet
      const wallet = await custodyWallet.initializeCustodyWallet();
      this.custodyWalletId = wallet.id;
      
      return strategy;
    } catch (error) {
      console.error('Initialize yield strategy error:', error);
      throw error;
    }
  }

  /**
   * Get the custody wallet ID
   */
  private async getCustodyWalletId(): Promise<string> {
    if (!this.custodyWalletId) {
      const wallet = await custodyWallet.getCustodyWallet();
      this.custodyWalletId = wallet.id;
    }
    return this.custodyWalletId!;
  }

  /**
   * Get the yield strategy
   */
  async getStrategy(): Promise<any> {
    if (!this.strategyId) {
      return await this.initializeStrategy();
    }

    return await prisma.yieldStrategy.findUnique({
      where: { id: this.strategyId }
    });
  }

  /**
   * User deposit - User deposits fiat cash and receives shares
   * Flow: fiat → stablecoin (via FiatSettlementBridge) → LendingProtocol → user shares
   */
  async deposit(userId: string, fiatAmount: number, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    tokenAmount?: number;
    fiatAmount?: number;
    fxRate?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Step 1: Convert fiat to tokens using FiatSettlementBridge
      const conversionQuote = await fiatBridge.getFiatToTokenQuote(fiatAmount, currency);
      if (!conversionQuote.success || !conversionQuote.quote) {
        return { success: false, message: 'Failed to get conversion quote' };
      }

      const tokenAmount = conversionQuote.quote.effectiveTokenAmount;

      // Step 2: Deposit tokens into LendingProtocol
      const depositResult = await lendingProtocol.deposit(tokenAmount);
      if (!depositResult.success || !depositResult.shares) {
        return { success: false, message: 'Failed to deposit into lending protocol' };
      }

      const sharesIssued = depositResult.shares;
      const lendingExchangeRate = depositResult.exchangeRate || 1.0;

      // Step 3: Update custody wallet pool totals
      const custodyWalletId = await this.getCustodyWalletId();
      const updateResult = await custodyWallet.updatePoolBalance(tokenAmount, sharesIssued);
      if (!updateResult.success) {
        return { success: false, message: updateResult.message };
      }

      // Step 4: Update or create user share record
      let userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId
          }
        }
      });

      if (!userShare) {
        userShare = await prisma.userShare.create({
          data: {
            userId,
            custodyWalletId,
            shares: sharesIssued,
            lastDepositAt: new Date()
          }
        });
      } else {
        userShare = await prisma.userShare.update({
          where: {
            userId_custodyWalletId: {
              userId,
              custodyWalletId
            }
          },
          data: {
            shares: userShare.shares + sharesIssued,
            lastDepositAt: new Date()
          }
        });
      }

      // Step 5: Update strategy totals (no liquidity buffer, all goes to staked)
      const strategy = await this.getStrategy();
      await prisma.yieldStrategy.update({
        where: { id: strategy.id },
        data: {
          totalStaked: strategy.totalStaked + tokenAmount
        }
      });

      // Step 6: Sync exchange rate from lending protocol to custody wallet
      await custodyWallet.updateExchangeRate(lendingExchangeRate);

      return {
        success: true,
        shares: sharesIssued,
        tokenAmount,
        fiatAmount,
        fxRate: conversionQuote.quote.fxRate,
        exchangeRate: lendingExchangeRate
      };
    } catch (error) {
      console.error('Deposit error:', error);
      return { success: false, message: 'Deposit operation failed' };
    }
  }

  /**
   * User withdraw - User withdraws fiat cash by burning shares
   * Flow: burn shares → withdraw from LendingProtocol (auto-unstake) → convert stablecoin to fiat
   */
  async withdraw(userId: string, fiatAmount: number, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    tokenAmount?: number;
    fiatAmount?: number;
    fxRate?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Step 1: Get conversion quote to determine required token amount
      const conversionQuote = await fiatBridge.getTokenToFiatQuote(0, currency);
      if (!conversionQuote.success || !conversionQuote.quote) {
        return { success: false, message: 'Failed to get conversion quote' };
      }

      // Calculate required token amount (reverse the conversion with fees)
      // We need: tokenAmount * fxRate - settlementFee = fiatAmount
      // So: tokenAmount = (fiatAmount + settlementFee) / fxRate
      // But settlementFee = tokenAmount * fxRate * settlementFeeRate
      // Solving: tokenAmount = fiatAmount / (fxRate * (1 - settlementFeeRate))
      const effectiveFxRate = conversionQuote.quote.fxRate;
      const settlementFeeRate = conversionQuote.quote.settlementFee / conversionQuote.quote.fiatAmount;
      const requiredTokenAmount = fiatAmount / (effectiveFxRate * (1 - settlementFeeRate));

      // Step 2: Get current exchange rate from lending protocol
      const lendingExchangeRate = await lendingProtocol.getExchangeRate();
      
      // Step 3: Calculate shares to burn
      const sharesToBurn = requiredTokenAmount / lendingExchangeRate;

      // Step 4: Check user has sufficient shares
      const custodyWalletId = await this.getCustodyWalletId();
      const userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId
          }
        }
      });

      if (!userShare || userShare.shares < sharesToBurn) {
        return { success: false, message: 'Insufficient user shares' };
      }

      // Step 5: Withdraw from lending protocol (auto-unstake)
      const withdrawResult = await lendingProtocol.withdraw(sharesToBurn);
      if (!withdrawResult.success || !withdrawResult.amount) {
        return { success: false, message: 'Failed to withdraw from lending protocol' };
      }

      const tokenAmount = withdrawResult.amount;

      // Step 6: Update custody wallet pool totals
      const updateResult = await custodyWallet.updatePoolBalance(-tokenAmount, -sharesToBurn);
      if (!updateResult.success) {
        return { success: false, message: updateResult.message };
      }

      // Step 7: Update user shares
      await prisma.userShare.update({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId
          }
        },
        data: {
          shares: userShare.shares - sharesToBurn,
          lastWithdrawalAt: new Date()
        }
      });

      // Step 8: Update strategy totals
      const strategy = await this.getStrategy();
      await prisma.yieldStrategy.update({
        where: { id: strategy.id },
        data: {
          totalStaked: Math.max(0, strategy.totalStaked - tokenAmount)
        }
      });

      // Step 9: Get actual fiat conversion
      const actualConversion = await fiatBridge.getTokenToFiatQuote(tokenAmount, currency);
      const actualFiatAmount = actualConversion.quote?.effectiveFiatAmount || fiatAmount;

      return {
        success: true,
        shares: sharesToBurn,
        tokenAmount,
        fiatAmount: actualFiatAmount,
        fxRate: actualConversion.quote?.fxRate,
        exchangeRate: lendingExchangeRate
      };
    } catch (error) {
      console.error('Withdraw error:', error);
      return { success: false, message: 'Withdrawal operation failed' };
    }
  }

  /**
   * Get user's balance (shares * exchangeRate) in tokens and optionally fiat
   */
  async getUserBalance(userId: string, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    tokenBalance?: number;
    fiatBalance?: number;
    exchangeRate?: number;
    fxRate?: number;
  }> {
    try {
      const custodyWalletId = await this.getCustodyWalletId();
      const exchangeRate = await lendingProtocol.getExchangeRate();

      const userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId
          }
        }
      });

      if (!userShare) {
        return {
          success: true,
          shares: 0,
          tokenBalance: 0,
          fiatBalance: 0,
          exchangeRate
        };
      }

      // Calculate token balance
      const tokenBalance = userShare.shares * exchangeRate;

      // Calculate fiat balance using FiatSettlementBridge
      const conversionQuote = await fiatBridge.getTokenToFiatQuote(tokenBalance, currency);
      const fiatBalance = conversionQuote.quote?.effectiveFiatAmount || 0;
      const fxRate = conversionQuote.quote?.fxRate;

      return {
        success: true,
        shares: userShare.shares,
        tokenBalance,
        fiatBalance,
        exchangeRate,
        fxRate
      };
    } catch (error) {
      console.error('Get user balance error:', error);
      return { success: false };
    }
  }

  /**
   * Sync yield from lending protocol to custody wallet
   * This should be called periodically to update exchange rates
   */
  async syncYield(): Promise<{
    success: boolean;
    interestEarned?: number;
    exchangeRate?: number;
  }> {
    try {
      // Accrue interest in lending protocol
      const accrualResult = await lendingProtocol.accrueInterest();
      
      if (!accrualResult.success || !accrualResult.newRate) {
        return { success: false };
      }

      // Update custody wallet exchange rate
      await custodyWallet.updateExchangeRate(accrualResult.newRate);

      // Update total staked based on new rate (interest compounds into staked amount)
      if (accrualResult.interestEarned) {
        const strategy = await this.getStrategy();
        await prisma.yieldStrategy.update({
          where: { id: strategy.id },
          data: {
            totalStaked: strategy.totalStaked + accrualResult.interestEarned
          }
        });
      }

      return {
        success: true,
        interestEarned: accrualResult.interestEarned,
        exchangeRate: accrualResult.newRate
      };
    } catch (error) {
      console.error('Sync yield error:', error);
      return { success: false };
    }
  }

  /**
   * Get strategy statistics (simplified - no liquidity buffer)
   */
  async getStats(): Promise<{
    success: boolean;
    stats?: {
      totalStaked: number;
      totalUsers: number;
      exchangeRate: number;
    };
  }> {
    try {
      const strategy = await this.getStrategy();
      const custodyWalletId = await this.getCustodyWalletId();
      const exchangeRate = await lendingProtocol.getExchangeRate();
      
      // Get user count
      const userShares = await prisma.userShare.findMany({
        where: { custodyWalletId }
      });

      return {
        success: true,
        stats: {
          totalStaked: strategy.totalStaked,
          totalUsers: userShares.length,
          exchangeRate
        }
      };
    } catch (error) {
      console.error('Get strategy stats error:', error);
      return { success: false };
    }
  }

  /**
   * Check if user has sufficient balance for withdrawal
   */
  async hasSufficientBalance(userId: string, fiatAmount: number, currency: string = 'USD'): Promise<{
    success: boolean;
    hasSufficient?: boolean;
    currentBalance?: number;
    requiredBalance?: number;
  }> {
    try {
      const balance = await this.getUserBalance(userId, currency);
      if (!balance.success || balance.fiatBalance === undefined) {
        return { success: false };
      }

      return {
        success: true,
        hasSufficient: balance.fiatBalance >= fiatAmount,
        currentBalance: balance.fiatBalance,
        requiredBalance: fiatAmount
      };
    } catch (error) {
      console.error('Check sufficient balance error:', error);
      return { success: false };
    }
  }
}

export default new YieldStrategyManager();
