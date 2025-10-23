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
    const wallet = await walletService.getOrCreateWallet(userId);

    const cardNumber = `4${Math.random().toString().slice(2, 18)}`; // 16-digit card number starting with 4 (Visa)
    const cvv = Math.floor(Math.random() * 900 + 100).toString(); // 3-digit CVV
    const currentYear = new Date().getFullYear();
    const expiryMonth = Math.floor(Math.random() * 12) + 1; // Random month 1-12
    const expiryYear = currentYear + 3; // 3 years from now

    const cardId = await prisma.card.create({
      data: {
        walletId: wallet.id,
        cardNumber: '0000-0000-0000-0000', // Placeholder card number
        cardholderName: "cardholder",
        expiryMonth,
        expiryYear,
        cvv,
        isActive: true,

      }
    })

    console.log('[CARD_ISSUED]', { card_id: cardId, cardNumber: "0000-0000-0000-0000", wallet_id: wallet.id });
  }

  next();
}
