import prisma from '../utils/prisma';
import walletService from './WalletService';

export class MissionEngine {
  /**
   * Evaluate if a transaction triggers mission progress
   */
  async evaluateTransaction(
    userId: string,
    transactionId: string,
    amount: number,
    merchantId?: string,
    category?: string,
    currency?: string
  ): Promise<{ missionsUpdated: number; missionsCompleted: number }> {
    try {
      let missionsUpdated = 0;
      let missionsCompleted = 0;

      // Get user's active missions
      const userMissions = await prisma.userMission.findMany({
        where: {
          userId,
          isCompleted: false
        },
        include: {
          mission: {
            include: {
              targetMerchant: true
            }
          }
        }
      });

      for (const userMission of userMissions) {
        const mission = userMission.mission;

        if (!mission.isActive) continue;

        // Check if mission has expired
        if (mission.endDate && new Date() > mission.endDate) continue;

        let shouldUpdate = false;
        let progressIncrement = 0;

        // Evaluate based on mission type
        switch (mission.type) {
          case 'SPEND_AMOUNT':
            // Mission: Spend a certain amount
            shouldUpdate = true;
            progressIncrement = amount;
            break;

          case 'SPEND_CATEGORY':
            // Mission: Spend in a specific category
            if (category && mission.targetCategory === category) {
              shouldUpdate = true;
              progressIncrement = amount;
            }
            break;

          case 'SPEND_MERCHANT':
            // Mission: Spend at a specific merchant
            if (merchantId && mission.targetMerchantId === merchantId) {
              shouldUpdate = true;
              progressIncrement = amount;
            }
            break;

          case 'MULTI_COUNTRY':
            // Mission: Spend in multiple countries (would need transaction metadata)
            // This is simplified - in real implementation would track unique countries
            shouldUpdate = true;
            progressIncrement = 1; // Count as 1 transaction
            break;

          default:
            console.log(`Unknown mission type: ${mission.type}`);
        }

        if (shouldUpdate) {
          const newProgress = userMission.progress + progressIncrement;
          const targetValue = mission.targetValue || 0;
          const isCompleted = newProgress >= targetValue;

          await prisma.userMission.update({
            where: { id: userMission.id },
            data: {
              progress: newProgress,
              isCompleted,
              completedAt: isCompleted ? new Date() : null
            }
          });

          missionsUpdated++;
          if (isCompleted && !userMission.isCompleted) {
            missionsCompleted++;
            // Auto-claim reward
            await this.claimReward(userId, mission.id);
          }
        }
      }

      return { missionsUpdated, missionsCompleted };
    } catch (error) {
      console.error('Mission evaluation error:', error);
      return { missionsUpdated: 0, missionsCompleted: 0 };
    }
  }

  /**
   * Get available missions for a user
   */
  async getAvailableMissions(userId: string) {
    try {
      // Get all active missions
      const allMissions = await prisma.mission.findMany({
        where: {
          isActive: true,
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } }
          ]
        },
        include: {
          targetMerchant: true
        }
      });

      // Get user's missions
      const userMissions = await prisma.userMission.findMany({
        where: { userId }
      });

      const userMissionIds = new Set(userMissions.map(um => um.missionId));

      // Filter out missions user already has
      const availableMissions = allMissions.filter(m => !userMissionIds.has(m.id));

      return availableMissions;
    } catch (error) {
      console.error('Get available missions error:', error);
      return [];
    }
  }

  /**
   * Enroll user in a mission
   */
  async enrollInMission(userId: string, missionId: string) {
    try {
      // Check if mission exists and is active
      const mission = await prisma.mission.findUnique({
        where: { id: missionId }
      });

      if (!mission || !mission.isActive) {
        return { success: false, message: 'Mission not found or inactive' };
      }

      // Check if user already enrolled
      const existing = await prisma.userMission.findUnique({
        where: {
          userId_missionId: {
            userId,
            missionId
          }
        }
      });

      if (existing) {
        return { success: false, message: 'Already enrolled in this mission' };
      }

      // Create user mission
      const userMission = await prisma.userMission.create({
        data: {
          userId,
          missionId,
          progress: 0,
          isCompleted: false
        },
        include: {
          mission: true
        }
      });

      return { success: true, userMission };
    } catch (error) {
      console.error('Enroll in mission error:', error);
      return { success: false, message: 'Failed to enroll in mission' };
    }
  }

  /**
   * Claim mission reward
   */
  async claimReward(userId: string, missionId: string) {
    try {
      const userMission = await prisma.userMission.findUnique({
        where: {
          userId_missionId: {
            userId,
            missionId
          }
        },
        include: {
          mission: true
        }
      });

      if (!userMission) {
        return { success: false, message: 'Mission not found' };
      }

      if (!userMission.isCompleted) {
        return { success: false, message: 'Mission not completed yet' };
      }

      if (userMission.rewardClaimed) {
        return { success: false, message: 'Reward already claimed' };
      }

      // Apply reward based on type
      const mission = userMission.mission;

      // For CASHBACK, add to wallet balance using WalletService (will auto-stake if enabled)
      if (mission.rewardType === 'CASHBACK') {
        const result = await walletService.addFunds(userId, mission.rewardAmount, {
          description: `Mission reward: ${mission.title}`,
          transactionType: 'MISSION_REWARD',
          currency: 'USD',
          metadata: JSON.stringify({ missionId: mission.id })
        });

        if (!result.success) {
          return { success: false, message: result.message };
        }
      }

      // Mark reward as claimed
      await prisma.userMission.update({
        where: { id: userMission.id },
        data: {
          rewardClaimed: true,
          claimedAt: new Date()
        }
      });

      return {
        success: true,
        rewardAmount: mission.rewardAmount,
        rewardType: mission.rewardType
      };
    } catch (error) {
      console.error('Claim reward error:', error);
      return { success: false, message: 'Failed to claim reward' };
    }
  }

  /**
   * Get user's mission progress
   */
  async getUserMissions(userId: string) {
    try {
      const userMissions = await prisma.userMission.findMany({
        where: { userId },
        include: {
          mission: {
            include: {
              targetMerchant: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return userMissions;
    } catch (error) {
      console.error('Get user missions error:', error);
      return [];
    }
  }
}

export default new MissionEngine();
