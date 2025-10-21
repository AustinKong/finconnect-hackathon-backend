import prisma from '../utils/prisma';
import walletService from './WalletService';

export class StablecoinYieldAdapterMock {
  private yieldRate: number;

  constructor() {
    this.yieldRate = parseFloat(process.env.STABLECOIN_YIELD_RATE || '0.05'); // 5% APY default
  }

  /**
   * Stake USDC to earn yield
   */
  async stake(userId: string, amount: number): Promise<{ success: boolean; stakedAmount: number; message?: string }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, stakedAmount: 0, message: 'Wallet not found' };
      }

      if (wallet.balance < amount) {
        return { success: false, stakedAmount: 0, message: 'Insufficient balance' };
      }

      // Update wallet: move funds from balance to staked
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: wallet.balance - amount,
          stakedAmount: wallet.stakedAmount + amount
        }
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          type: 'STAKE',
          amount,
          currency: 'USDC',
          description: `Staked ${amount} USDC for yield`,
          status: 'COMPLETED'
        }
      });

      return { success: true, stakedAmount: amount };
    } catch (error) {
      console.error('Stake error:', error);
      return { success: false, stakedAmount: 0, message: 'Stake operation failed' };
    }
  }

  /**
   * Unstake USDC (stop earning yield)
   */
  async unstake(userId: string, amount: number): Promise<{ success: boolean; unstakedAmount: number; message?: string }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, unstakedAmount: 0, message: 'Wallet not found' };
      }

      if (wallet.stakedAmount < amount) {
        return { success: false, unstakedAmount: 0, message: 'Insufficient staked amount' };
      }

      // Update wallet: move funds from staked to balance
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: wallet.balance + amount,
          stakedAmount: wallet.stakedAmount - amount
        }
      });

      // Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          type: 'UNSTAKE',
          amount,
          currency: 'USDC',
          description: `Unstaked ${amount} USDC`,
          status: 'COMPLETED'
        }
      });

      return { success: true, unstakedAmount: amount };
    } catch (error) {
      console.error('Unstake error:', error);
      return { success: false, unstakedAmount: 0, message: 'Unstake operation failed' };
    }
  }

  /**
   * Calculate and apply yield to staked amounts
   */
  async calculateYield(userId: string): Promise<{ success: boolean; yieldEarned: number }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.stakedAmount === 0) {
        return { success: true, yieldEarned: 0 };
      }

      // Calculate daily yield (APY / 365)
      const dailyRate = this.yieldRate / 365;
      const yieldAmount = wallet.stakedAmount * dailyRate;

      // Update wallet with earned yield using WalletService (will auto-stake if enabled)
      const result = await walletService.addFunds(userId, yieldAmount, {
        description: `Daily yield on ${wallet.stakedAmount} USDC`,
        transactionType: 'YIELD',
        currency: 'USDC'
      });

      if (!result.success) {
        return { success: false, yieldEarned: 0 };
      }

      // Also update yieldEarned tracker
      await prisma.wallet.update({
        where: { userId },
        data: {
          yieldEarned: wallet.yieldEarned + yieldAmount
        }
      });

      return { success: true, yieldEarned: yieldAmount };
    } catch (error) {
      console.error('Calculate yield error:', error);
      return { success: false, yieldEarned: 0 };
    }
  }

  /**
   * Get current yield rate
   */
  getYieldRate(): number {
    return this.yieldRate;
  }

  /**
   * Auto-unstake if needed for a transaction
   */
  async autoUnstake(userId: string, requiredAmount: number): Promise<{ success: boolean; unstakedAmount: number }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, unstakedAmount: 0 };
      }

      const shortfall = requiredAmount - wallet.balance;
      if (shortfall <= 0) {
        return { success: true, unstakedAmount: 0 };
      }

      // Check if we have enough staked to cover
      if (wallet.stakedAmount < shortfall) {
        return { success: false, unstakedAmount: 0 };
      }

      // Auto-unstake the shortfall
      const result = await this.unstake(userId, shortfall);
      return { success: result.success, unstakedAmount: result.unstakedAmount };
    } catch (error) {
      console.error('Auto-unstake error:', error);
      return { success: false, unstakedAmount: 0 };
    }
  }
}

export default new StablecoinYieldAdapterMock();
