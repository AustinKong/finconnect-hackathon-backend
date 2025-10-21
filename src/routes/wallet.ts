import { Router } from 'express';
import prisma from '../utils/prisma';
import stablecoinAdapter from '../services/StablecoinYieldAdapterMock';

const router = Router();

/**
 * GET /wallet/:userId - Get wallet details
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({
      wallet,
      yieldRate: stablecoinAdapter.getYieldRate()
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

/**
 * POST /wallet/topup - Top up wallet balance
 */
router.post('/topup', async (req, res) => {
  try {
    const { userId, amount, currency = 'USD' } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Create wallet
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          stakedAmount: 0,
          yieldEarned: 0
        }
      });
    }

    // Update wallet balance
    const updatedWallet = await prisma.wallet.update({
      where: { userId },
      data: {
        balance: wallet.balance + amount
      }
    });

    // Record transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'TOPUP',
        amount,
        currency,
        description: `Wallet top-up of ${amount} ${currency}`,
        status: 'COMPLETED'
      }
    });

    res.json({
      success: true,
      wallet: updatedWallet,
      transaction
    });
  } catch (error) {
    console.error('Top-up error:', error);
    res.status(500).json({ error: 'Failed to top up wallet' });
  }
});

/**
 * POST /wallet/stake - Stake funds for yield
 */
router.post('/stake', async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const result = await stablecoinAdapter.stake(userId, amount);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    res.json({
      success: true,
      stakedAmount: result.stakedAmount,
      wallet
    });
  } catch (error) {
    console.error('Stake error:', error);
    res.status(500).json({ error: 'Failed to stake funds' });
  }
});

/**
 * POST /wallet/unstake - Unstake funds
 */
router.post('/unstake', async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const result = await stablecoinAdapter.unstake(userId, amount);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    res.json({
      success: true,
      unstakedAmount: result.unstakedAmount,
      wallet
    });
  } catch (error) {
    console.error('Unstake error:', error);
    res.status(500).json({ error: 'Failed to unstake funds' });
  }
});

/**
 * GET /wallet/:userId/transactions - Get wallet transactions
 */
router.get('/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        merchant: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    const total = await prisma.transaction.count({
      where: { userId }
    });

    res.json({
      transactions,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

export default router;
