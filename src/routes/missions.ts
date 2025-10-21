import { Router } from 'express';
import prisma from '../utils/prisma';
import missionEngine from '../services/MissionEngine';

const router = Router();

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
 * GET /missions/user/:userId - Get user's missions
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userMissions = await missionEngine.getUserMissions(userId);

    res.json({ userMissions });
  } catch (error) {
    console.error('Get user missions error:', error);
    res.status(500).json({ error: 'Failed to get user missions' });
  }
});

/**
 * GET /missions/user/:userId/available - Get available missions for user
 */
router.get('/user/:userId/available', async (req, res) => {
  try {
    const { userId } = req.params;

    const availableMissions = await missionEngine.getAvailableMissions(userId);

    res.json({ availableMissions });
  } catch (error) {
    console.error('Get available missions error:', error);
    res.status(500).json({ error: 'Failed to get available missions' });
  }
});

/**
 * POST /missions/enroll - Enroll in a mission
 */
router.post('/enroll', async (req, res) => {
  try {
    const { userId, missionId } = req.body;

    if (!userId || !missionId) {
      return res.status(400).json({ error: 'userId and missionId are required' });
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
 * POST /missions/claim - Claim mission reward
 */
router.post('/claim', async (req, res) => {
  try {
    const { userId, missionId } = req.body;

    if (!userId || !missionId) {
      return res.status(400).json({ error: 'userId and missionId are required' });
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
