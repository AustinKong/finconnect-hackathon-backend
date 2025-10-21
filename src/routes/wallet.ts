import { Router } from 'express';
import prisma from '../utils/prisma';
import stablecoinAdapter from '../services/StablecoinYieldAdapterMock';
import walletService from '../services/WalletService';

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
    const wallet = await walletService.getOrCreateWallet(userId);

    // Add funds (will auto-stake if enabled)
    const result = await walletService.addFunds(userId, amount, {
      description: `Wallet top-up of ${amount} ${currency}`,
      transactionType: 'TOPUP',
      currency
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    const response: any = {
      success: true,
      wallet: result.wallet
    };

    if (result.autoStaked) {
      response.autoStaked = result.autoStaked;
      response.message = `Funds automatically staked: ${result.autoStaked} ${currency}`;
    }

    res.json(response);
  } catch (error) {
    console.error('Top-up error:', error);
    res.status(500).json({ error: 'Failed to top up wallet' });
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

/**
 * PUT /wallet/:userId/autostake - Update auto-stake setting
 */
router.put('/:userId/autostake', async (req, res) => {
  try {
    const { userId } = req.params;
    const { autoStake } = req.body;

    if (typeof autoStake !== 'boolean') {
      return res.status(400).json({ error: 'autoStake must be a boolean' });
    }

    const result = await walletService.updateAutoStake(userId, autoStake);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.json({
      success: true,
      wallet: result.wallet,
      message: `Auto-staking ${autoStake ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    console.error('Update autostake error:', error);
    res.status(500).json({ error: 'Failed to update autostake setting' });
  }
});

export default router;
