import prisma from '../utils/prisma';
import stablecoinAdapter from './StablecoinYieldAdapterMock';

export class WalletService {
  /**
   * Add funds to wallet balance with optional auto-staking
   * This method should be used for all wallet balance increases
   */
  async addFunds(
    userId: string,
    amount: number,
    options?: {
      description?: string;
      transactionType?: string;
      currency?: string;
      merchantId?: string;
      metadata?: string;
    }
  ): Promise<{ success: boolean; wallet: any; autoStaked?: number; message?: string }> {
    try {
      if (amount <= 0) {
        return { success: false, wallet: null, message: 'Amount must be positive' };
      }

      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, wallet: null, message: 'Wallet not found' };
      }

      let autoStaked = 0;
      let finalBalance = wallet.balance + amount;
      let finalStakedAmount = wallet.stakedAmount;

      // If auto-staking is enabled, stake the funds instead of adding to balance
      if (wallet.autoStake) {
        autoStaked = amount;
        finalStakedAmount = wallet.stakedAmount + amount;
        finalBalance = wallet.balance; // Balance stays the same, funds go to staked
      }

      // Update wallet
      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: {
          balance: finalBalance,
          stakedAmount: finalStakedAmount
        }
      });

      // Record transaction if details provided
      if (options?.transactionType) {
        await prisma.transaction.create({
          data: {
            userId,
            type: options.transactionType,
            amount,
            currency: options.currency || 'USD',
            merchantId: options.merchantId,
            description: options.description || `Added ${amount} to wallet`,
            status: 'COMPLETED',
            metadata: options.metadata
          }
        });

        // If auto-staked, also record the stake transaction
        if (autoStaked > 0) {
          await prisma.transaction.create({
            data: {
              userId,
              type: 'STAKE',
              amount: autoStaked,
              currency: options.currency || 'USD',
              description: `Auto-staked ${autoStaked} ${options.currency || 'USD'}`,
              status: 'COMPLETED',
              metadata: JSON.stringify({ autoStake: true })
            }
          });
        }
      }

      return {
        success: true,
        wallet: updatedWallet,
        autoStaked: autoStaked > 0 ? autoStaked : undefined
      };
    } catch (error) {
      console.error('Add funds error:', error);
      return { success: false, wallet: null, message: 'Failed to add funds' };
    }
  }

  /**
   * Get or create wallet for a user
   */
  async getOrCreateWallet(userId: string): Promise<any> {
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Create wallet with autoStake enabled by default
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          stakedAmount: 0,
          yieldEarned: 0,
          autoStake: true
        }
      });
    }

    return wallet;
  }

  /**
   * Update wallet autoStake setting
   */
  async updateAutoStake(userId: string, autoStake: boolean): Promise<{ success: boolean; wallet?: any; message?: string }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: { autoStake }
      });

      return { success: true, wallet: updatedWallet };
    } catch (error) {
      console.error('Update autoStake error:', error);
      return { success: false, message: 'Failed to update autoStake setting' };
    }
  }

  /**
   * Deduct funds from wallet
   */
  async deductFunds(
    userId: string,
    amount: number,
    options?: {
      description?: string;
      transactionType?: string;
      currency?: string;
      merchantId?: string;
      metadata?: string;
    }
  ): Promise<{ success: boolean; wallet?: any; message?: string }> {
    try {
      if (amount <= 0) {
        return { success: false, message: 'Amount must be positive' };
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      if (wallet.balance < amount) {
        return { success: false, message: 'Insufficient balance' };
      }

      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: {
          balance: wallet.balance - amount
        }
      });

      // Record transaction if details provided
      if (options?.transactionType) {
        await prisma.transaction.create({
          data: {
            userId,
            type: options.transactionType,
            amount,
            currency: options.currency || 'USD',
            merchantId: options.merchantId,
            description: options.description || `Deducted ${amount} from wallet`,
            status: 'COMPLETED',
            metadata: options.metadata
          }
        });
      }

      return { success: true, wallet: updatedWallet };
    } catch (error) {
      console.error('Deduct funds error:', error);
      return { success: false, message: 'Failed to deduct funds' };
    }
  }
}

export default new WalletService();
