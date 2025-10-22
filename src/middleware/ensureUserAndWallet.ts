import prisma from '../utils/prisma';
import walletService from '../services/WalletService';
import { getUserId } from './clerkAuth';

/**
 * Middleware to ensure a user and wallet exist for the authenticated Clerk user.
 * If not, creates them.
 */
export async function ensureUserAndWallet(req, res, next) {
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
