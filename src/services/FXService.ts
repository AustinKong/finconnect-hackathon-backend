import prisma from '../utils/prisma';

export class FXService {
  private rates: Map<string, number>;

  constructor() {
    this.rates = new Map();
    this.initializeRates();
  }

  /**
   * Initialize mock exchange rates
   */
  private initializeRates() {
    // Base rates (to USD)
    const baseRates = {
      'USD_USD': 1.0,
      'EUR_USD': 1.08,
      'GBP_USD': 1.25,
      'JPY_USD': 0.0067,
      'SGD_USD': 0.74,
      'AUD_USD': 0.65,
      'CAD_USD': 0.73,
      'CHF_USD': 1.12,
      'CNY_USD': 0.14,
      'HKD_USD': 0.13,
      'NZD_USD': 0.60,
      'KRW_USD': 0.00075,
      'THB_USD': 0.029,
      'MYR_USD': 0.22,
      'INR_USD': 0.012
    };

    for (const [pair, rate] of Object.entries(baseRates)) {
      this.rates.set(pair, rate);
    }
  }

  /**
   * Get exchange rate between two currencies
   */
  getRate(fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    // Direct rate
    const directKey = `${fromCurrency}_${toCurrency}`;
    if (this.rates.has(directKey)) {
      return this.rates.get(directKey)!;
    }

    // Calculate via USD
    const fromToUSD = this.rates.get(`${fromCurrency}_USD`) || 0;
    const toToUSD = this.rates.get(`${toCurrency}_USD`) || 0;

    if (fromToUSD === 0 || toToUSD === 0) {
      console.warn(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
      return 1.0; // Fallback
    }

    return fromToUSD / toToUSD;
  }

  /**
   * Convert amount from one currency to another
   */
  convert(amount: number, fromCurrency: string, toCurrency: string, includeMarkup: boolean = true): {
    originalAmount: number;
    convertedAmount: number;
    rate: number;
    markup: number;
    finalAmount: number;
    fromCurrency: string;
    toCurrency: string;
  } {
    const rate = this.getRate(fromCurrency, toCurrency);
    const convertedAmount = amount * rate;
    
    // Apply 2% markup if requested
    const markup = includeMarkup ? 0.02 : 0;
    const markupAmount = convertedAmount * markup;
    const finalAmount = convertedAmount + markupAmount;

    return {
      originalAmount: amount,
      convertedAmount,
      rate,
      markup,
      finalAmount,
      fromCurrency,
      toCurrency
    };
  }

  /**
   * Save exchange rate to database
   */
  async saveRate(fromCurrency: string, toCurrency: string, rate: number, markup: number = 0.02) {
    try {
      await prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency,
            toCurrency
          }
        },
        create: {
          fromCurrency,
          toCurrency,
          rate,
          markup
        },
        update: {
          rate,
          markup,
          updatedAt: new Date()
        }
      });

      // Update in-memory cache
      this.rates.set(`${fromCurrency}_${toCurrency}`, rate);

      return { success: true };
    } catch (error) {
      console.error('Save rate error:', error);
      return { success: false };
    }
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    const currencies = new Set<string>();
    
    for (const key of this.rates.keys()) {
      const [from] = key.split('_');
      currencies.add(from);
    }

    return Array.from(currencies).sort();
  }

  /**
   * Get rate history (from database)
   */
  async getRateHistory(fromCurrency: string, toCurrency: string) {
    try {
      const rates = await prisma.exchangeRate.findMany({
        where: {
          fromCurrency,
          toCurrency
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 30 // Last 30 updates
      });

      return rates;
    } catch (error) {
      console.error('Get rate history error:', error);
      return [];
    }
  }
}

export default new FXService();
