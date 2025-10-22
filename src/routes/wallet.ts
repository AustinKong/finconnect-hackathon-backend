import { Router } from 'express';
import prisma from '../utils/prisma';
import yieldManager from '../services/YieldManager';
import walletService from '../services/WalletService';
import { requireAuthMiddleware, getUserId } from '../middleware/clerkAuth';
import { ensureUserAndWallet } from '../middleware/ensureUserAndWallet';

const router = Router();

/**
 * @swagger
 * /wallet:
 *   get:
 *     summary: Get wallet details
 *     description: Get wallet details for authenticated user including balance, shares, and staked amount
 *     tags: [Wallet]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     responses:
 *       200:
 *         description: Wallet details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wallet:
 *                   $ref: '#/components/schemas/Wallet'
 *                 stakedAmount:
 *                   type: number
 *                   format: double
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const wallet = await walletService.getOrCreateWallet(userId);

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      res.json({
        wallet,
        stakedAmount: walletService.getStakedAmount(wallet),
      });
    } catch (error) {
      console.error('Get wallet error:', error);
      res.status(500).json({ error: 'Failed to get wallet' });
    }
  }
);

/**
 * @swagger
 * /wallet/topup:
 *   post:
 *     summary: Top up wallet balance
 *     description: Add funds to the wallet for authenticated user. Supports auto-staking if enabled.
 *     tags: [Wallet]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 format: double
 *                 description: Amount to add to wallet (must be positive)
 *                 example: 500
 *               currency:
 *                 type: string
 *                 description: Currency code
 *                 default: USD
 *                 example: USD
 *     responses:
 *       200:
 *         description: Wallet topped up successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 wallet:
 *                   $ref: '#/components/schemas/Wallet'
 *                 autoStaked:
 *                   type: number
 *                   format: double
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request (invalid amount)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/topup',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { amount, currency = 'USD' } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!amount) {
        return res.status(400).json({ error: 'amount is required' });
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
  }
);

/**
 * @swagger
 * /wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     description: Get transaction history for authenticated user with pagination
 *     tags: [Wallet]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *         description: Maximum number of transactions to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of transactions to skip
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/transactions',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { limit = '50', offset = '0' } = req.query;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  }
);

/**
 * @swagger
 * /wallet/autostake:
 *   put:
 *     summary: Update auto-stake setting
 *     description: Enable or disable auto-staking feature for authenticated user
 *     tags: [Wallet]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - autoStake
 *             properties:
 *               autoStake:
 *                 type: boolean
 *                 description: Enable or disable auto-staking
 *                 example: true
 *     responses:
 *       200:
 *         description: Auto-stake setting updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 wallet:
 *                   $ref: '#/components/schemas/Wallet'
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request (invalid autoStake value)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/autostake',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { autoStake } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  }
);

/**
 * @swagger
 * /wallet/cards:
 *   post:
 *     summary: Issue a new virtual card
 *     description: Create a new virtual card linked to the authenticated user's wallet
 *     tags: [Cards]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardholderName
 *             properties:
 *               cardholderName:
 *                 type: string
 *                 description: Name to appear on the card
 *                 example: Alice Traveler
 *     responses:
 *       200:
 *         description: Card issued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 card:
 *                   $ref: '#/components/schemas/Card'
 *       400:
 *         description: Bad request (missing cardholderName)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/cards',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { cardholderName } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  }
);

/**
 * @swagger
 * /wallet/cards:
 *   get:
 *     summary: Get all cards
 *     description: Get all virtual cards associated with authenticated user's wallet
 *     tags: [Cards]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     responses:
 *       200:
 *         description: Cards retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 cards:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Card'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/cards',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  }
);

/**
 * @swagger
 * /wallet/cards/{cardId}:
 *   get:
 *     summary: Get specific card details
 *     description: Get details for a specific virtual card owned by authenticated user
 *     tags: [Cards]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *         description: Card ID
 *     responses:
 *       200:
 *         description: Card details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 card:
 *                   $ref: '#/components/schemas/Card'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Card does not belong to this wallet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Card or wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/cards/:cardId',
  requireAuthMiddleware,
  ensureUserAndWallet,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { cardId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  }
);

export default router;
