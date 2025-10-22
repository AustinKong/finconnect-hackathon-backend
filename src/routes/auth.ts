import { Router } from 'express';
import prisma from '../utils/prisma';
import walletService from '../services/WalletService';

const router = Router();

/**
 * POST /auth/register - Register a new user
 * Creates a user and automatically creates a wallet for them
 */
router.post('/register', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name
      }
    });

    // Create wallet for the user
    const wallet = await walletService.getOrCreateWallet(user.id);

    res.status(201).json({
      success: true,
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      wallet: {
        id: wallet.id,
        balance: wallet.balance,
        stakedAmount: wallet.stakedAmount,
        yieldEarned: wallet.yieldEarned,
        autoStake: wallet.autoStake
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

/**
 * POST /auth/login - Login a user
 * Simple login that just returns the userId if user exists
 */
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        wallet: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      wallet: user.wallet ? {
        id: user.wallet.id,
        balance: user.wallet.balance,
        stakedAmount: user.wallet.stakedAmount,
        yieldEarned: user.wallet.yieldEarned,
        autoStake: user.wallet.autoStake
      } : null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

export default router;
