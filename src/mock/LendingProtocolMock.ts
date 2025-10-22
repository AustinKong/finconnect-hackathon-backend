import prisma from '../utils/prisma';
import custodyWallet from './CustodyStablecoinMock';

/**
 * LendingProtocolMock - Simulates Aave yield via APR → exchangeRate
 * 
 * This service acts purely as a lending protocol simulator:
 * - Maintains APR→exchangeRate evolution
 * - Tracks user shares and yield accrual
 * - On deposit: calls CustodyStablecoinMock.mint() to add tokens to pooled wallet
 * - On withdraw: calls CustodyStablecoinMock.burn() to remove tokens from pooled wallet
 * 
 * NO direct wallet edits or fiat operations.
 */
export class LendingProtocolMock {
  private protocolId: string | null = null;
  private defaultAPR: number;

  constructor() {
    // Default to 5% APR (can be overridden)
    this.defaultAPR = parseFloat(process.env.LENDING_PROTOCOL_APR || '0.05');
  }

  /**
   * Initialize or get the lending protocol
   */
  async initializeProtocol(): Promise<any> {
    try {
      let protocol = await prisma.lendingProtocol.findFirst();

      if (!protocol) {
        protocol = await prisma.lendingProtocol.create({
          data: {
            name: 'AaveMock',
            currentAPR: this.defaultAPR,
            totalDeposited: 0,
            totalInterestEarned: 0,
            exchangeRate: 1.0,
            lastAccrualAt: new Date()
          }
        });
      }

      this.protocolId = protocol.id;
      return protocol;
    } catch (error) {
      console.error('Initialize lending protocol error:', error);
      throw error;
    }
  }

  /**
   * Get the lending protocol
   */
  async getProtocol(): Promise<any> {
    if (!this.protocolId) {
      return await this.initializeProtocol();
    }

    const protocol = await prisma.lendingProtocol.findUnique({
      where: { id: this.protocolId },
      include: {
        deposits: true
      }
    });
    
    // If protocol was deleted, reinitialize
    if (!protocol) {
      this.protocolId = null;
      return await this.initializeProtocol();
    }
    
    return protocol;
  }

