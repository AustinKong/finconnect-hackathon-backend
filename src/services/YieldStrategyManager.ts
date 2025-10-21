import prisma from '../utils/prisma';
import custodyWallet from '../mock/CustodyStablecoinMock';
import lendingProtocol from '../mock/LendingProtocolMock';

/**
 * YieldStrategyManager - Manages user shares, decides stake/unstake, and manages liquidity buffers
 * 
 * This service manages the yield strategy by handling user deposits/withdrawals,
 * deciding when to stake or unstake funds, maintaining liquidity buffers for user withdrawals,
 * and optimizing yield generation.
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
            minLiquidityBuffer: 0.1,  // 10% minimum
            maxLiquidityBuffer: 0.3,  // 30% maximum
            currentLiquidity: 0,
            totalStaked: 0,
            rebalanceThreshold: 0.05, // 5% deviation triggers rebalance
            autoRebalance: true,
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
   * User deposit - User deposits tokens and receives shares
   * This handles the user share tracking that was previously in CustodyStablecoinMock
   */
  async deposit(userId: string, tokenAmount: number): Promise<{
    success: boolean;
    shares?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (tokenAmount <= 0) {
        return { success: false, message: 'Token amount must be positive' };
      }

      const custodyWalletId = await this.getCustodyWalletId();
      const exchangeRate = await custodyWallet.getExchangeRate();
      
      // Calculate shares to issue based on exchange rate
      // shares = tokenAmount / exchangeRate
      const sharesToIssue = tokenAmount / exchangeRate;

      // Update custody wallet pool totals
      const updateResult = await custodyWallet.updatePoolBalance(tokenAmount, sharesToIssue);
      if (!updateResult.success) {
        return { success: false, message: updateResult.message };
      }

      // Get or create user share record
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
            shares: sharesToIssue,
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
            shares: userShare.shares + sharesToIssue,
            lastDepositAt: new Date()
          }
        });
      }

      // Add liquidity to the strategy buffer
      await this.addLiquidityInternal(tokenAmount);

      return {
        success: true,
        shares: sharesToIssue,
        exchangeRate
      };
    } catch (error) {
      console.error('Deposit error:', error);
      return { success: false, message: 'Deposit operation failed' };
    }
  }

  /**
   * User withdraw - User withdraws tokens by burning shares
   * This handles the user share tracking that was previously in CustodyStablecoinMock
   */
  async withdraw(userId: string, tokenAmount: number): Promise<{
    success: boolean;
    shares?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (tokenAmount <= 0) {
        return { success: false, message: 'Token amount must be positive' };
      }

      const custodyWalletId = await this.getCustodyWalletId();
      const exchangeRate = await custodyWallet.getExchangeRate();

      // Calculate shares to burn based on exchange rate
      // shares = tokenAmount / exchangeRate
      const sharesToBurn = tokenAmount / exchangeRate;

      // Get user share record
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

      // Remove liquidity from the strategy buffer (may trigger unstaking)
      const removeLiqResult = await this.removeLiquidity(tokenAmount);
      if (!removeLiqResult.success) {
        return { success: false, message: removeLiqResult.message };
      }

      // Update custody wallet pool totals
      const updateResult = await custodyWallet.updatePoolBalance(-tokenAmount, -sharesToBurn);
      if (!updateResult.success) {
        return { success: false, message: updateResult.message };
      }

      // Update user shares
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

      return {
        success: true,
        shares: sharesToBurn,
        exchangeRate
      };
    } catch (error) {
      console.error('Withdraw error:', error);
      return { success: false, message: 'Withdrawal operation failed' };
    }
  }

  /**
   * Get user's token balance (shares * exchangeRate)
   */
  async getUserBalance(userId: string): Promise<{
    success: boolean;
    shares?: number;
    tokenBalance?: number;
    exchangeRate?: number;
  }> {
    try {
      const custodyWalletId = await this.getCustodyWalletId();
      const exchangeRate = await custodyWallet.getExchangeRate();

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
          exchangeRate
        };
      }

      const tokenBalance = userShare.shares * exchangeRate;

      return {
        success: true,
        shares: userShare.shares,
        tokenBalance,
        exchangeRate
      };
    } catch (error) {
      console.error('Get user balance error:', error);
      return { success: false };
    }
  }

  /**
   * Determine if rebalancing is needed
   */
  async shouldRebalance(): Promise<{
    shouldRebalance: boolean;
    reason?: string;
    currentRatio?: number;
    targetRatio?: number;
  }> {
    try {
      const strategy = await this.getStrategy();
      const custodyStats = await custodyWallet.getPoolStats();

      if (!custodyStats.success || !custodyStats.stats) {
        return { shouldRebalance: false };
      }

      const totalBalance = custodyStats.stats.totalPoolBalance;
      
      if (totalBalance === 0) {
        return { shouldRebalance: false, reason: 'No balance to rebalance' };
      }

      // Calculate current liquidity ratio
      const currentRatio = strategy.currentLiquidity / totalBalance;
      
      // Target liquidity ratio (midpoint between min and max)
      const targetRatio = (strategy.minLiquidityBuffer + strategy.maxLiquidityBuffer) / 2;

      // Check if we're outside the acceptable range
      if (currentRatio < strategy.minLiquidityBuffer) {
        return {
          shouldRebalance: true,
          reason: 'Liquidity below minimum buffer',
          currentRatio,
          targetRatio
        };
      }

      if (currentRatio > strategy.maxLiquidityBuffer) {
        return {
          shouldRebalance: true,
          reason: 'Liquidity above maximum buffer',
          currentRatio,
          targetRatio
        };
      }

      // Check if deviation from target exceeds threshold
      const deviation = Math.abs(currentRatio - targetRatio);
      if (deviation > strategy.rebalanceThreshold) {
        return {
          shouldRebalance: true,
          reason: 'Deviation from target exceeds threshold',
          currentRatio,
          targetRatio
        };
      }

      return { shouldRebalance: false, currentRatio, targetRatio };
    } catch (error) {
      console.error('Should rebalance check error:', error);
      return { shouldRebalance: false };
    }
  }

  /**
   * Execute rebalancing operation
   */
  async rebalance(): Promise<{
    success: boolean;
    action?: 'stake' | 'unstake' | 'none';
    amount?: number;
    message?: string;
  }> {
    try {
      const strategy = await this.getStrategy();
      const custodyStats = await custodyWallet.getPoolStats();

      if (!custodyStats.success || !custodyStats.stats) {
        return { success: false, message: 'Could not get custody stats' };
      }

      const totalBalance = custodyStats.stats.totalPoolBalance;
      
      if (totalBalance === 0) {
        return { success: true, action: 'none', message: 'No balance to rebalance' };
      }

      // Calculate target liquidity amount
      const targetRatio = (strategy.minLiquidityBuffer + strategy.maxLiquidityBuffer) / 2;
      const targetLiquidity = totalBalance * targetRatio;

      const liquidityDiff = strategy.currentLiquidity - targetLiquidity;

      // If we have excess liquidity, stake it
      if (liquidityDiff > 0) {
        const amountToStake = liquidityDiff;

        // Deposit into lending protocol
        const depositResult = await lendingProtocol.deposit(amountToStake);
        
        if (!depositResult.success) {
          return { success: false, message: 'Failed to deposit to lending protocol' };
        }

        // Update strategy
        await prisma.yieldStrategy.update({
          where: { id: strategy.id },
          data: {
            currentLiquidity: strategy.currentLiquidity - amountToStake,
            totalStaked: strategy.totalStaked + amountToStake,
            lastRebalanceAt: new Date()
          }
        });

        return {
          success: true,
          action: 'stake',
          amount: amountToStake,
          message: `Staked ${amountToStake.toFixed(2)} tokens`
        };
      }
      
      // If we need more liquidity, unstake it
      if (liquidityDiff < 0) {
        const amountToUnstake = Math.abs(liquidityDiff);

        // Calculate shares to withdraw
        const exchangeRate = await lendingProtocol.getExchangeRate();
        const sharesToWithdraw = amountToUnstake / exchangeRate;

        // Withdraw from lending protocol
        const withdrawResult = await lendingProtocol.withdraw(sharesToWithdraw);
        
        if (!withdrawResult.success || !withdrawResult.amount) {
          return { success: false, message: 'Failed to withdraw from lending protocol' };
        }

        // Update strategy
        await prisma.yieldStrategy.update({
          where: { id: strategy.id },
          data: {
            currentLiquidity: strategy.currentLiquidity + withdrawResult.amount,
            totalStaked: Math.max(0, strategy.totalStaked - withdrawResult.amount),
            lastRebalanceAt: new Date()
          }
        });

        return {
          success: true,
          action: 'unstake',
          amount: withdrawResult.amount,
          message: `Unstaked ${withdrawResult.amount.toFixed(2)} tokens`
        };
      }

      // Already balanced
      await prisma.yieldStrategy.update({
        where: { id: strategy.id },
        data: {
          lastRebalanceAt: new Date()
        }
      });

      return {
        success: true,
        action: 'none',
        message: 'Already balanced'
      };
    } catch (error) {
      console.error('Rebalance error:', error);
      return { success: false, message: 'Rebalancing operation failed' };
    }
  }

  /**
   * Add liquidity to the buffer (internal use, called on user deposits)
   */
  private async addLiquidityInternal(amount: number): Promise<{ success: boolean }> {
    try {
      const strategy = await this.getStrategy();

      await prisma.yieldStrategy.update({
        where: { id: strategy.id },
        data: {
          currentLiquidity: strategy.currentLiquidity + amount
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Add liquidity error:', error);
      return { success: false };
    }
  }

  /**
   * Add liquidity to the buffer (called on user deposits)
   */
  async addLiquidity(amount: number): Promise<{ success: boolean }> {
    const result = await this.addLiquidityInternal(amount);
    if (!result.success) {
      return result;
    }

    // Check if auto-rebalance is enabled and rebalance if needed
    const strategy = await this.getStrategy();
    if (strategy.autoRebalance) {
      const shouldRebal = await this.shouldRebalance();
      if (shouldRebal.shouldRebalance) {
        await this.rebalance();
      }
    }

    return { success: true };
  }

  /**
   * Remove liquidity from the buffer (called on user withdrawals)
   */
  async removeLiquidity(amount: number): Promise<{ 
    success: boolean; 
    message?: string;
  }> {
    try {
      const strategy = await this.getStrategy();

      if (strategy.currentLiquidity < amount) {
        // Need to unstake from yield protocol
        const shortfall = amount - strategy.currentLiquidity;
        
        // Calculate shares to withdraw
        const exchangeRate = await lendingProtocol.getExchangeRate();
        const sharesToWithdraw = shortfall / exchangeRate;

        const withdrawResult = await lendingProtocol.withdraw(sharesToWithdraw);
        
        if (!withdrawResult.success || !withdrawResult.amount) {
          return { success: false, message: 'Insufficient liquidity and unable to unstake' };
        }

        // Update strategy with unstaked amount
        await prisma.yieldStrategy.update({
          where: { id: strategy.id },
          data: {
            currentLiquidity: strategy.currentLiquidity + withdrawResult.amount - amount,
            totalStaked: Math.max(0, strategy.totalStaked - withdrawResult.amount)
          }
        });
      } else {
        // We have enough liquidity
        await prisma.yieldStrategy.update({
          where: { id: strategy.id },
          data: {
            currentLiquidity: strategy.currentLiquidity - amount
          }
        });
      }

      // Check if auto-rebalance is enabled and rebalance if needed
      if (strategy.autoRebalance) {
        const shouldRebal = await this.shouldRebalance();
        if (shouldRebal.shouldRebalance) {
          await this.rebalance();
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Remove liquidity error:', error);
      return { success: false, message: 'Failed to remove liquidity' };
    }
  }

  /**
   * Update strategy settings
   */
  async updateSettings(settings: {
    minLiquidityBuffer?: number;
    maxLiquidityBuffer?: number;
    rebalanceThreshold?: number;
    autoRebalance?: boolean;
  }): Promise<{ success: boolean }> {
    try {
      const strategy = await this.getStrategy();

      await prisma.yieldStrategy.update({
        where: { id: strategy.id },
        data: settings
      });

      return { success: true };
    } catch (error) {
      console.error('Update settings error:', error);
      return { success: false };
    }
  }

  /**
   * Get strategy statistics
   */
  async getStats(): Promise<{
    success: boolean;
    stats?: {
      currentLiquidity: number;
      totalStaked: number;
      totalManaged: number;
      liquidityRatio: number;
      minBuffer: number;
      maxBuffer: number;
      autoRebalance: boolean;
      totalUsers: number;
      lastRebalanceAt: Date;
    };
  }> {
    try {
      const strategy = await this.getStrategy();
      const custodyWalletId = await this.getCustodyWalletId();
      
      const totalManaged = strategy.currentLiquidity + strategy.totalStaked;
      const liquidityRatio = totalManaged > 0 ? strategy.currentLiquidity / totalManaged : 0;

      // Get user count
      const userShares = await prisma.userShare.findMany({
        where: { custodyWalletId }
      });

      return {
        success: true,
        stats: {
          currentLiquidity: strategy.currentLiquidity,
          totalStaked: strategy.totalStaked,
          totalManaged,
          liquidityRatio,
          minBuffer: strategy.minLiquidityBuffer,
          maxBuffer: strategy.maxLiquidityBuffer,
          autoRebalance: strategy.autoRebalance,
          totalUsers: userShares.length,
          lastRebalanceAt: strategy.lastRebalanceAt
        }
      };
    } catch (error) {
      console.error('Get strategy stats error:', error);
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
}

export default new YieldStrategyManager();
