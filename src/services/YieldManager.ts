import prisma from '../utils/prisma';
import lendingProtocol from '../mock/LendingProtocolMock';
import fiatBridge from '../mock/FiatSettlementBridge';

/**
 * YieldManager - Coordinates FiatSettlementBridge and LendingProtocolMock
 * 
 * This service manages the yield strategy by coordinating between components:
 * - On deposit: FiatSettlementBridge (fiat→stablecoin) → LendingProtocol (deposit)
 * - On withdraw: LendingProtocol (withdraw/auto-unstake) → FiatSettlementBridge (stablecoin→fiat)
 * - Manages user shares tracking via Wallet.shares field
 * - Handles wallet balance checks
 * 
 * IMPORTANT: Never calls CustodyStablecoinMock.mint/burn directly.
 * Only FiatSettlementBridge and LendingProtocolMock interact with CustodyStablecoinMock.
 */
export class YieldManager {
  /**
   * Get the current yield rate
   */
  getYieldRate(): number {
    // Return a static yield rate (5% APR)
    return parseFloat(process.env.STABLECOIN_YIELD_RATE || '0.05');
  }

  /**
   * Initialize the lending protocol
   */
  async initialize(): Promise<any> {
    try {
      // Initialize lending protocol
      return await lendingProtocol.initializeProtocol();
    } catch (error) {
      console.error('Initialize yield manager error:', error);
      throw error;
    }
  }

