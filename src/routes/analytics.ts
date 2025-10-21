import { Router } from 'express';
import prisma from '../utils/prisma';

const router = Router();

/**
 * GET /analytics/user/:userId - Get user analytics
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get wallet info
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

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
        stakedAmount: wallet?.stakedAmount || 0,
        yieldEarned: wallet?.yieldEarned || 0,
        totalValue: (wallet?.balance || 0) + (wallet?.stakedAmount || 0)
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
 * GET /analytics/user/:userId/spending-trends - Get spending trends
 */
router.get('/user/:userId/spending-trends', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30' } = req.query;

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
 * GET /analytics/global - Get global analytics
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

    const totalStaked = await prisma.wallet.aggregate({
      _sum: {
        stakedAmount: true
      }
    });

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
        totalStaked: totalStaked._sum.stakedAmount || 0
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

export default router;
