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
 * @swagger
 * /missions:
 *   get:
 *     summary: Get all active missions
 *     description: Get a list of all active missions available on the platform
 *     tags: [Missions]
 *     responses:
 *       200:
 *         description: Missions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 missions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Mission'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /missions/{missionId}:
 *   get:
 *     summary: Get mission details
 *     description: Get detailed information about a specific mission including leaderboard
 *     tags: [Missions]
 *     parameters:
 *       - in: path
 *         name: missionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Mission ID
 *     responses:
 *       200:
 *         description: Mission details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mission:
 *                   $ref: '#/components/schemas/Mission'
 *       404:
 *         description: Mission not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /missions/user:
 *   get:
 *     summary: Get user's enrolled missions
 *     description: Get all missions that authenticated user has enrolled in
 *     tags: [Missions]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     responses:
 *       200:
 *         description: User missions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userMissions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserMission'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /missions/user/available:
 *   get:
 *     summary: Get available missions
 *     description: Get missions that authenticated user can enroll in (not already enrolled)
 *     tags: [Missions]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     responses:
 *       200:
 *         description: Available missions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 availableMissions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Mission'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /missions/enroll:
 *   post:
 *     summary: Enroll in a mission
 *     description: Enroll authenticated user in a specific mission
 *     tags: [Missions]
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
 *               - missionId
 *             properties:
 *               missionId:
 *                 type: string
 *                 description: Mission ID to enroll in
 *     responses:
 *       200:
 *         description: Successfully enrolled in mission
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 userMission:
 *                   $ref: '#/components/schemas/UserMission'
 *       400:
 *         description: Bad request (already enrolled or invalid mission)
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
 * @swagger
 * /missions/claim:
 *   post:
 *     summary: Claim mission reward
 *     description: Claim reward for a completed mission that authenticated user has enrolled in
 *     tags: [Missions]
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
 *               - missionId
 *             properties:
 *               missionId:
 *                 type: string
 *                 description: Mission ID to claim reward for
 *     responses:
 *       200:
 *         description: Reward claimed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rewardAmount:
 *                   type: number
 *                   format: double
 *                 rewardType:
 *                   type: string
 *       400:
 *         description: Bad request (mission not completed or already claimed)
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
 * @swagger
 * /missions:
 *   post:
 *     summary: Create a new mission (Admin)
 *     description: Create a new mission on the platform (admin endpoint)
 *     tags: [Missions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - type
 *               - rewardAmount
 *             properties:
 *               title:
 *                 type: string
 *                 description: Mission title
 *               description:
 *                 type: string
 *                 description: Mission description
 *               type:
 *                 type: string
 *                 enum: [SPENDING, MERCHANT, CATEGORY, TRAVEL]
 *                 description: Mission type
 *               targetValue:
 *                 type: number
 *                 format: double
 *                 description: Target value (e.g., spending amount)
 *               targetCategory:
 *                 type: string
 *                 description: Target category (for CATEGORY missions)
 *               targetMerchantId:
 *                 type: string
 *                 description: Target merchant ID (for MERCHANT missions)
 *               rewardAmount:
 *                 type: number
 *                 format: double
 *                 description: Reward amount
 *               rewardType:
 *                 type: string
 *                 enum: [CASHBACK, POINTS, MILES]
 *                 default: CASHBACK
 *                 description: Type of reward
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Mission end date
 *     responses:
 *       201:
 *         description: Mission created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mission:
 *                   $ref: '#/components/schemas/Mission'
 *       400:
 *         description: Bad request (missing required fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
