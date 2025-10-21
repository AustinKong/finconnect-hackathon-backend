import yieldStrategy from './YieldStrategyManager';

/**
 * StablecoinYieldAdapterMock - Adapter for stablecoin yield operations
 * 
 * This adapter provides a simple interface for wallet operations that interact
 * with the yield strategy manager.
 */
export class StablecoinYieldAdapterMock {
  /**
   * Get the current yield rate
   */
  getYieldRate(): number {
    // Return a static yield rate (5% APR)
    return 0.05;
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
      const result = await yieldStrategy.withdraw(userId, amount);
      
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
}

export default new StablecoinYieldAdapterMock();
