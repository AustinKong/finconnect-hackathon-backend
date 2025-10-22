import { Router } from 'express';
import prisma from '../utils/prisma';
import visaNetwork from '../mock/VisaNetworkMock';
import yieldManager from '../services/YieldManager';
import missionEngine from '../services/MissionEngine';
import fxService from '../mock/FXServiceMock';
import walletService from '../services/WalletService';

const router = Router();

/**
 * @swagger
 * /pos/authorize:
 *   post:
 *     summary: Authorize a POS transaction
 *     description: Authorize a purchase using card number. Handles auto-unstake, FX conversion, and mission evaluation.
 *     tags: [POS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardNumber
 *               - merchantId
 *               - amount
 *             properties:
 *               cardNumber:
 *                 type: string
 *                 description: Card number to use for payment
 *                 example: "4123456789012345"
 *               merchantId:
 *                 type: string
 *                 description: Merchant ID
 *               amount:
 *                 type: number
 *                 format: double
 *                 description: Transaction amount
 *                 example: 100
 *               currency:
 *                 type: string
 *                 description: Currency code
 *                 default: USD
 *                 example: USD
 *     responses:
 *       200:
 *         description: Transaction authorized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 authorization:
 *                   type: object
 *                   properties:
 *                     authorizationId:
 *                       type: string
 *                     status:
 *                       type: string
 *                 capture:
 *                   type: object
 *                   properties:
 *                     captureId:
 *                       type: string
 *                     status:
 *                       type: string
 *                 transaction:
 *                   $ref: '#/components/schemas/Transaction'
 *                 merchant:
 *                   $ref: '#/components/schemas/Merchant'
 *                 card:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     last4:
 *                       type: string
 *                 fxConversion:
 *                   type: object
 *                   nullable: true
 *                 autoUnstake:
 *                   type: object
 *                   nullable: true
 *                 missions:
 *                   type: object
 *                   properties:
 *                     updated:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                 wallet:
 *                   $ref: '#/components/schemas/Wallet'
 *       400:
 *         description: Bad request (missing parameters or insufficient funds)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Card or merchant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

    // Calculate staked amount from shares (single source of truth)
    const stakedAmount = await walletService.getStakedAmount(wallet.shares);

    // Get merchant details
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    console.log('[POS_AUTH_REQUEST]', { 
      amount_foreign_cents: Math.round(amount * 100), 
      currency: merchant.currency, 
      merchant_id: merchantId, 
      country: merchant.country, 
      card_token: cardNumber.slice(-8) 
    });

    // Convert currency if needed
    let finalAmount = amount;
    let fxConversion = null;

    if (merchant.currency !== 'USD') {
      const conversion = fxService.convert(amount, merchant.currency, 'USD', true);
      finalAmount = conversion.finalAmount;
      fxConversion = conversion;

      console.log('[FX_QUOTE_APPLIED]', { 
        rate: conversion.rate, 
        markup_bps: Math.round(conversion.markup * 10000), 
        source: 'FXServiceMock', 
        original_cents: Math.round(conversion.originalAmount * 100), 
        converted_usd_cents: Math.round(conversion.convertedAmount * 100), 
        final_usd_cents: Math.round(conversion.finalAmount * 100) 
      });
    }

    // Check if total available funds (balance + staked) are sufficient
    if (wallet.balance + stakedAmount < finalAmount) {
      return res.status(400).json({
        error: 'Insufficient funds',
        balance: wallet.balance,
        stakedAmount: stakedAmount,
        required: finalAmount
      });
    }

    // Check if we need to auto-unstake
    let autoUnstakeResult = null;
    if (wallet.balance < finalAmount && stakedAmount > 0) {
      const unstakeResult = await walletService.autoUnstakeForPOS(userId, finalAmount);
      
      if (!unstakeResult.success) {
        return res.status(400).json({
          error: 'Failed to auto-unstake funds',
          balance: wallet.balance,
          stakedAmount: stakedAmount,
          required: finalAmount,
          message: unstakeResult.message
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

    if (!currentWallet || currentWallet.balance < finalAmount - 0.01) { // Allow small floating point differences
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
 * @swagger
 * /pos/refund:
 *   post:
 *     summary: Refund a transaction
 *     description: Process a refund for a previous transaction. Supports auto-staking if enabled.
 *     tags: [POS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *             properties:
 *               transactionId:
 *                 type: string
 *                 description: Transaction ID to refund
 *               amount:
 *                 type: number
 *                 format: double
 *                 description: Amount to refund (optional, defaults to full transaction amount)
 *     responses:
 *       200:
 *         description: Refund processed successfully
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
 *         description: Bad request (invalid amount or missing transactionId)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
