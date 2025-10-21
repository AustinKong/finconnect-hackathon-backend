import prisma from '../utils/prisma';
import fxService from './FXServiceMock';

/**
 * FiatSettlementBridge - Converts tokens ↔ fiat for merchant settlement via FX + fees
 * 
 * This service handles the conversion between tokens (USDC) and fiat currencies
 * for merchant settlements, applying foreign exchange rates and settlement fees.
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
   * Convert tokens to fiat for merchant settlement
   * Used when paying merchants in their local currency
   */
  async tokenToFiat(
    merchantId: string,
    tokenAmount: number,
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
      if (tokenAmount <= 0) {
        return { success: false, message: 'Token amount must be positive' };
      }

      // Verify merchant exists
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId }
      });

      if (!merchant) {
        return { success: false, message: 'Merchant not found' };
      }

      // Get FX rate from USD (tokens are USDC = USD) to target currency
      const fxRate = fxService.getRate('USD', targetCurrency);

      // Apply FX markup
      const effectiveFxRate = fxRate * (1 + this.fxMarkup);

      // Calculate fiat amount
      const fiatAmountBeforeFee = tokenAmount * effectiveFxRate;

      // Calculate settlement fee
      const settlementFee = fiatAmountBeforeFee * this.settlementFeeRate;

      // Final fiat amount after fee
      const finalFiatAmount = fiatAmountBeforeFee - settlementFee;

      // Create settlement record
      const settlement = await prisma.fiatSettlement.create({
        data: {
          merchantId,
          settlementType: 'TOKEN_TO_FIAT',
          tokenAmount,
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
      console.error('Token to fiat conversion error:', error);
      return { success: false, message: 'Token to fiat conversion failed' };
    }
  }

  /**
   * Convert fiat to tokens for merchant deposits
   * Used when merchants receive fiat and want to convert to tokens
   */
  async fiatToToken(
    merchantId: string,
    fiatAmount: number,
    sourceCurrency: string
  ): Promise<{
    success: boolean;
    tokenAmount?: number;
    fxRate?: number;
    settlementFee?: number;
    settlementId?: string;
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      // Verify merchant exists
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId }
      });

      if (!merchant) {
        return { success: false, message: 'Merchant not found' };
      }

      // Get FX rate from source currency to USD (tokens are USDC = USD)
      const fxRate = fxService.getRate(sourceCurrency, 'USD');

      // Apply FX markup (inverse for fiat to token)
      const effectiveFxRate = fxRate / (1 + this.fxMarkup);

      // Calculate token amount before fee
      const tokenAmountBeforeFee = fiatAmount * effectiveFxRate;

      // Calculate settlement fee in tokens
      const settlementFee = tokenAmountBeforeFee * this.settlementFeeRate;

      // Final token amount after fee
      const finalTokenAmount = tokenAmountBeforeFee - settlementFee;

      // Create settlement record
      const settlement = await prisma.fiatSettlement.create({
        data: {
          merchantId,
          settlementType: 'FIAT_TO_TOKEN',
          tokenAmount: finalTokenAmount,
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
        tokenAmount: finalTokenAmount,
        fxRate: effectiveFxRate,
        settlementFee,
        settlementId: settlement.id
      };
    } catch (error) {
      console.error('Fiat to token conversion error:', error);
      return { success: false, message: 'Fiat to token conversion failed' };
    }
  }

  /**
   * Get a quote for token to fiat conversion (without executing)
   */
  async getTokenToFiatQuote(
    tokenAmount: number,
    targetCurrency: string
  ): Promise<{
    success: boolean;
    quote?: {
      tokenAmount: number;
      fiatAmount: number;
      fiatCurrency: string;
      fxRate: number;
      fxMarkup: number;
      settlementFee: number;
      effectiveFiatAmount: number;
    };
    message?: string;
  }> {
    try {
      if (tokenAmount <= 0) {
        return { success: false, message: 'Token amount must be positive' };
      }

      const fxRate = fxService.getRate('USD', targetCurrency);

      const effectiveFxRate = fxRate * (1 + this.fxMarkup);
      const fiatAmountBeforeFee = tokenAmount * effectiveFxRate;
      const settlementFee = fiatAmountBeforeFee * this.settlementFeeRate;
      const effectiveFiatAmount = fiatAmountBeforeFee - settlementFee;

      return {
        success: true,
        quote: {
          tokenAmount,
          fiatAmount: fiatAmountBeforeFee,
          fiatCurrency: targetCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          effectiveFiatAmount
        }
      };
    } catch (error) {
      console.error('Get token to fiat quote error:', error);
      return { success: false, message: 'Failed to get quote' };
    }
  }

  /**
   * Get a quote for fiat to token conversion (without executing)
   */
  async getFiatToTokenQuote(
    fiatAmount: number,
    sourceCurrency: string
  ): Promise<{
    success: boolean;
    quote?: {
      fiatAmount: number;
      tokenAmount: number;
      sourceCurrency: string;
      fxRate: number;
      fxMarkup: number;
      settlementFee: number;
      effectiveTokenAmount: number;
    };
    message?: string;
  }> {
    try {
      if (fiatAmount <= 0) {
        return { success: false, message: 'Fiat amount must be positive' };
      }

      const fxRate = fxService.getRate(sourceCurrency, 'USD');

      const effectiveFxRate = fxRate / (1 + this.fxMarkup);
      const tokenAmountBeforeFee = fiatAmount * effectiveFxRate;
      const settlementFee = tokenAmountBeforeFee * this.settlementFeeRate;
      const effectiveTokenAmount = tokenAmountBeforeFee - settlementFee;

      return {
        success: true,
        quote: {
          fiatAmount,
          tokenAmount: tokenAmountBeforeFee,
          sourceCurrency,
          fxRate: effectiveFxRate,
          fxMarkup: this.fxMarkup,
          settlementFee,
          effectiveTokenAmount
        }
      };
    } catch (error) {
      console.error('Get fiat to token quote error:', error);
      return { success: false, message: 'Failed to get quote' };
    }
  }

  /**
   * Get settlement history for a merchant
   */
  async getMerchantSettlements(
    merchantId: string,
    limit: number = 50
  ): Promise<{
    success: boolean;
    settlements?: any[];
    message?: string;
  }> {
    try {
      const settlements = await prisma.fiatSettlement.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
              country: true,
              currency: true
            }
          }
        }
      });

      return {
        success: true,
        settlements
      };
    } catch (error) {
      console.error('Get merchant settlements error:', error);
      return { success: false, message: 'Failed to get settlements' };
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
        where: { id: settlementId },
        include: {
          merchant: true
        }
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
   * Get settlement statistics
   */
  async getSettlementStats(merchantId?: string): Promise<{
    success: boolean;
    stats?: {
      totalSettlements: number;
      totalTokenToFiat: number;
      totalFiatToToken: number;
      totalFeesCollected: number;
      currenciesUsed: string[];
    };
  }> {
    try {
      const where = merchantId ? { merchantId } : {};
      
      const settlements = await prisma.fiatSettlement.findMany({
        where
      });

      const totalTokenToFiat = settlements
        .filter(s => s.settlementType === 'TOKEN_TO_FIAT')
        .length;

      const totalFiatToToken = settlements
        .filter(s => s.settlementType === 'FIAT_TO_TOKEN')
        .length;

      const totalFeesCollected = settlements
        .reduce((sum, s) => sum + s.settlementFee, 0);

      const currenciesUsed = [...new Set(settlements.map(s => s.fiatCurrency))];

      return {
        success: true,
        stats: {
          totalSettlements: settlements.length,
          totalTokenToFiat,
          totalFiatToToken,
          totalFeesCollected,
          currenciesUsed
        }
      };
    } catch (error) {
      console.error('Get settlement stats error:', error);
      return { success: false };
    }
  }

  /**
   * Update settlement status (for pending settlements)
   */
  async updateSettlementStatus(
    settlementId: string,
    status: 'PENDING' | 'COMPLETED' | 'FAILED'
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await prisma.fiatSettlement.update({
        where: { id: settlementId },
        data: {
          status,
          settledAt: status === 'COMPLETED' ? new Date() : null
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Update settlement status error:', error);
      return { success: false, message: 'Failed to update settlement status' };
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
