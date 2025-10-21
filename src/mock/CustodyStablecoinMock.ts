import prisma from '../utils/prisma';

/**
 * CustodyStablecoinMock - Stablecoin wallet managing pool balances & exchange rate
 * 
 * This service acts as a simple stablecoin wallet, managing the pooled token balance
 * and exchange rate from the lending protocol. Individual user shares are managed
 * by YieldStrategyManager.
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
      where: { id: this.custodyWalletId }
    });
  }

  /**
   * Update pool balance and shares
   * Called by YieldStrategyManager when managing user deposits/withdrawals
   */
  async updatePoolBalance(balanceDelta: number, sharesDelta: number): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const wallet = await this.getCustodyWallet();
      
      const newBalance = wallet.totalPoolBalance + balanceDelta;
      const newShares = wallet.totalShares + sharesDelta;

      if (newBalance < 0 || newShares < 0) {
        return { success: false, message: 'Invalid balance or shares update' };
      }

      await prisma.custodyWallet.update({
        where: { id: wallet.id },
        data: {
          totalPoolBalance: newBalance,
          totalShares: newShares
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Update pool balance error:', error);
      return { success: false, message: 'Failed to update pool balance' };
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
   * Get current exchange rate
   */
  async getExchangeRate(): Promise<number> {
    const wallet = await this.getCustodyWallet();
    return wallet.exchangeRate;
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
      lastRebalanceAt: Date;
    };
  }> {
    try {
      const wallet = await this.getCustodyWallet();

      return {
        success: true,
        stats: {
          totalPoolBalance: wallet.totalPoolBalance,
          totalShares: wallet.totalShares,
          exchangeRate: wallet.exchangeRate,
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
