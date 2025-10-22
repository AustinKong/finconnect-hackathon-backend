import { Router } from 'express';
import prisma from '../utils/prisma';
import walletService from '../services/WalletService';
import { requireAuthMiddleware, getUserId } from '../middleware/clerkAuth';

const router = Router();

/**
 * @swagger
 * /analytics/user:
 *   get:
 *     summary: Get user analytics
 *     description: Get comprehensive analytics for authenticated user including wallet, transactions, spending, and missions
 *     tags: [Analytics]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wallet:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       format: double
 *                     stakedAmount:
 *                       type: number
 *                       format: double
 *                     yieldEarned:
 *                       type: number
 *                       format: double
 *                     totalValue:
 *                       type: number
 *                       format: double
 *                 transactions:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     totalSpent:
 *                       type: number
 *                       format: double
 *                     totalTopups:
 *                       type: number
 *                       format: double
 *                 spending:
 *                   type: object
 *                   properties:
 *                     byCategory:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           total:
 *                             type: number
 *                             format: double
 *                           count:
 *                             type: integer
 *                 missions:
 *                   type: object
 *                   properties:
 *                     completed:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     rewardsEarned:
 *                       type: number
 *                       format: double
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

    // Get wallet info
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    // Calculate staked amount from shares
    const stakedAmount = wallet ? await walletService.getStakedAmount(wallet.shares) : 0;

    // Get transaction stats
    const totalTransactions = await prisma.transaction.count({
      where: { userId }
    });

    const totalSpent = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'PURCHASE'
      },
      _sum: {
        amount: true
      }
    });

    const totalTopups = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'TOPUP'
      },
      _sum: {
        amount: true
      }
    });

    // Get spending by category
    const spendingByCategory = await prisma.transaction.groupBy({
      by: ['merchantId'],
      where: {
        userId,
        type: 'PURCHASE',
        merchantId: { not: null }
      },
      _sum: {
        amount: true
      },
      _count: {
        id: true
      }
    });

    // Enrich with merchant data
    const merchantIds = spendingByCategory.map(s => s.merchantId).filter(Boolean) as string[];
    const merchants = await prisma.merchant.findMany({
      where: {
        id: { in: merchantIds }
      }
    });

    const merchantMap = new Map(merchants.map(m => [m.id, m]));
    
    const categorySpending: Record<string, { total: number; count: number }> = {};
    
    spendingByCategory.forEach(item => {
      if (item.merchantId) {
        const merchant = merchantMap.get(item.merchantId);
        if (merchant) {
          const category = merchant.category;
          if (!categorySpending[category]) {
            categorySpending[category] = { total: 0, count: 0 };
          }
          categorySpending[category].total += item._sum.amount || 0;
          categorySpending[category].count += item._count.id;
        }
      }
    });

    // Get mission stats
    const missionStats = await prisma.userMission.groupBy({
      by: ['isCompleted'],
      where: { userId },
      _count: {
        id: true
      }
    });

    const completedMissions = missionStats.find(s => s.isCompleted)?._count.id || 0;
    const activeMissions = missionStats.find(s => !s.isCompleted)?._count.id || 0;

    // Get rewards earned
    const rewardsEarned = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'MISSION_REWARD'
      },
      _sum: {
        amount: true
      }
    });

    res.json({
      wallet: {
        balance: wallet?.balance || 0,
        stakedAmount: stakedAmount,
        yieldEarned: wallet?.yieldEarned || 0,
        totalValue: (wallet?.balance || 0) + stakedAmount
      },
      transactions: {
        total: totalTransactions,
        totalSpent: totalSpent._sum.amount || 0,
        totalTopups: totalTopups._sum.amount || 0
      },
      spending: {
        byCategory: categorySpending
      },
      missions: {
        completed: completedMissions,
        active: activeMissions,
        rewardsEarned: rewardsEarned._sum.amount || 0
      }
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * @swagger
 * /analytics/user/spending-trends:
 *   get:
 *     summary: Get spending trends
 *     description: Get spending trends for authenticated user over specified time period
 *     tags: [Analytics]
 *     security:
 *       - ClerkAuth: []
 *       - TestUserId: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           default: "30"
 *         description: Number of days to analyze (default 30)
 *     responses:
 *       200:
 *         description: Spending trends retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                 transactions:
 *                   type: integer
 *                 dailySpending:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                     format: double
 *                 total:
 *                   type: number
 *                   format: double
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/user/spending-trends', requireAuthMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { period = '30' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const daysAgo = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'PURCHASE',
        createdAt: { gte: startDate }
      },
      include: {
        merchant: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Group by day
    const dailySpending: Record<string, number> = {};
    transactions.forEach(tx => {
      const date = tx.createdAt.toISOString().split('T')[0];
      if (!dailySpending[date]) {
        dailySpending[date] = 0;
      }
      dailySpending[date] += tx.amount;
    });

    res.json({
      period: `${daysAgo} days`,
      transactions: transactions.length,
      dailySpending,
      total: transactions.reduce((sum, tx) => sum + tx.amount, 0)
    });
  } catch (error) {
    console.error('Get spending trends error:', error);
    res.status(500).json({ error: 'Failed to get spending trends' });
  }
});

/**
 * @swagger
 * /analytics/global:
 *   get:
 *     summary: Get global platform analytics
 *     description: Get aggregated analytics across all users on the platform
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Global analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: integer
 *                 wallets:
 *                   type: integer
 *                 transactions:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     volume:
 *                       type: number
 *                       format: double
 *                 staking:
 *                   type: object
 *                   properties:
 *                     totalStaked:
 *                       type: number
 *                       format: double
 *                 missions:
 *                   type: object
 *                   properties:
 *                     active:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/global', async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalWallets = await prisma.wallet.count();
    const totalTransactions = await prisma.transaction.count();

    const totalVolume = await prisma.transaction.aggregate({
      _sum: {
        amount: true
      }
    });

    // Calculate total staked from shares
    const allWallets = await prisma.wallet.findMany({
      select: {
        shares: true
      }
    });
    
    const totalShares = allWallets.reduce((sum, w) => sum + w.shares, 0);
    const totalStaked = await walletService.getStakedAmount(totalShares);

    const activeMissions = await prisma.mission.count({
      where: { isActive: true }
    });

    const completedMissions = await prisma.userMission.count({
      where: { isCompleted: true }
    });

    res.json({
      users: totalUsers,
      wallets: totalWallets,
      transactions: {
        count: totalTransactions,
        volume: totalVolume._sum.amount || 0
      },
      staking: {
        totalStaked: totalStaked
      },
      missions: {
        active: activeMissions,
        completed: completedMissions
      }
    });
  } catch (error) {
    console.error('Get global analytics error:', error);
    res.status(500).json({ error: 'Failed to get global analytics' });
  }
});

/**
 * @swagger
 * /analytics/summary:
 *   get:
 *     summary: Get summary analytics
 *     description: Get comprehensive summary analytics including transactions, cross-border spending, missions, and staking. Uses authenticated user if no userId query parameter is provided.
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID (for admin access, otherwise uses authenticated user)
 *     responses:
 *       200:
 *         description: Summary analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     purchases:
 *                       type: integer
 *                     totalVolume:
 *                       type: number
 *                       format: double
 *                 crossBorder:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     volume:
 *                       type: number
 *                       format: double
 *                 missions:
 *                   type: object
 *                   properties:
 *                     completed:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     rewardsEarned:
 *                       type: number
 *                       format: double
 *                 staking:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     shares:
 *                       type: number
 *                       format: double
 *                     stakedValue:
 *                       type: number
 *                       format: double
 *                     yieldEarned:
 *                       type: number
 *                       format: double
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/summary', async (req, res) => {
  try {
    // Try to get userId from query parameter first (for admin access), then from Clerk auth
    let userId = req.query.userId as string | undefined;
    
    if (!userId) {
      // If no userId in query, try to get from Clerk auth
      userId = getUserId(req) || undefined;
    }

    // Transaction counts and volumes
    const totalTransactions = await prisma.transaction.count({
      where: userId ? { userId: userId as string } : {}
    });

    const purchaseTransactions = await prisma.transaction.count({
      where: {
        ...(userId ? { userId: userId as string } : {}),
        type: 'PURCHASE'
      }
    });

    const totalVolume = await prisma.transaction.aggregate({
      where: userId ? { userId: userId as string } : {},
      _sum: {
        amount: true
      }
    });

    // Cross-border transactions (transactions with merchants in non-USD currencies)
    const crossBorderTransactions = await prisma.transaction.findMany({
      where: {
        ...(userId ? { userId: userId as string } : {}),
        type: 'PURCHASE',
        merchantId: { not: null }
      },
      include: {
        merchant: true
      }
    });

    const crossBorderCount = crossBorderTransactions.filter(tx => 
      tx.merchant && tx.merchant.currency !== 'USD'
    ).length;

    const crossBorderVolume = crossBorderTransactions
      .filter(tx => tx.merchant && tx.merchant.currency !== 'USD')
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Mission statistics
    const completedMissionsCount = await prisma.userMission.count({
      where: {
        ...(userId ? { userId: userId as string } : {}),
        isCompleted: true
      }
    });

    const activeMissionsCount = await prisma.userMission.count({
      where: {
        ...(userId ? { userId: userId as string } : {}),
        isCompleted: false
      }
    });

    // Rewards earned from missions
    const rewardsEarned = await prisma.transaction.aggregate({
      where: {
        ...(userId ? { userId: userId as string } : {}),
        type: 'MISSION_REWARD'
      },
      _sum: {
        amount: true
      }
    });

    // Staking information
    let stakingInfo = null;
    if (userId) {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: userId as string }
      });
      if (wallet) {
        const stakedAmount = await walletService.getStakedAmount(wallet.shares);
        stakingInfo = {
          shares: wallet.shares,
          stakedValue: stakedAmount,
          yieldEarned: wallet.yieldEarned
        };
      }
    }

    res.json({
      transactions: {
        total: totalTransactions,
        purchases: purchaseTransactions,
        totalVolume: totalVolume._sum.amount || 0
      },
      crossBorder: {
        count: crossBorderCount,
        volume: crossBorderVolume
      },
      missions: {
        completed: completedMissionsCount,
        active: activeMissionsCount,
        rewardsEarned: rewardsEarned._sum.amount || 0
      },
      ...(stakingInfo && { staking: stakingInfo })
    });
  } catch (error) {
    console.error('Get summary analytics error:', error);
    res.status(500).json({ error: 'Failed to get summary analytics' });
  }
});

export default router;
