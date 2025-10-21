import prisma from '../utils/prisma';

/**
 * CustodyStablecoinMock - Pooled wallet managing token balances & exchangeRate from lending protocol
 * 
 * This service manages a pooled custody wallet where multiple users' tokens are held together.
 * It tracks individual user shares and converts between shares and tokens using an exchange rate
 * that reflects yield from the lending protocol.
 */
export class CustodyStablecoinMock {
  private custodyWalletId: string | null = null;

  /**
   * Initialize or get the custody wallet
   */
  async initializeCustodyWallet(): Promise<any> {
    try {
      // Check if custody wallet already exists
      let wallet = await prisma.custodyWallet.findFirst();

      if (!wallet) {
        // Create the first custody wallet
        wallet = await prisma.custodyWallet.create({
          data: {
            totalPoolBalance: 0,
            totalShares: 0,
            exchangeRate: 1.0,
            lastRebalanceAt: new Date()
          }
        });
      }

      this.custodyWalletId = wallet.id;
      return wallet;
    } catch (error) {
      console.error('Initialize custody wallet error:', error);
      throw error;
    }
  }

  /**
   * Get custody wallet
   */
  async getCustodyWallet(): Promise<any> {
    if (!this.custodyWalletId) {
      return await this.initializeCustodyWallet();
    }

    return await prisma.custodyWallet.findUnique({
      where: { id: this.custodyWalletId },
      include: {
        userShares: true
      }
    });
  }

  /**
   * Deposit tokens into the custody wallet
   * User receives shares based on current exchange rate
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

      const wallet = await this.getCustodyWallet();
      
      // Calculate shares to issue based on exchange rate
      // shares = tokenAmount / exchangeRate
      const sharesToIssue = tokenAmount / wallet.exchangeRate;

      // Update custody wallet totals
      await prisma.custodyWallet.update({
        where: { id: wallet.id },
        data: {
          totalPoolBalance: wallet.totalPoolBalance + tokenAmount,
          totalShares: wallet.totalShares + sharesToIssue
        }
      });

      // Get or create user share record
      let userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId: wallet.id
          }
        }
      });

      if (!userShare) {
        userShare = await prisma.userShare.create({
          data: {
            userId,
            custodyWalletId: wallet.id,
            shares: sharesToIssue,
            lastDepositAt: new Date()
          }
        });
      } else {
        userShare = await prisma.userShare.update({
          where: {
            userId_custodyWalletId: {
              userId,
              custodyWalletId: wallet.id
            }
          },
          data: {
            shares: userShare.shares + sharesToIssue,
            lastDepositAt: new Date()
          }
        });
      }

      return {
        success: true,
        shares: sharesToIssue,
        exchangeRate: wallet.exchangeRate
      };
    } catch (error) {
      console.error('Deposit error:', error);
      return { success: false, message: 'Deposit operation failed' };
    }
  }

  /**
   * Withdraw tokens from the custody wallet
   * User's shares are burned and tokens are returned
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

      const wallet = await this.getCustodyWallet();

      // Check if custody wallet has enough balance
      if (wallet.totalPoolBalance < tokenAmount) {
        return { success: false, message: 'Insufficient pool balance' };
      }

      // Calculate shares to burn based on exchange rate
      // shares = tokenAmount / exchangeRate
      const sharesToBurn = tokenAmount / wallet.exchangeRate;

      // Get user share record
      const userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId: wallet.id
          }
        }
      });

      if (!userShare || userShare.shares < sharesToBurn) {
        return { success: false, message: 'Insufficient user shares' };
      }

      // Update custody wallet totals
      await prisma.custodyWallet.update({
        where: { id: wallet.id },
        data: {
          totalPoolBalance: wallet.totalPoolBalance - tokenAmount,
          totalShares: wallet.totalShares - sharesToBurn
        }
      });

      // Update user shares
      await prisma.userShare.update({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId: wallet.id
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
        exchangeRate: wallet.exchangeRate
      };
    } catch (error) {
      console.error('Withdraw error:', error);
      return { success: false, message: 'Withdrawal operation failed' };
    }
  }

  /**
   * Update exchange rate from lending protocol
   * This should be called when the lending protocol accrues interest
   */
  async updateExchangeRate(newExchangeRate: number): Promise<{
    success: boolean;
    oldRate?: number;
    newRate?: number;
  }> {
    try {
      if (newExchangeRate <= 0) {
        return { success: false };
      }

      const wallet = await this.getCustodyWallet();
      const oldRate = wallet.exchangeRate;

      await prisma.custodyWallet.update({
        where: { id: wallet.id },
        data: {
          exchangeRate: newExchangeRate
        }
      });

      return {
        success: true,
        oldRate,
        newRate: newExchangeRate
      };
    } catch (error) {
      console.error('Update exchange rate error:', error);
      return { success: false };
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
      const wallet = await this.getCustodyWallet();

      const userShare = await prisma.userShare.findUnique({
        where: {
          userId_custodyWalletId: {
            userId,
            custodyWalletId: wallet.id
          }
        }
      });

      if (!userShare) {
        return {
          success: true,
          shares: 0,
          tokenBalance: 0,
          exchangeRate: wallet.exchangeRate
        };
      }

      const tokenBalance = userShare.shares * wallet.exchangeRate;

      return {
        success: true,
        shares: userShare.shares,
        tokenBalance,
        exchangeRate: wallet.exchangeRate
      };
    } catch (error) {
      console.error('Get user balance error:', error);
      return { success: false };
    }
  }

  /**
   * Get total pool statistics
   */
  async getPoolStats(): Promise<{
    success: boolean;
    stats?: {
      totalPoolBalance: number;
      totalShares: number;
      exchangeRate: number;
      totalUsers: number;
      lastRebalanceAt: Date;
    };
  }> {
    try {
      const wallet = await this.getCustodyWallet();
      const userShares = await prisma.userShare.findMany({
        where: { custodyWalletId: wallet.id }
      });

      return {
        success: true,
        stats: {
          totalPoolBalance: wallet.totalPoolBalance,
          totalShares: wallet.totalShares,
          exchangeRate: wallet.exchangeRate,
          totalUsers: userShares.length,
          lastRebalanceAt: wallet.lastRebalanceAt
        }
      };
    } catch (error) {
      console.error('Get pool stats error:', error);
      return { success: false };
    }
  }
}

export default new CustodyStablecoinMock();