  /**
   * User deposit - User deposits fiat cash and receives shares
   * 
   * Flow: 
   * 1. FiatSettlementBridge: fiat → stablecoin (mints into custody wallet)
   * 2. LendingProtocol: deposit stablecoin (issues shares)
   * 3. Track user shares in Wallet
   */
  async deposit(userId: string, fiatAmount: number, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    stablecoinAmount?: number;
    fiatAmount?: number;
    fxRate?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Step 1: Convert fiat to stablecoin via FiatSettlementBridge
      // This also mints stablecoins into the custody wallet
      // REMARK: Pretend fiat currency is sent to bridge bank off-chain
      const conversionResult = await fiatBridge.fiatToStablecoin(userId, fiatAmount, currency);
      if (!conversionResult.success || !conversionResult.stablecoinAmount) {
        return { success: false, message: 'Failed to convert fiat to stablecoin' };
      }

      const stablecoinAmount = conversionResult.stablecoinAmount;

      // Step 2: Deposit stablecoins into LendingProtocol
      // This mints additional tokens (representing staked amount) into custody wallet
      const depositResult = await lendingProtocol.deposit(stablecoinAmount);
      if (!depositResult.success || !depositResult.shares) {
        return { success: false, message: 'Failed to deposit into lending protocol' };
      }

      const sharesIssued = depositResult.shares;
      const lendingExchangeRate = depositResult.exchangeRate || 1.0;

      // Step 3: Track user shares in Wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      await prisma.wallet.update({
        where: { userId },
        data: {
          shares: wallet.shares + sharesIssued
        }
      });

      return {
        success: true,
        shares: sharesIssued,
        stablecoinAmount,
        fiatAmount,
        fxRate: conversionResult.fxRate,
        exchangeRate: lendingExchangeRate
      };
    } catch (error) {
      console.error('Deposit error:', error);
      return { success: false, message: 'Deposit operation failed' };
    }
  }

  /**
   * User withdraw - User withdraws fiat cash by burning shares
   * 
   * Flow:
   * 1. Calculate shares to burn based on fiat amount needed
   * 2. LendingProtocol: withdraw (burns stablecoins from custody wallet, auto-unstake)
   * 3. FiatSettlementBridge: stablecoin → fiat (burns stablecoins and credits fiat)
   * 4. Update user shares in Wallet
   */
  async withdraw(userId: string, fiatAmount: number, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    stablecoinAmount?: number;
    fiatAmount?: number;
    fxRate?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Step 1: Get conversion quote to estimate required stablecoin amount
      const sampleQuote = await fiatBridge.getStablecoinToFiatQuote(100, currency);
      if (!sampleQuote.success || !sampleQuote.quote) {
        return { success: false, message: 'Failed to get conversion quote' };
      }

      // Calculate required stablecoin amount by reversing the conversion formula
      const effectiveFxRate = sampleQuote.quote.fxRate;
      const settlementFeeRate = sampleQuote.quote.settlementFee / sampleQuote.quote.fiatAmount;
      const requiredStablecoinAmount = fiatAmount / (effectiveFxRate * (1 - settlementFeeRate));

      // Step 2: Get current exchange rate from lending protocol
      const lendingExchangeRate = await lendingProtocol.getExchangeRate();
      
      // Step 3: Calculate shares to burn
      const sharesToBurn = requiredStablecoinAmount / lendingExchangeRate;

      // Step 4: Check user has sufficient shares
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.shares < sharesToBurn) {
        return { success: false, message: 'Insufficient user shares' };
      }

      // Step 5: Withdraw from lending protocol (auto-unstake)
      // This burns stablecoins from the custody wallet
      const withdrawResult = await lendingProtocol.withdraw(sharesToBurn);
      if (!withdrawResult.success || !withdrawResult.amount) {
        return { success: false, message: 'Failed to withdraw from lending protocol' };
      }

      const stablecoinAmount = withdrawResult.amount;

      // Step 6: Convert stablecoins to fiat via FiatSettlementBridge
      // This burns stablecoins from custody wallet and credits fiat to user
      const conversionResult = await fiatBridge.stablecoinToFiat(userId, stablecoinAmount, currency);
      if (!conversionResult.success) {
        // Rollback: re-deposit the withdrawn amount
        await lendingProtocol.deposit(stablecoinAmount);
        return { success: false, message: 'Failed to convert stablecoin to fiat' };
      }

      // Step 7: Update user shares in Wallet
      await prisma.wallet.update({
        where: { userId },
        data: {
          shares: wallet.shares - sharesToBurn
        }
      });

      return {
        success: true,
        shares: sharesToBurn,
        stablecoinAmount,
        fiatAmount: conversionResult.fiatAmount,
        fxRate: conversionResult.fxRate,
        exchangeRate: lendingExchangeRate
      };
    } catch (error) {
      console.error('Withdraw error:', error);
      return { success: false, message: 'Withdrawal operation failed' };
    }
  }

  /**
   * Auto-unstake funds for a user
   * This is called when a user needs funds for a transaction
   */
  async autoUnstake(userId: string, amount: number): Promise<{
    success: boolean;
    unstakedAmount?: number;
    message?: string;
  }> {
    try {
      // Withdraw from yield strategy
      const result = await this.withdraw(userId, amount);
      
      if (!result.success) {
        return { success: false, message: result.message };
      }

      return {
        success: true,
        unstakedAmount: amount,
        message: 'Funds unstaked successfully'
      };
    } catch (error) {
      console.error('Auto-unstake error:', error);
      return { success: false, message: 'Failed to auto-unstake funds' };
    }
  }

  /**
   * Get user's balance (shares * exchangeRate) in stablecoins and optionally fiat
   */
  async getUserBalance(userId: string, currency: string = 'USD'): Promise<{
    success: boolean;
    shares?: number;
    stablecoinBalance?: number;
    fiatBalance?: number;
    exchangeRate?: number;
    fxRate?: number;
  }> {
    try {
      const exchangeRate = await lendingProtocol.getExchangeRate();

      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return {
          success: true,
          shares: 0,
          stablecoinBalance: 0,
          fiatBalance: 0,
          exchangeRate
        };
      }

      // Calculate stablecoin balance
      const stablecoinBalance = wallet.shares * exchangeRate;

      // Calculate fiat balance using FiatSettlementBridge
      const conversionQuote = await fiatBridge.getStablecoinToFiatQuote(stablecoinBalance, currency);
      const fiatBalance = conversionQuote.quote?.effectiveFiatAmount || 0;
      const fxRate = conversionQuote.quote?.fxRate;

      return {
        success: true,
        shares: wallet.shares,
        stablecoinBalance,
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
   * Sync yield from lending protocol
   * This should be called periodically to update exchange rates and accrue interest
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
   * Get statistics
   */
  async getStats(): Promise<{
    success: boolean;
    stats?: {
      totalUsers: number;
      exchangeRate: number;
    };
  }> {
    try {
      const exchangeRate = await lendingProtocol.getExchangeRate();
      
      // Get user count from wallets with shares > 0
      const walletsWithShares = await prisma.wallet.findMany({
        where: {
          shares: {
            gt: 0
          }
        }
      });

      return {
        success: true,
        stats: {
          totalUsers: walletsWithShares.length,
          exchangeRate
        }
      };
    } catch (error) {
      console.error('Get stats error:', error);
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

export default new YieldManager();
