import { Router } from 'express';
import prisma from '../utils/prisma';
import yieldManager from '../services/YieldManager';
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
      yieldRate: yieldManager.getYieldRate()
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

/**
 * POST /wallet/topup - Top up wallet balance
 * Simulates adding funds to the wallet
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

/**
 * POST /wallet/:userId/cards - Issue a new card
 */
router.post('/:userId/cards', async (req, res) => {
  try {
    const { userId } = req.params;
    const { cardholderName } = req.body;

    if (!cardholderName) {
      return res.status(400).json({ error: 'cardholderName is required' });
    }

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Generate card details
    const cardNumber = `4${Math.random().toString().slice(2, 18)}`; // 16-digit card number starting with 4 (Visa)
    const cvv = Math.floor(Math.random() * 900 + 100).toString(); // 3-digit CVV
    const currentYear = new Date().getFullYear();
    const expiryMonth = Math.floor(Math.random() * 12) + 1; // Random month 1-12
    const expiryYear = currentYear + 3; // 3 years from now

    // Create card
    const card = await prisma.card.create({
      data: {
        walletId: wallet.id,
        cardNumber,
        cardholderName,
        expiryMonth,
        expiryYear,
        cvv,
        isActive: true
      }
    });

    console.log('[CARD_ISSUED]', { 
      card_id: card.id, 
      card_last4: cardNumber.slice(-4), 
      wallet_id: wallet.id 
    });

    res.json({
      success: true,
      card: {
        id: card.id,
        cardNumber: card.cardNumber,
        cardholderName: card.cardholderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: card.cvv,
        isActive: card.isActive,
        createdAt: card.createdAt
      }
    });
  } catch (error) {
    console.error('Issue card error:', error);
    res.status(500).json({ error: 'Failed to issue card' });
  }
});

/**
 * GET /wallet/:userId/cards - Get all cards for a wallet
 */
router.get('/:userId/cards', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        cards: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({
      success: true,
      cards: wallet.cards
    });
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ error: 'Failed to get cards' });
  }
});

/**
 * GET /wallet/:userId/cards/:cardId - Get card details
 */
router.get('/:userId/cards/:cardId', async (req, res) => {
  try {
    const { userId, cardId } = req.params;

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Get card and verify it belongs to this wallet
    const card = await prisma.card.findUnique({
      where: { id: cardId }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (card.walletId !== wallet.id) {
      return res.status(403).json({ error: 'Card does not belong to this wallet' });
    }

    res.json({
      success: true,
      card
    });
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({ error: 'Failed to get card' });
  }
});

export default router;
