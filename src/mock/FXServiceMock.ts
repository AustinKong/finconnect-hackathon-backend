export class FXSServiceMock {
  private rates: Map<string, number>;
  private histories: Map<string, Array<{ rate: number; markup: number; updatedAt: Date }>>;

  constructor() {
    this.rates = new Map();
    this.histories = new Map();
    this.initializeRates();
  }

  /**
   * Initialize mock exchange rates (in-memory only)
   */
  private initializeRates() {
    // Base rates (to USD)
    const baseRates: Record<string, number> = {
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

    const defaultMarkup = 0.02;

    for (const [pair, rate] of Object.entries(baseRates)) {
      this.rates.set(pair, rate);
      this.histories.set(pair, [{ rate, markup: defaultMarkup, updatedAt: new Date() }]);

      // Also populate the reverse pair for direct lookups
      const [from, to] = pair.split('_');
      const reverseKey = `${to}_${from}`;
      if (!this.rates.has(reverseKey) && rate !== 0) {
        const reverseRate = 1 / rate;
        this.rates.set(reverseKey, reverseRate);
        this.histories.set(reverseKey, [{ rate: reverseRate, markup: defaultMarkup, updatedAt: new Date() }]);
      }
    }
  }

  /**
   * Get exchange rate between two currencies (in-memory)
   */
  getRate(fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    const directKey = `${fromCurrency}_${toCurrency}`;
    if (this.rates.has(directKey)) {
      return this.rates.get(directKey)!;
    }

    // Calculate via USD if possible
    const fromToUSD = this.rates.get(`${fromCurrency}_USD`);
    const toToUSD = this.rates.get(`${toCurrency}_USD`);

    if (fromToUSD !== undefined && toToUSD !== undefined && toToUSD !== 0) {
      return fromToUSD / toToUSD;
    }

    console.warn(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
    return 1.0; // Fallback
  }

  /**
   * Convert amount from one currency to another
   */
  convert(amount: number, fromCurrency: string, toCurrency: string, includeMarkup: boolean = true) {
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
   * Save exchange rate in-memory (no DB persistence)
   */
  async saveRate(fromCurrency: string, toCurrency: string, rate: number, markup: number = 0.02) {
    try {
      const key = `${fromCurrency}_${toCurrency}`;
      const now = new Date();

      // Update in-memory rate
      this.rates.set(key, rate);

      // Update history for the pair
      const existingHistory = this.histories.get(key) || [];
      existingHistory.unshift({ rate, markup, updatedAt: now });
      this.histories.set(key, existingHistory.slice(0, 30));

      // Also update reverse pair for convenience
      const reverseKey = `${toCurrency}_${fromCurrency}`;
      const reverseRate = rate === 0 ? 0 : 1 / rate;
      this.rates.set(reverseKey, reverseRate);
      const existingReverseHistory = this.histories.get(reverseKey) || [];
      existingReverseHistory.unshift({ rate: reverseRate, markup, updatedAt: now });
      this.histories.set(reverseKey, existingReverseHistory.slice(0, 30));

      return { success: true };
    } catch (error) {
      console.error('Save rate error (in-memory):', error);
      return { success: false };
    }
  }

  /**
   * Get rate history from in-memory store
   */
  async getRateHistory(fromCurrency: string, toCurrency: string) {
    const key = `${fromCurrency}_${toCurrency}`;
    const history = this.histories.get(key);

    if (history && history.length > 0) {
      // Return a plain array (mimic DB rows)
      return history.map((h) => ({
        fromCurrency,
        toCurrency,
        rate: h.rate,
        markup: h.markup,
        updatedAt: h.updatedAt
      }));
    }

    // If no explicit history exists, generate a simple synthetic history based on current rate
    const currentRate = this.getRate(fromCurrency, toCurrency);
    const synthetic: Array<{ fromCurrency: string; toCurrency: string; rate: number; markup: number; updatedAt: Date }> = [];
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      synthetic.push({
        fromCurrency,
        toCurrency,
        rate: currentRate,
        markup: 0.02,
        updatedAt: new Date(now - i * 60 * 1000) // 1 minute intervals
      });
    }

    return synthetic;
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    const currencies = new Set<string>();

    for (const key of this.rates.keys()) {
      const [from, to] = key.split('_');
      currencies.add(from);
      currencies.add(to);
    }

    return Array.from(currencies).sort();
  }
}

export default new FXSServiceMock();
