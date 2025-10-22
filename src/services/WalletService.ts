import prisma from '../utils/prisma';
import yieldManager from './YieldManager';
import lendingProtocol from '../mock/LendingProtocolMock';

export class WalletService {
  /**
   * Calculate staked amount from shares using current exchange rate
   * This maintains a single source of truth: shares
   */
  async getStakedAmount(shares: number): Promise<number> {
    if (shares === 0) {
      return 0;
    }
    const exchangeRate = await lendingProtocol.getExchangeRate();
    return shares * exchangeRate;
  }
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

      // If auto-staking is enabled, use YieldManager to properly stake funds
      if (wallet.autoStake) {
        // Deposit through YieldManager (creates shares)
        const depositResult = await yieldManager.deposit(userId, amount, options?.currency || 'USD');
        
        if (!depositResult.success) {
          // If deposit fails, just add to balance instead
          console.warn('Auto-stake deposit failed, adding to balance:', depositResult.message);
        } else {
          autoStaked = amount;
          finalBalance = wallet.balance; // Balance stays the same, funds go to staked (as shares)
        }
      }

      // Update wallet balance (shares are already updated by YieldManager if auto-staking succeeded)
      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: {
          balance: finalBalance
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
          yieldEarned: 0,
          shares: 0,
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

  /**
   * Auto-unstake for POS transactions
   * Converts shares directly to balance without going through fiat settlement
   * This is a simplified version for transaction authorization flow
   */
  async autoUnstakeForPOS(userId: string, amountNeeded: number): Promise<{
    success: boolean;
    unstakedAmount?: number;
    message?: string;
  }> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      // Calculate how much we need to unstake
      const deficit = amountNeeded - wallet.balance;
      
      if (deficit <= 0) {
        return { success: true, unstakedAmount: 0, message: 'No unstaking needed' };
      }

      // Get current staked amount
      const stakedAmount = await this.getStakedAmount(wallet.shares);
      
      if (stakedAmount < deficit) {
        return { 
          success: false, 
          message: `Insufficient staked funds. Need ${deficit}, have ${stakedAmount} staked` 
        };
      }

      // Calculate shares to burn based on current exchange rate
      const exchangeRate = await lendingProtocol.getExchangeRate();
      const sharesToBurn = deficit / exchangeRate;

      if (wallet.shares < sharesToBurn) {
        return {
          success: false,
          message: 'Insufficient shares'
        };
      }

      // Withdraw from lending protocol
      const withdrawResult = await lendingProtocol.withdraw(sharesToBurn);
      
      if (!withdrawResult.success || !withdrawResult.amount) {
        return { success: false, message: 'Failed to withdraw from lending protocol' };
      }

      // Update wallet: decrease shares, increase balance
      await prisma.wallet.update({
        where: { userId },
        data: {
          shares: wallet.shares - sharesToBurn,
          balance: wallet.balance + withdrawResult.amount
        }
      });

      // Record unstake transaction
      await prisma.transaction.create({
        data: {
          userId,
          type: 'UNSTAKE',
          amount: withdrawResult.amount,
          currency: 'USD',
          description: `Auto-unstaked ${withdrawResult.amount} USD for POS transaction`,
          status: 'COMPLETED',
          metadata: JSON.stringify({ 
            autoUnstake: true,
            sharesBurned: sharesToBurn,
            exchangeRate 
          })
        }
      });

      return {
        success: true,
        unstakedAmount: withdrawResult.amount,
        message: 'Funds auto-unstaked successfully'
      };
    } catch (error) {
      console.error('Auto-unstake for POS error:', error);
      return { success: false, message: 'Failed to auto-unstake funds' };
    }
  }
}

export default new WalletService();