  /**
   * Deposit tokens into the lending protocol
   * Returns shares based on current exchange rate
   * 
   * On deposit, this method:
   * 1. Mints tokens into CustodyStablecoinMock (pooled wallet)
   * 2. Issues shares to the depositor based on current exchange rate
   * 3. Tracks the deposit in the lending protocol
   */
  async deposit(amount: number): Promise<{
    success: boolean;
    shares?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (amount <= 0) {
        return { success: false, message: 'Deposit amount must be positive' };
      }

      const protocol = await this.getProtocol();

      // Step 1: Mint tokens into the pooled custody wallet
      const mintResult = custodyWallet.mint(amount);
      if (!mintResult.success) {
        return { success: false, message: 'Failed to mint tokens into custody wallet' };
      }

      // Step 2: Calculate shares: amount / exchangeRate
      const shares = amount / protocol.exchangeRate;

      // Step 3: Update protocol totals
      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          totalDeposited: protocol.totalDeposited + amount
        }
      });

      // Step 4: Record the deposit
      await prisma.lendingDeposit.create({
        data: {
          protocolId: protocol.id,
          amount,
          shares,
          depositRate: protocol.exchangeRate
        }
      });

      return {
        success: true,
        shares,
        exchangeRate: protocol.exchangeRate
      };
    } catch (error) {
      console.error('Lending protocol deposit error:', error);
      return { success: false, message: 'Deposit operation failed' };
    }
  }

  /**
   * Withdraw tokens from the lending protocol
   * Burns shares and returns tokens based on current exchange rate
   * 
   * On withdraw, this method:
   * 1. Burns shares and calculates token amount
   * 2. Burns tokens from CustodyStablecoinMock (pooled wallet)
   * 3. Updates protocol totals
   */
  async withdraw(shares: number): Promise<{
    success: boolean;
    amount?: number;
    exchangeRate?: number;
    message?: string;
  }> {
    try {
      if (shares <= 0) {
        return { success: false, message: 'Shares must be positive' };
      }

      const protocol = await this.getProtocol();

      // Step 1: Calculate token amount: shares * exchangeRate
      const amount = shares * protocol.exchangeRate;

      if (protocol.totalDeposited < amount) {
        return { success: false, message: 'Insufficient protocol balance' };
      }

      // Step 2: Burn tokens from the pooled custody wallet
      const burnResult = custodyWallet.burn(amount);
      if (!burnResult.success) {
        return { success: false, message: 'Failed to burn tokens from custody wallet' };
      }

      // Step 3: Update protocol totals
      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          totalDeposited: protocol.totalDeposited - amount
        }
      });

      return {
        success: true,
        amount,
        exchangeRate: protocol.exchangeRate
      };
    } catch (error) {
      console.error('Lending protocol withdraw error:', error);
      return { success: false, message: 'Withdrawal operation failed' };
    }
  }

  /**
   * Accrue interest and update exchange rate
   * This simulates the passage of time and compound interest
   * Also syncs the exchange rate to CustodyStablecoinMock
   */
  async accrueInterest(): Promise<{
    success: boolean;
    oldRate?: number;
    newRate?: number;
    interestEarned?: number;
  }> {
    try {
      const protocol = await this.getProtocol();

      if (protocol.totalDeposited === 0) {
        return { success: true, oldRate: protocol.exchangeRate, newRate: protocol.exchangeRate, interestEarned: 0 };
      }

      const now = new Date();
      const lastAccrual = new Date(protocol.lastAccrualAt);
      
      // Calculate time elapsed in seconds
      const secondsElapsed = (now.getTime() - lastAccrual.getTime()) / 1000;
      
      // Calculate continuous compound interest rate
      // exchangeRate increases by: e^(APR * time_in_years)
      const yearsElapsed = secondsElapsed / (365.25 * 24 * 60 * 60);
      const rateMultiplier = Math.exp(protocol.currentAPR * yearsElapsed);
      
      const oldRate = protocol.exchangeRate;
      const newRate = oldRate * rateMultiplier;

      // Calculate interest earned
      const oldValue = protocol.totalDeposited;
      const newValue = oldValue * rateMultiplier;
      const interestEarned = newValue - oldValue;

      // Update protocol
      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          exchangeRate: newRate,
          totalDeposited: newValue,
          totalInterestEarned: protocol.totalInterestEarned + interestEarned,
          lastAccrualAt: now
        }
      });

      // Sync exchange rate to custody wallet
      custodyWallet.updateExchangeRate(newRate);

      return {
        success: true,
        oldRate,
        newRate,
        interestEarned
      };
    } catch (error) {
      console.error('Accrue interest error:', error);
      return { success: false };
    }
  }

  /**
   * Update APR (for dynamic yield adjustments)
   */
  async updateAPR(newAPR: number): Promise<{
    success: boolean;
    oldAPR?: number;
    newAPR?: number;
  }> {
    try {
      if (newAPR < 0 || newAPR > 1) {
        return { success: false };
      }

      const protocol = await this.getProtocol();
      const oldAPR = protocol.currentAPR;

      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          currentAPR: newAPR
        }
      });

      return {
        success: true,
        oldAPR,
        newAPR
      };
    } catch (error) {
      console.error('Update APR error:', error);
      return { success: false };
    }
  }

  /**
   * Get current exchange rate
   */
  async getExchangeRate(): Promise<number> {
    const protocol = await this.getProtocol();
    return protocol.exchangeRate;
  }

  /**
   * Get protocol statistics
   */
  async getStats(): Promise<{
    success: boolean;
    stats?: {
      name: string;
      currentAPR: number;
      totalDeposited: number;
      totalInterestEarned: number;
      exchangeRate: number;
      lastAccrualAt: Date;
      totalDeposits: number;
    };
  }> {
    try {
      const protocol = await this.getProtocol();
      const deposits = await prisma.lendingDeposit.findMany({
        where: { protocolId: protocol.id }
      });

      return {
        success: true,
        stats: {
          name: protocol.name,
          currentAPR: protocol.currentAPR,
          totalDeposited: protocol.totalDeposited,
          totalInterestEarned: protocol.totalInterestEarned,
          exchangeRate: protocol.exchangeRate,
          lastAccrualAt: protocol.lastAccrualAt,
          totalDeposits: deposits.length
        }
      };
    } catch (error) {
      console.error('Get protocol stats error:', error);
      return { success: false };
    }
  }

  /**
   * Calculate projected value after a given time period
   */
  calculateProjectedValue(principal: number, years: number): number {
    const protocol_apr = this.defaultAPR;
    // Continuous compounding: P * e^(r*t)
    return principal * Math.exp(protocol_apr * years);
  }

  /**
   * Calculate APY from APR (for display purposes)
   */
  calculateAPY(apr: number): number {
    // APY = e^r - 1 (continuous compounding)
    return Math.exp(apr) - 1;
  }
}

export default new LendingProtocolMock();
