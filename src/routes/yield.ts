import { Router } from 'express';
import yieldManager from '../services/YieldManager';
import lendingProtocol from '../mock/LendingProtocolMock';
import prisma from '../utils/prisma';

const router = Router();

/**
 * POST /yield/accrue - Manually accrue interest
 * Used for testing to simulate time passage
 * 
 * Body:
 *   - now_sec: Optional timestamp in seconds to simulate accrual up to this time
 */
router.post('/accrue', async (req, res) => {
  try {
    const { now_sec } = req.body;

    // If now_sec is provided, we need to update the lastAccrualAt to simulate time passage
    if (now_sec) {
      const targetDate = new Date(now_sec * 1000);
      const protocol = await lendingProtocol.getProtocol();
      
      // Update lastAccrualAt to the target date to simulate time passage
      await prisma.lendingProtocol.update({
        where: { id: protocol.id },
        data: {
          lastAccrualAt: targetDate
        }
      });
    }

    // Accrue interest
    const result = await yieldManager.syncYield();

    if (!result.success) {
      return res.status(400).json({ 
        error: 'Failed to accrue interest',
        message: 'Interest accrual operation failed'
      });
    }

    res.json({
      success: true,
      oldRate: result.exchangeRate,
      newRate: result.exchangeRate,
      interestEarned: result.interestEarned,
      message: 'Interest accrued successfully'
    });
  } catch (error) {
    console.error('Accrue interest error:', error);
    res.status(500).json({ error: 'Failed to accrue interest' });
  }
});

/**
 * GET /yield/rate - Get current yield rate
 */
router.get('/rate', async (req, res) => {
  try {
    const rate = yieldManager.getYieldRate();
    const exchangeRate = await lendingProtocol.getExchangeRate();

    res.json({
      yieldRate: rate,
      exchangeRate,
      apy: lendingProtocol.calculateAPY(rate)
    });
  } catch (error) {
    console.error('Get yield rate error:', error);
    res.status(500).json({ error: 'Failed to get yield rate' });
  }
});

/**
 * GET /yield/stats - Get yield statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await yieldManager.getStats();

    if (!stats.success || !stats.stats) {
      return res.status(400).json({ error: 'Failed to get yield stats' });
    }

    res.json({
      success: true,
      stats: stats.stats
    });
  } catch (error) {
    console.error('Get yield stats error:', error);
    res.status(500).json({ error: 'Failed to get yield stats' });
  }
});

export default router;
