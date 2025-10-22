import prisma from '../utils/prisma';
import walletService from '../services/WalletService';
import { getUserId } from './clerkAuth';

/**
 * Middleware to ensure a user and wallet exist for the authenticated Clerk user.
 * If not, creates them.
 */
import { Request, Response, NextFunction } from 'express';

export async function ensureUserAndWallet(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if user exists
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    // Create user (add any required fields as needed)
    user = await prisma.user.create({
      data: {
        id: userId,
        email: req.body.email || 'unknown@example.com',
        name: req.body.name || 'Unknown User',
        // ...add other default fields if needed...
      }
    });
  }

  // Check if wallet exists
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    // Create wallet
    await walletService.getOrCreateWallet(userId);
  }

  next();
}
