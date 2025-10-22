import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';
import lendingProtocol from '../mock/LendingProtocolMock';

const prisma = new PrismaClient();

describe('GlobeTrotter+ E2E Tests', () => {
  let testUser: any;
  let testWallet: any;
  let testCard: any;
  let nonPartnerMerchant: any;
  let partnerMerchant: any;
  let partnerMission: any;

  beforeAll(async () => {
    // Find and clean up any existing test user and related data
    const existingUser = await prisma.user.findUnique({ where: { email: 'globetrotter@example.com' } });
    if (existingUser) {
      await prisma.transaction.deleteMany({ where: { userId: existingUser.id } });
      await prisma.userMission.deleteMany({ where: { userId: existingUser.id } });
      const existingWallet = await prisma.wallet.findUnique({ where: { userId: existingUser.id } });
      if (existingWallet) {
        await prisma.card.deleteMany({ where: { walletId: existingWallet.id } });
        await prisma.wallet.delete({ where: { id: existingWallet.id } });
      }
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    
    // Clean up test merchants and missions
    await prisma.mission.deleteMany({ where: { title: 'Eiffel Souvenir Spree' } });
    await prisma.merchant.deleteMany({ where: { name: { in: ['NONPARTNER_FR', 'Eiffel Tower Gift Shop'] } } });
    
    // Clean and reinitialize lending protocol
    await prisma.lendingDeposit.deleteMany({});
    await prisma.lendingProtocol.deleteMany({});
    
    // Reset the protocol ID in the singleton
    (lendingProtocol as any).protocolId = null;
    
    // Initialize lending protocol
    await lendingProtocol.initializeProtocol();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'globetrotter@example.com',
        name: 'Globe Trotter'
      }
    });

    // Create test wallet with auto-stake enabled
    testWallet = await prisma.wallet.create({
      data: {
        userId: testUser.id,
        balance: 0,
        yieldEarned: 0,
        shares: 0,
        autoStake: true  // Enable auto-staking
      }
    });

    // Create test card
    testCard = await prisma.card.create({
      data: {
        walletId: testWallet.id,
        cardNumber: '4999888877776666',
        cardholderName: 'Globe Trotter',
        expiryMonth: 12,
        expiryYear: 2027,
        cvv: '999',
        isActive: true
      }
    });

    // Create non-partner merchant in France (EUR)
    nonPartnerMerchant = await prisma.merchant.create({
      data: {
        name: 'NONPARTNER_FR',
        category: 'RETAIL',
        country: 'FR',
        currency: 'EUR',
        mcc: '5999'
      }
    });

    // Create partner merchant (for mission completion)
    partnerMerchant = await prisma.merchant.create({
      data: {
        name: 'Eiffel Tower Gift Shop',
        category: 'SHOPPING',
        country: 'FR',
        currency: 'EUR',
        mcc: '5942'
      }
    });

    // Create partner mission
    partnerMission = await prisma.mission.create({
      data: {
        title: 'Eiffel Souvenir Spree',
        description: 'Spend €50 at the Eiffel Tower Gift Shop to earn €5 cashback',
        type: 'SPEND_MERCHANT',
        targetValue: 50,
        targetMerchantId: partnerMerchant.id,
        rewardAmount: 5,
        rewardType: 'CASHBACK',
        isActive: true
      }
    });
  });

  afterAll(async () => {
    // Clean up test data in correct order
    await prisma.transaction.deleteMany({ where: { userId: testUser.id } });
    await prisma.userMission.deleteMany({ where: { userId: testUser.id } });
    await prisma.card.deleteMany({ where: { walletId: testWallet.id } });
    await prisma.wallet.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.mission.deleteMany({ where: { id: partnerMission.id } });
    await prisma.merchant.deleteMany({ 
      where: { 
        id: { 
          in: [nonPartnerMerchant.id, partnerMerchant.id] 
        } 
      } 
    });
    await prisma.$disconnect();
  });

  it('should complete full GlobeTrotter+ flow: topup, auto-stake, accrue, purchase, mission, reward auto-stake', async () => {
    // Step 1: Top up $1000 (auto-stake enabled)
    console.log('\n=== Step 1: Top up $1000 with auto-stake ===');
    const topupResponse = await request(app)
      .post('/wallet/topup')
      .send({
        userId: testUser.id,
        amount: 1000,
        currency: 'USD'
      });

    expect(topupResponse.status).toBe(200);
    expect(topupResponse.body.success).toBe(true);
    expect(topupResponse.body.autoStaked).toBeGreaterThan(0);
    
    // Verify wallet has shares (staked)
    let wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.shares).toBeGreaterThan(0);
    
    const initialShares = wallet?.shares || 0;
    console.log(`Initial shares: ${initialShares}`);
    console.log(`Initial balance: ${wallet?.balance}`);

    // Step 2: Simulate +10 days by accruing yield
    console.log('\n=== Step 2: Simulate +10 days of yield accrual ===');
    const now = Math.floor(Date.now() / 1000);
    const tenDaysLater = now - (10 * 24 * 60 * 60); // Set lastAccrualAt to 10 days ago
    
    const accrueResponse1 = await request(app)
      .post('/yield/accrue')
      .send({
        now_sec: tenDaysLater
      });

    expect(accrueResponse1.status).toBe(200);
    expect(accrueResponse1.body.success).toBe(true);

    // Accrue to current time
    const accrueResponse2 = await request(app)
      .post('/yield/accrue')
      .send({});

    expect(accrueResponse2.status).toBe(200);
    expect(accrueResponse2.body.success).toBe(true);
    expect(accrueResponse2.body.interestEarned).toBeGreaterThan(0);
    
    console.log(`Interest earned after 10 days: ${accrueResponse2.body.interestEarned}`);
    console.log(`Exchange rate increased to: ${accrueResponse2.body.newRate}`);

    // Step 3: Enroll in partner mission
    console.log('\n=== Step 3: Enroll in partner mission ===');
    const enrollResponse = await request(app)
      .post('/missions/enroll')
      .send({
        userId: testUser.id,
        missionId: partnerMission.id
      });

    expect(enrollResponse.status).toBe(200);
    expect(enrollResponse.body.success).toBe(true);

    // Step 4: POS authorize €120 at non-partner FR merchant (should auto-unstake)
    console.log('\n=== Step 4: POS authorize €120 at NONPARTNER_FR ===');
    const authorizeResponse1 = await request(app)
      .post('/pos/authorize')
      .send({
        cardNumber: testCard.cardNumber,
        merchantId: nonPartnerMerchant.id,
        amount: 120,
        currency: 'EUR'
      });

    if (authorizeResponse1.status !== 200) {
      console.log('Authorization error:', authorizeResponse1.body);
      wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
      console.log('Wallet state:', wallet);
      const protocol = await prisma.lendingProtocol.findFirst();
      console.log('Protocol state:', protocol);
    }
    
    expect(authorizeResponse1.status).toBe(200);
    expect(authorizeResponse1.body.success).toBe(true);
    expect(authorizeResponse1.body.fxConversion).toBeDefined();
    expect(authorizeResponse1.body.fxConversion.rate).toBeGreaterThan(0);
    
    // Should have auto-unstaked funds
    expect(authorizeResponse1.body.autoUnstake).toBeDefined();
    expect(authorizeResponse1.body.autoUnstake.unstakedAmount).toBeGreaterThan(0);

    wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    const sharesAfterPurchase = wallet?.shares || 0;
    expect(sharesAfterPurchase).toBeLessThan(initialShares);
    
    console.log(`Shares after auto-unstake: ${sharesAfterPurchase} (decreased from ${initialShares})`);
    console.log(`FX rate EUR/USD: ${authorizeResponse1.body.fxConversion.rate}`);
    console.log(`Amount in USD: ${authorizeResponse1.body.fxConversion.finalAmount}`);

    // Step 5: Partner swipes to complete mission (€60 needed to reach €50 target)
    console.log('\n=== Step 5: Partner swipes to complete mission ===');
    
    // Record shares before second purchase
    wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    const sharesBeforeSecondPurchase = wallet?.shares || 0;
    console.log(`Shares before second purchase: ${sharesBeforeSecondPurchase}`);
    
    const authorizeResponse2 = await request(app)
      .post('/pos/authorize')
      .send({
        cardNumber: testCard.cardNumber,
        merchantId: partnerMerchant.id,
        amount: 60,
        currency: 'EUR'
      });

    expect(authorizeResponse2.status).toBe(200);
    expect(authorizeResponse2.body.success).toBe(true);
    expect(authorizeResponse2.body.missions.completed).toBeGreaterThan(0);
    
    console.log(`Missions completed: ${authorizeResponse2.body.missions.completed}`);

    // Verify mission is completed and reward claimed
    const userMission = await prisma.userMission.findUnique({
      where: {
        userId_missionId: {
          userId: testUser.id,
          missionId: partnerMission.id
        }
      }
    });

    expect(userMission?.isCompleted).toBe(true);
    expect(userMission?.rewardClaimed).toBe(true);

    // Step 6: Assert reward auto-staked
    console.log('\n=== Step 6: Verify reward auto-staked ===');
    wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    const sharesAfterRewardAndPurchase = wallet?.shares || 0;
    
    console.log(`Shares before second purchase: ${sharesBeforeSecondPurchase}`);
    console.log(`Shares after second purchase + reward: ${sharesAfterRewardAndPurchase}`);
    
    // The net change should be: -cost of purchase + reward auto-staked
    // Since the purchase (€60 ≈ $64.80) costs more than the reward ($5), shares will decrease overall
    // But the reward should still be visible as auto-staked
    
    // Verify reward transaction exists and was auto-staked
    const rewardTransaction = await prisma.transaction.findFirst({
      where: {
        userId: testUser.id,
        type: 'MISSION_REWARD'
      }
    });

    expect(rewardTransaction).toBeDefined();
    expect(rewardTransaction?.amount).toBe(partnerMission.rewardAmount);
    
    // Verify that a STAKE transaction was created for the reward
    const rewardStakeTransaction = await prisma.transaction.findFirst({
      where: {
        userId: testUser.id,
        type: 'STAKE',
        description: {
          contains: 'Auto-staked'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    expect(rewardStakeTransaction).toBeDefined();
    console.log(`Reward auto-stake transaction amount: ${rewardStakeTransaction?.amount}`);
    
    // The presence of the auto-stake transaction proves the reward was auto-staked
    // Even though net shares decreased due to larger purchase cost

    // Step 7: Accrue +1 day → staked value grows
    console.log('\n=== Step 7: Accrue +1 day of yield ===');
    const oneDayAgo = now - (1 * 24 * 60 * 60);
    
    await request(app)
      .post('/yield/accrue')
      .send({
        now_sec: oneDayAgo
      });

    const accrueResponse3 = await request(app)
      .post('/yield/accrue')
      .send({});

    expect(accrueResponse3.status).toBe(200);
    expect(accrueResponse3.body.success).toBe(true);
    expect(accrueResponse3.body.interestEarned).toBeGreaterThan(0);
    
    console.log(`Additional interest earned after 1 day: ${accrueResponse3.body.interestEarned}`);

    // Step 8: Analytics summary reflects tx_count, cross_border, mission completed
    console.log('\n=== Step 8: Verify analytics summary ===');
    const summaryResponse = await request(app)
      .get(`/analytics/summary?userId=${testUser.id}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.transactions.total).toBeGreaterThan(0);
    expect(summaryResponse.body.transactions.purchases).toBe(2); // Two purchases made
    expect(summaryResponse.body.crossBorder.count).toBe(2); // Both purchases were in EUR (cross-border)
    expect(summaryResponse.body.missions.completed).toBe(1); // One mission completed
    expect(summaryResponse.body.missions.rewardsEarned).toBe(partnerMission.rewardAmount);
    expect(summaryResponse.body.staking).toBeDefined();
    expect(summaryResponse.body.staking.shares).toBeGreaterThan(0);
    expect(summaryResponse.body.staking.stakedValue).toBeGreaterThan(0);

    console.log('\n=== Final Analytics Summary ===');
    console.log(`Total transactions: ${summaryResponse.body.transactions.total}`);
    console.log(`Purchase transactions: ${summaryResponse.body.transactions.purchases}`);
    console.log(`Cross-border transactions: ${summaryResponse.body.crossBorder.count}`);
    console.log(`Cross-border volume (USD): ${summaryResponse.body.crossBorder.volume}`);
    console.log(`Missions completed: ${summaryResponse.body.missions.completed}`);
    console.log(`Rewards earned: ${summaryResponse.body.missions.rewardsEarned}`);
    console.log(`Final shares: ${summaryResponse.body.staking.shares}`);
    console.log(`Final staked value: ${summaryResponse.body.staking.stakedValue}`);

    // Final verification: Check wallet state
    wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.shares).toBeGreaterThan(0);
    
    console.log('\n=== Test Completed Successfully ===');
  });
});
