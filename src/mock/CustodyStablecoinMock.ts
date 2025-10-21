/**
 * CustodyStablecoinMock - Pooled stablecoin wallet with token-level operations
 * 
 * This service acts strictly as a pooled stablecoin wallet, handling only:
 * - Token operations: mint, burn, transfer, balance
 * - Exchange rate tracking (synced from lending protocol)
 * 
 * IMPORTANT: Only LendingProtocolMock and FiatSettlementBridge should call mint/burn.
 * No business logic, staking logic, or user share management should be here.
 */
export class CustodyStablecoinMock {
  // In-memory balance representing the pooled stablecoin wallet
  private pooledBalance: number = 0;
  
  // Exchange rate from the lending protocol (1.0 = no yield accrued)
  private exchangeRate: number = 1.0;

  /**
   * Mint stablecoins into the pooled wallet
   * Should only be called by LendingProtocolMock (on deposit) or FiatSettlementBridge (on fiat→stablecoin)
   */
  mint(amount: number): {
    success: boolean;
    newBalance?: number;
    message?: string;
  } {
    try {
      if (amount <= 0) {
        return { success: false, message: 'Mint amount must be positive' };
      }

      this.pooledBalance += amount;

      return {
        success: true,
        newBalance: this.pooledBalance
      };
    } catch (error) {
      console.error('Mint error:', error);
      return { success: false, message: 'Failed to mint tokens' };
    }
  }

  /**
   * Burn stablecoins from the pooled wallet
   * Should only be called by LendingProtocolMock (on withdraw) or FiatSettlementBridge (on stablecoin→fiat)
   */
  burn(amount: number): {
    success: boolean;
    newBalance?: number;
    message?: string;
  } {
    try {
      if (amount <= 0) {
        return { success: false, message: 'Burn amount must be positive' };
      }

      if (this.pooledBalance < amount) {
        return { success: false, message: 'Insufficient pooled balance' };
      }

      this.pooledBalance -= amount;

      return {
        success: true,
        newBalance: this.pooledBalance
      };
    } catch (error) {
      console.error('Burn error:', error);
      return { success: false, message: 'Failed to burn tokens' };
    }
  }

  /**
   * Transfer stablecoins within the pool (for internal operations if needed)
   */
  transfer(amount: number): {
    success: boolean;
    message?: string;
  } {
    try {
      if (amount <= 0) {
        return { success: false, message: 'Transfer amount must be positive' };
      }

      if (this.pooledBalance < amount) {
        return { success: false, message: 'Insufficient pooled balance' };
      }

      // For now, transfer is a no-op since we have a single pooled balance
      // This can be extended in the future if we need to track sub-accounts

      return { success: true };
    } catch (error) {
      console.error('Transfer error:', error);
      return { success: false, message: 'Failed to transfer tokens' };
    }
  }

  /**
   * Get the current pooled balance
   */
  getBalance(): number {
    return this.pooledBalance;
  }

  /**
   * Update exchange rate from lending protocol
   * This should be called when the lending protocol accrues interest
   */
  updateExchangeRate(newExchangeRate: number): {
    success: boolean;
    oldRate?: number;
    newRate?: number;
  } {
    try {
      if (newExchangeRate <= 0) {
        return { success: false };
      }

      const oldRate = this.exchangeRate;
      this.exchangeRate = newExchangeRate;

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
  getExchangeRate(): number {
    return this.exchangeRate;
  }

  /**
   * Get wallet statistics (for monitoring/debugging)
   */
  getStats(): {
    pooledBalance: number;
    exchangeRate: number;
  } {
    return {
      pooledBalance: this.pooledBalance,
      exchangeRate: this.exchangeRate
    };
  }
}

export default new CustodyStablecoinMock();
