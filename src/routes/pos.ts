import { Router } from 'express';
import prisma from '../utils/prisma';
import visaNetwork from '../mock/VisaNetworkMock';
import yieldManager from '../services/YieldManager';
import missionEngine from '../services/MissionEngine';
import fxService from '../mock/FXServiceMock';
import walletService from '../services/WalletService';

const router = Router();

/**
 * POST /pos/authorize - Authorize a POS transaction
 * Handles: auto-unstake, FX conversion, mission evaluation
 */
router.post('/authorize', async (req, res) => {
  try {
    const {
      cardNumber,
      merchantId,
      amount,
      currency = 'USD'
    } = req.body;

    if (!cardNumber || !merchantId || !amount) {
      return res.status(400).json({ error: 'cardNumber, merchantId, and amount are required' });
    }

    // Get card and wallet
    const card = await prisma.card.findUnique({
      where: { cardNumber },
      include: {
        wallet: {
          include: {
            user: true
          }
        }
      }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (!card.isActive) {
      return res.status(400).json({ error: 'Card is not active' });
    }

    const wallet = card.wallet;
    const userId = wallet.userId;

    // Get merchant details
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Convert currency if needed
    let finalAmount = amount;
    let fxConversion = null;

    if (merchant.currency !== 'USD') {
      const conversion = fxService.convert(amount, merchant.currency, 'USD', true);
      finalAmount = conversion.finalAmount;
      fxConversion = conversion;
    }

    // Check if total available funds (balance + staked) are sufficient
    if (wallet.balance + wallet.stakedAmount < finalAmount) {
      return res.status(400).json({
        error: 'Insufficient funds',
        balance: wallet.balance,
        stakedAmount: wallet.stakedAmount,
        required: finalAmount
      });
    }

    // Check if we need to auto-unstake
    let autoUnstakeResult = null;
    if (wallet.balance < finalAmount && wallet.stakedAmount > 0) {
      const unstakeResult = await yieldManager.autoUnstake(userId, finalAmount);
      
      if (!unstakeResult.success) {
        return res.status(400).json({
          error: 'Failed to auto-unstake funds',
          balance: wallet.balance,
          stakedAmount: wallet.stakedAmount,
          required: finalAmount
        });
      }

      autoUnstakeResult = {
        unstakedAmount: unstakeResult.unstakedAmount,
        message: 'Auto-unstaked funds to cover transaction'
      };
    }

    // Check balance again after potential auto-unstake
    const currentWallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!currentWallet || currentWallet.balance < finalAmount) {
      return res.status(400).json({
        error: 'Insufficient funds',
        balance: currentWallet?.balance || 0,
        required: finalAmount
      });
    }

    // Authorize with Visa network
    const authResult = await visaNetwork.authorize({
      cardNumber,
      amount: finalAmount,
      currency: 'USD',
      merchantId,
      metadata: {
        originalAmount: amount,
        originalCurrency: merchant.currency,
        fxConversion,
        cardId: card.id
      }
    });

    if (!authResult.success) {
      return res.status(400).json({
        error: 'Authorization failed',
        message: authResult.message
      });
    }

    // Deduct from wallet (not from card - card doesn't hold balance)
    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: currentWallet.balance - finalAmount
      }
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        amount: finalAmount,
        currency: 'USD',
        merchantId,
        description: `Purchase at ${merchant.name}`,
        status: 'COMPLETED',
        metadata: JSON.stringify({
          authorizationId: authResult.authorizationId,
          originalAmount: amount,
          originalCurrency: merchant.currency,
          fxConversion,
          autoUnstake: autoUnstakeResult,
          cardId: card.id,
          cardNumber: cardNumber.slice(-4) // Store last 4 digits for reference
        })
      }
    });

    // Evaluate missions
    const missionResult = await missionEngine.evaluateTransaction(
      userId,
      transaction.id,
      finalAmount,
      merchantId,
      merchant.category,
      merchant.currency
    );

    // Capture the transaction
    const captureResult = await visaNetwork.capture({
      authorizationId: authResult.authorizationId,
      amount: finalAmount
    });

    res.json({
      success: true,
      authorization: {
        authorizationId: authResult.authorizationId,
        status: authResult.status
      },
      capture: {
        captureId: captureResult.captureId,
        status: captureResult.status
      },
      transaction,
      merchant,
      card: {
        id: card.id,
        last4: cardNumber.slice(-4)
      },
      fxConversion,
      autoUnstake: autoUnstakeResult,
      missions: {
        updated: missionResult.missionsUpdated,
        completed: missionResult.missionsCompleted
      },
      wallet: await prisma.wallet.findUnique({ where: { userId } })
    });
  } catch (error) {
    console.error('POS authorization error:', error);
    res.status(500).json({ error: 'Failed to authorize transaction' });
  }
});

/**
 * POST /pos/refund - Refund a transaction
 */
router.post('/refund', async (req, res) => {
  try {
    const { transactionId, amount: refundAmount } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'transactionId is required' });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const amount = refundAmount || transaction.amount;

    if (amount > transaction.amount) {
      return res.status(400).json({ error: 'Refund amount exceeds transaction amount' });
    }

    // Add refund to wallet using WalletService (will auto-stake if enabled)
    const result = await walletService.addFunds(transaction.userId, amount, {
      description: `Refund for transaction ${transactionId}`,
      transactionType: 'REFUND',
      currency: transaction.currency,
      merchantId: transaction.merchantId || undefined,
      metadata: JSON.stringify({ originalTransactionId: transactionId })
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
      response.message = `Refund automatically staked: ${result.autoStaked} ${transaction.currency}`;
    }

    res.json(response);
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;
