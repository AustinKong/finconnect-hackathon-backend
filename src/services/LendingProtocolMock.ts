import prisma from '../utils/prisma';

/**
 * LendingProtocolMock - Simulates Aave yield via APR → exchangeRate
 * 
 * This service simulates a lending protocol like Aave where deposits earn yield.
 * The yield is represented through an increasing exchange rate that compounds over time.
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

    return await prisma.lendingProtocol.findUnique({
      where: { id: this.protocolId },
      include: {
        deposits: true
      }
    });
  }

  /**
   * Deposit tokens into the lending protocol
   * Returns shares based on current exchange rate
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

      // Calculate shares: amount / exchangeRate
      const shares = amount / protocol.exchangeRate;

      // Update protocol totals
      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          totalDeposited: protocol.totalDeposited + amount
        }
      });

      // Record the deposit
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

      // Calculate token amount: shares * exchangeRate
      const amount = shares * protocol.exchangeRate;

      if (protocol.totalDeposited < amount) {
        return { success: false, message: 'Insufficient protocol balance' };
      }

      // Update protocol totals
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
