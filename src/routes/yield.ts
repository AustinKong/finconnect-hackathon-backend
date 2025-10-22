import { Router } from 'express';
import yieldManager from '../services/YieldManager';
import lendingProtocol from '../mock/LendingProtocolMock';
import prisma from '../utils/prisma';

const router = Router();

/**
 * @swagger
 * /yield/accrue:
 *   post:
 *     summary: Manually accrue interest
 *     description: Trigger manual interest accrual (used for testing to simulate time passage)
 *     tags: [Yield]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               now_sec:
 *                 type: integer
 *                 description: Optional timestamp in seconds to simulate accrual up to this time
 *     responses:
 *       200:
 *         description: Interest accrued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 oldRate:
 *                   type: number
 *                   format: double
 *                 newRate:
 *                   type: number
 *                   format: double
 *                 interestEarned:
 *                   type: number
 *                   format: double
 *                 message:
 *                   type: string
 *       400:
 *         description: Failed to accrue interest
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /yield/rate:
 *   get:
 *     summary: Get current yield rate
 *     description: Get the current yield rate, exchange rate, and calculated APY
 *     tags: [Yield]
 *     responses:
 *       200:
 *         description: Yield rate retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 yieldRate:
 *                   type: number
 *                   format: double
 *                 exchangeRate:
 *                   type: number
 *                   format: double
 *                 apy:
 *                   type: number
 *                   format: double
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /yield/stats:
 *   get:
 *     summary: Get yield statistics
 *     description: Get comprehensive yield statistics including pool data and performance metrics
 *     tags: [Yield]
 *     responses:
 *       200:
 *         description: Yield statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   description: Yield statistics object
 *       400:
 *         description: Failed to get yield stats
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
