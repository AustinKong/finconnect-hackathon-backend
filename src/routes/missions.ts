import { Router } from 'express';
import prisma from '../utils/prisma';
import missionEngine from '../services/MissionEngine';
import walletService from '../services/WalletService';
import { requireAuthMiddleware, getUserId } from '../middleware/clerkAuth';

const router = Router();

/**
 * POST /missions/claim-prototype - Simulate completing an arbitrary mission and credit reward
 * This is a prototype endpoint for testing mission rewards
 * Requires Clerk authentication
 */
router.post('/claim-prototype', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rewardAmount } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!rewardAmount || typeof rewardAmount !== 'number' || rewardAmount <= 0) {
      return res.status(400).json({ error: 'rewardAmount is required and must be a positive number' });
    }

    // Get or create wallet
    const wallet = await walletService.getOrCreateWallet(userId);

    // Add reward to wallet using WalletService (will auto-stake if enabled)
    const result = await walletService.addFunds(userId, rewardAmount, {
      description: `Mission reward (prototype): ${rewardAmount} USD`,
      transactionType: 'MISSION_REWARD',
      currency: 'USD',
      metadata: JSON.stringify({ prototype: true })
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    const autoStaked = result.autoStaked !== undefined && result.autoStaked > 0;

    console.log('[REWARD_ISSUED]', { 
      prototype: true,
      reward_usdc_cents: Math.round(rewardAmount * 100), 
      auto_staked: autoStaked 
    });

    res.json({
      success: true,
      rewardAmount,
      wallet: result.wallet,
      autoStaked: result.autoStaked,
      message: autoStaked 
        ? `Reward of ${rewardAmount} USD credited and auto-staked`
        : `Reward of ${rewardAmount} USD credited to wallet`
    });
  } catch (error) {
    console.error('Claim prototype reward error:', error);
    res.status(500).json({ error: 'Failed to claim prototype reward' });
  }
});

/**
 * GET /missions - Get all active missions
 */
router.get('/', async (req, res) => {
  try {
    const missions = await prisma.mission.findMany({
      where: {
        isActive: true,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } }
        ]
      },
      include: {
        targetMerchant: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ missions });
  } catch (error) {
    console.error('Get missions error:', error);
    res.status(500).json({ error: 'Failed to get missions' });
  }
});

/**
 * GET /missions/:missionId - Get mission details
 */
router.get('/:missionId', async (req, res) => {
  try {
    const { missionId } = req.params;

    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        targetMerchant: true,
        userMissions: {
          take: 10,
          orderBy: {
            completedAt: 'desc'
          },
          where: {
            isCompleted: true
          },
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    res.json({ mission });
  } catch (error) {
    console.error('Get mission error:', error);
    res.status(500).json({ error: 'Failed to get mission' });
  }
});

/**
 * GET /missions/user - Get authenticated user's missions
 */
router.get('/user', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userMissions = await missionEngine.getUserMissions(userId);

    res.json({ userMissions });
  } catch (error) {
    console.error('Get user missions error:', error);
    res.status(500).json({ error: 'Failed to get user missions' });
  }
});

/**
 * GET /missions/user/available - Get available missions for authenticated user
 */
router.get('/user/available', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const availableMissions = await missionEngine.getAvailableMissions(userId);

    res.json({ availableMissions });
  } catch (error) {
    console.error('Get available missions error:', error);
    res.status(500).json({ error: 'Failed to get available missions' });
  }
});

/**
 * POST /missions/enroll - Enroll authenticated user in a mission
 */
router.post('/enroll', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { missionId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!missionId) {
      return res.status(400).json({ error: 'missionId is required' });
    }

    const result = await missionEngine.enrollInMission(userId, missionId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      userMission: result.userMission
    });
  } catch (error) {
    console.error('Enroll in mission error:', error);
    res.status(500).json({ error: 'Failed to enroll in mission' });
  }
});

/**
 * POST /missions/claim - Claim mission reward for authenticated user
 */
router.post('/claim', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { missionId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!missionId) {
      return res.status(400).json({ error: 'missionId is required' });
    }

    const result = await missionEngine.claimReward(userId, missionId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      rewardAmount: result.rewardAmount,
      rewardType: result.rewardType
    });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

/**
 * POST /missions - Create a new mission (admin)
 */
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      targetValue,
      targetCategory,
      targetMerchantId,
      rewardAmount,
      rewardType = 'CASHBACK',
      endDate
    } = req.body;

    if (!title || !description || !type || !rewardAmount) {
      return res.status(400).json({
        error: 'title, description, type, and rewardAmount are required'
      });
    }

    const mission = await prisma.mission.create({
      data: {
        title,
        description,
        type,
        targetValue,
        targetCategory,
        targetMerchantId,
        rewardAmount,
        rewardType,
        endDate: endDate ? new Date(endDate) : null,
        isActive: true
      },
      include: {
        targetMerchant: true
      }
    });

    res.status(201).json({ mission });
  } catch (error) {
    console.error('Create mission error:', error);
    res.status(500).json({ error: 'Failed to create mission' });
  }
});

export default router;
