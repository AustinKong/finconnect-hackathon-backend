import { Router } from 'express';
import stablecoinAdapter from '../services/StablecoinYieldAdapterMock';
import visaNetwork from '../services/VisaNetworkMock';

const router = Router();

/**
 * POST /mock/stablecoin/stake - Mock stablecoin stake
 */
router.post('/stablecoin/stake', async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const result = await stablecoinAdapter.stake(userId, amount);

    res.json(result);
  } catch (error) {
    console.error('Mock stake error:', error);
    res.status(500).json({ error: 'Failed to stake' });
  }
});

/**
 * POST /mock/stablecoin/unstake - Mock stablecoin unstake
 */
router.post('/stablecoin/unstake', async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const result = await stablecoinAdapter.unstake(userId, amount);

    res.json(result);
  } catch (error) {
    console.error('Mock unstake error:', error);
    res.status(500).json({ error: 'Failed to unstake' });
  }
});

/**
 * POST /mock/stablecoin/yield - Mock calculate yield
 */
router.post('/stablecoin/yield', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await stablecoinAdapter.calculateYield(userId);

    res.json(result);
  } catch (error) {
    console.error('Mock calculate yield error:', error);
    res.status(500).json({ error: 'Failed to calculate yield' });
  }
});

/**
 * GET /mock/stablecoin/rate - Get current yield rate
 */
router.get('/stablecoin/rate', (req, res) => {
  try {
    const rate = stablecoinAdapter.getYieldRate();

    res.json({
      yieldRate: rate,
      apy: `${(rate * 100).toFixed(2)}%`,
      dailyRate: rate / 365
    });
  } catch (error) {
    console.error('Mock get rate error:', error);
    res.status(500).json({ error: 'Failed to get rate' });
  }
});

/**
 * POST /mock/visa/authorize - Mock Visa authorization
 */
router.post('/visa/authorize', async (req, res) => {
  try {
    const { cardNumber, amount, currency, merchantId, metadata } = req.body;

    if (!cardNumber || !amount || !currency || !merchantId) {
      return res.status(400).json({
        error: 'cardNumber, amount, currency, and merchantId are required'
      });
    }

    const result = await visaNetwork.authorize({
      cardNumber,
      amount,
      currency,
      merchantId,
      metadata
    });

    res.json(result);
  } catch (error) {
    console.error('Mock authorize error:', error);
    res.status(500).json({ error: 'Failed to authorize' });
  }
});

/**
 * POST /mock/visa/capture - Mock Visa capture
 */
router.post('/visa/capture', async (req, res) => {
  try {
    const { authorizationId, amount } = req.body;

    if (!authorizationId) {
      return res.status(400).json({ error: 'authorizationId is required' });
    }

    const result = await visaNetwork.capture({
      authorizationId,
      amount
    });

    res.json(result);
  } catch (error) {
    console.error('Mock capture error:', error);
    res.status(500).json({ error: 'Failed to capture' });
  }
});

/**
 * GET /mock/visa/authorization/:authorizationId - Get authorization details
 */
router.get('/visa/authorization/:authorizationId', (req, res) => {
  try {
    const { authorizationId } = req.params;

    const authorization = visaNetwork.getAuthorization(authorizationId);

    if (!authorization) {
      return res.status(404).json({ error: 'Authorization not found' });
    }

    res.json(authorization);
  } catch (error) {
    console.error('Mock get authorization error:', error);
    res.status(500).json({ error: 'Failed to get authorization' });
  }
});

/**
 * GET /mock/visa/capture/:captureId - Get capture details
 */
router.get('/visa/capture/:captureId', (req, res) => {
  try {
    const { captureId } = req.params;

    const capture = visaNetwork.getCapture(captureId);

    if (!capture) {
      return res.status(404).json({ error: 'Capture not found' });
    }

    res.json(capture);
  } catch (error) {
    console.error('Mock get capture error:', error);
    res.status(500).json({ error: 'Failed to get capture' });
  }
});

/**
 * GET /mock/visa/fee/:amount - Calculate processing fee
 */
router.get('/visa/fee/:amount', (req, res) => {
  try {
    const amount = parseFloat(req.params.amount);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const fee = visaNetwork.getProcessingFee(amount);

    res.json({
      amount,
      fee,
      total: amount + fee,
      feePercentage: '2.9%'
    });
  } catch (error) {
    console.error('Mock get fee error:', error);
    res.status(500).json({ error: 'Failed to calculate fee' });
  }
});

export default router;
