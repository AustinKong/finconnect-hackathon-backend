import { Router } from 'express';
import fxService from '../services/FXService';

const router = Router();

/**
 * GET /fx/rates - Get all exchange rates
 */
router.get('/rates', async (req, res) => {
  try {
    const currencies = fxService.getSupportedCurrencies();
    
    res.json({
      currencies,
      baseCurrency: 'USD'
    });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ error: 'Failed to get rates' });
  }
});

/**
 * GET /fx/rate/:from/:to - Get specific exchange rate
 */
router.get('/rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;

    const rate = fxService.getRate(from.toUpperCase(), to.toUpperCase());

    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get rate error:', error);
    res.status(500).json({ error: 'Failed to get rate' });
  }
});

/**
 * POST /fx/convert - Convert currency
 */
router.post('/convert', async (req, res) => {
  try {
    const { amount, from, to, includeMarkup = true } = req.body;

    if (!amount || !from || !to) {
      return res.status(400).json({
        error: 'amount, from, and to are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be positive'
      });
    }

    const result = fxService.convert(
      amount,
      from.toUpperCase(),
      to.toUpperCase(),
      includeMarkup
    );

    res.json({
      conversion: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({ error: 'Failed to convert currency' });
  }
});

/**
 * GET /fx/history/:from/:to - Get rate history
 */
router.get('/history/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;

    const history = await fxService.getRateHistory(
      from.toUpperCase(),
      to.toUpperCase()
    );

    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      history
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get rate history' });
  }
});

/**
 * POST /fx/rate - Update exchange rate (admin)
 */
router.post('/rate', async (req, res) => {
  try {
    const { from, to, rate, markup = 0.02 } = req.body;

    if (!from || !to || !rate) {
      return res.status(400).json({
        error: 'from, to, and rate are required'
      });
    }

    if (rate <= 0) {
      return res.status(400).json({
        error: 'Rate must be positive'
      });
    }

    const result = await fxService.saveRate(
      from.toUpperCase(),
      to.toUpperCase(),
      rate,
      markup
    );

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to save rate' });
    }

    res.json({
      success: true,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      markup
    });
  } catch (error) {
    console.error('Save rate error:', error);
    res.status(500).json({ error: 'Failed to save rate' });
  }
});

export default router;
