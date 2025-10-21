import prisma from '../utils/prisma';
import fxService from '../mock/FXServiceMock';
import custodyWallet from '../mock/CustodyStablecoinMock';

/**
 * FiatSettlementBridge - Handles fiat ↔ stablecoin conversion
 * 
 * This service converts between fiat currencies and stablecoins:
 * - Always calls CustodyStablecoinMock.mint() when converting fiat → stablecoin
 * - Always calls CustodyStablecoinMock.burn() when converting stablecoin → fiat
 * - For prototype: manually credits/debits wallet fiat (no real bank account integration)
 * - Applies optional FX rates and settlement fees
 * 
 * IMPORTANT: No lending logic should be here.
 */
export class FiatSettlementBridge {
  private fxMarkup: number;
  private settlementFeeRate: number;

  constructor() {
    // 2% FX markup by default
    this.fxMarkup = parseFloat(process.env.FX_MARKUP || '0.02');
    // 0.5% settlement fee by default
    this.settlementFeeRate = parseFloat(process.env.SETTLEMENT_FEE_RATE || '0.005');
  }

  /**
   * Convert fiat to stablecoins for user deposits
   * 
   * PROTOTYPE BEHAVIOR: This manually credits the user's wallet with fiat amount,
   * then mints the equivalent stablecoins. In production, this would debit from
   * a real bank account before minting.
   * 
   * Flow:
   * 1. Apply FX conversion (with markup) and settlement fees
   * 2. [PROTOTYPE] Manually credit user wallet with fiat (skip real bank debit)
   * 3. Mint stablecoins into custody wallet
   * 4. Record the settlement
   */
  async fiatToStablecoin(
    userId: string,
    fiatAmount: number,
    sourceCurrency: string
  ): Promise<{
    success: boolean;
    stablecoinAmount?: number;
    fxRate?: number;
    settlementFee?: number;
    settlementId?: string;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Get FX rate from source currency to USD (stablecoins are USDC = USD)
      const fxRate = fxService.getRate(sourceCurrency, 'USD');

      // Apply FX markup (inverse for fiat to stablecoin)
      const effectiveFxRate = fxRate / (1 + this.fxMarkup);

      // Calculate stablecoin amount before fee
      const stablecoinAmountBeforeFee = fiatAmount * effectiveFxRate;

      // Calculate settlement fee in stablecoins
      const settlementFee = stablecoinAmountBeforeFee * this.settlementFeeRate;

      // Final stablecoin amount after fee
      const finalStablecoinAmount = stablecoinAmountBeforeFee - settlementFee;

      // PROTOTYPE: Manually credit user wallet with fiat
      // NOTE: In production, this would debit from a real bank account
      if (!user.wallet) {
        // Create wallet if it doesn't exist
        await prisma.wallet.create({
          data: {
            userId,
            balance: fiatAmount
          }
        });
      } else {
        await prisma.wallet.update({
          where: { userId },
          data: {
            balance: user.wallet.balance + fiatAmount
          }
        });
      }

      // Mint stablecoins into custody wallet
      const mintResult = custodyWallet.mint(finalStablecoinAmount);
      if (!mintResult.success) {
        return { success: false, message: 'Failed to mint stablecoins' };
      }

      // Create settlement record
      const settlement = await prisma.fiatSettlement.create({
        data: {
          userId, // Store userId for user settlements
          settlementType: 'FIAT_TO_TOKEN',
          tokenAmount: finalStablecoinAmount,
          fiatAmount,
          fiatCurrency: sourceCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          status: 'COMPLETED',
          settledAt: new Date()
        }
      });

      return {
        success: true,
        stablecoinAmount: finalStablecoinAmount,
        fxRate: effectiveFxRate,
        settlementFee,
        settlementId: settlement.id
      };
    } catch (error) {
      console.error('Fiat to stablecoin conversion error:', error);
      return { success: false, message: 'Fiat to stablecoin conversion failed' };
    }
  }

  /**
   * Convert stablecoins to fiat for user withdrawals
   * 
   * PROTOTYPE BEHAVIOR: This burns the stablecoins, then manually debits the
   * user's wallet with the fiat amount. In production, this would credit to
   * a real bank account after burning.
   * 
   * Flow:
   * 1. Apply FX conversion (with markup) and settlement fees
   * 2. Burn stablecoins from custody wallet
   * 3. [PROTOTYPE] Manually debit user wallet with fiat (skip real bank credit)
   * 4. Record the settlement
   */
  async stablecoinToFiat(
    userId: string,
    stablecoinAmount: number,
    targetCurrency: string
  ): Promise<{
    success: boolean;
    fiatAmount?: number;
    fxRate?: number;
    settlementFee?: number;
    settlementId?: string;
    message?: string;
  }> {
    try {
      if (stablecoinAmount <= 0) {
        return { success: false, message: 'Stablecoin amount must be positive' };
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Get FX rate from USD (stablecoins are USDC = USD) to target currency
      const fxRate = fxService.getRate('USD', targetCurrency);

      // Apply FX markup
      const effectiveFxRate = fxRate * (1 + this.fxMarkup);

      // Calculate fiat amount before fee
      const fiatAmountBeforeFee = stablecoinAmount * effectiveFxRate;

      // Calculate settlement fee in fiat
      const settlementFee = fiatAmountBeforeFee * this.settlementFeeRate;

      // Final fiat amount after fee
      const finalFiatAmount = fiatAmountBeforeFee - settlementFee;

      // Burn stablecoins from custody wallet
      const burnResult = custodyWallet.burn(stablecoinAmount);
      if (!burnResult.success) {
        return { success: false, message: 'Failed to burn stablecoins' };
      }

      // PROTOTYPE: Manually debit user wallet with fiat
      // NOTE: In production, this would credit to a real bank account
      if (!user.wallet) {
        return { success: false, message: 'User wallet not found' };
      }

      if (user.wallet.balance < finalFiatAmount) {
        // Rollback the burn by minting back
        custodyWallet.mint(stablecoinAmount);
        return { success: false, message: 'Insufficient wallet balance' };
      }

      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: user.wallet.balance - finalFiatAmount
        }
      });

      // Create settlement record
      const settlement = await prisma.fiatSettlement.create({
        data: {
          userId, // Store userId for user settlements
          settlementType: 'TOKEN_TO_FIAT',
          tokenAmount: stablecoinAmount,
          fiatAmount: finalFiatAmount,
          fiatCurrency: targetCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          status: 'COMPLETED',
          settledAt: new Date()
        }
      });

      return {
        success: true,
        fiatAmount: finalFiatAmount,
        fxRate: effectiveFxRate,
        settlementFee,
        settlementId: settlement.id
      };
    } catch (error) {
      console.error('Stablecoin to fiat conversion error:', error);
      return { success: false, message: 'Stablecoin to fiat conversion failed' };
    }
  }

  /**
   * Get a quote for fiat to stablecoin conversion (without executing)
   */
  async getFiatToStablecoinQuote(
    fiatAmount: number,
    sourceCurrency: string
  ): Promise<{
    success: boolean;
    quote?: {
      fiatAmount: number;
      stablecoinAmount: number;
      sourceCurrency: string;
      fxRate: number;
      fxMarkup: number;
      settlementFee: number;
      effectiveStablecoinAmount: number;
    };
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      const fxRate = fxService.getRate(sourceCurrency, 'USD');

      const effectiveFxRate = fxRate / (1 + this.fxMarkup);
      const stablecoinAmountBeforeFee = fiatAmount * effectiveFxRate;
      const settlementFee = stablecoinAmountBeforeFee * this.settlementFeeRate;
      const effectiveStablecoinAmount = stablecoinAmountBeforeFee - settlementFee;

      return {
        success: true,
        quote: {
          fiatAmount,
          stablecoinAmount: stablecoinAmountBeforeFee,
          sourceCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          effectiveStablecoinAmount
        }
      };
    } catch (error) {
      console.error('Get fiat to stablecoin quote error:', error);
      return { success: false, message: 'Failed to get quote' };
    }
  }

  /**
   * Get a quote for stablecoin to fiat conversion (without executing)
   */
  async getStablecoinToFiatQuote(
    stablecoinAmount: number,
    targetCurrency: string
  ): Promise<{
    success: boolean;
    quote?: {
      stablecoinAmount: number;
      fiatAmount: number;
      targetCurrency: string;
      fxRate: number;
      fxMarkup: number;
      settlementFee: number;
      effectiveFiatAmount: number;
    };
    message?: string;
  }> {
    try {
      if (stablecoinAmount <= 0) {
        return { success: false, message: 'Stablecoin amount must be positive' };
      }

      const fxRate = fxService.getRate('USD', targetCurrency);

      const effectiveFxRate = fxRate * (1 + this.fxMarkup);
      const fiatAmountBeforeFee = stablecoinAmount * effectiveFxRate;
      const settlementFee = fiatAmountBeforeFee * this.settlementFeeRate;
      const effectiveFiatAmount = fiatAmountBeforeFee - settlementFee;

      return {
        success: true,
        quote: {
          stablecoinAmount,
          fiatAmount: fiatAmountBeforeFee,
          targetCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          effectiveFiatAmount
        }
      };
    } catch (error) {
      console.error('Get stablecoin to fiat quote error:', error);
      return { success: false, message: 'Failed to get quote' };
    }
  }

  /**
   * Get settlement by ID
   */
  async getSettlement(settlementId: string): Promise<{
    success: boolean;
    settlement?: any;
    message?: string;
  }> {
    try {
      const settlement = await prisma.fiatSettlement.findUnique({
        where: { id: settlementId }
      });

      if (!settlement) {
        return { success: false, message: 'Settlement not found' };
      }

      return {
        success: true,
        settlement
      };
    } catch (error) {
      console.error('Get settlement error:', error);
      return { success: false, message: 'Failed to get settlement' };
    }
  }

  /**
   * Update FX markup rate
   */
  setFxMarkup(markup: number): void {
    if (markup >= 0 && markup <= 1) {
      this.fxMarkup = markup;
    }
  }

  /**
   * Update settlement fee rate
   */
  setSettlementFeeRate(rate: number): void {
    if (rate >= 0 && rate <= 1) {
      this.settlementFeeRate = rate;
    }
  }

  /**
   * Get current rates
   */
  getRates(): { fxMarkup: number; settlementFeeRate: number } {
    return {
      fxMarkup: this.fxMarkup,
      settlementFeeRate: this.settlementFeeRate
    };
  }
}

export default new FiatSettlementBridge();
