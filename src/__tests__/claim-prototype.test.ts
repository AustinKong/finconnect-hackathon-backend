import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Mission Claim Prototype Tests', () => {
  let testUser: any;
  let testWallet: any;

  beforeAll(async () => {
    // Find and clean up any existing test user and related data
    const existingUser = await prisma.user.findUnique({ 
      where: { email: 'claim-prototype-test@example.com' } 
    });
    
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

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'claim-prototype-test@example.com',
        name: 'Claim Prototype Test User'
      }
    });

    // Create test wallet with auto-stake enabled
    testWallet = await prisma.wallet.create({
      data: {
        userId: testUser.id,
        balance: 100,
        yieldEarned: 0,
        shares: 0,
        autoStake: true
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.transaction.deleteMany({ where: { userId: testUser.id } });
    await prisma.userMission.deleteMany({ where: { userId: testUser.id } });
    await prisma.card.deleteMany({ where: { walletId: testWallet.id } });
    await prisma.wallet.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.$disconnect();
  });

  it('should successfully claim a prototype reward and auto-stake it', async () => {
    const rewardAmount = 50;

    const response = await request(app)
      .post('/missions/claim-prototype')
      .set('x-test-user-id', testUser.id)
      .send({
        rewardAmount
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rewardAmount).toBe(rewardAmount);
    expect(response.body.autoStaked).toBeGreaterThan(0);
    expect(response.body.message).toContain('auto-staked');

    // Verify wallet has shares (staked)
    const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.shares).toBeGreaterThan(0);

    // Verify transaction was created
    const transaction = await prisma.transaction.findFirst({
      where: {
        userId: testUser.id,
        type: 'MISSION_REWARD',
        amount: rewardAmount
      }
    });
    expect(transaction).toBeDefined();
    expect(transaction?.description).toContain('prototype');
  });

  it('should fail without rewardAmount', async () => {
    const response = await request(app)
      .post('/missions/claim-prototype')
      .set('x-test-user-id', testUser.id)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('rewardAmount');
  });

  it('should fail with invalid rewardAmount', async () => {
    const response = await request(app)
      .post('/missions/claim-prototype')
      .set('x-test-user-id', testUser.id)
      .send({
        rewardAmount: -10
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('rewardAmount');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .post('/missions/claim-prototype')
      .send({
        rewardAmount: 50
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Unauthorized');
  });

  it('should work with auto-stake disabled', async () => {
    // Disable auto-stake
    await prisma.wallet.update({
      where: { userId: testUser.id },
      data: { autoStake: false }
    });

    const rewardAmount = 25;

    const response = await request(app)
      .post('/missions/claim-prototype')
      .set('x-test-user-id', testUser.id)
      .send({
        rewardAmount
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rewardAmount).toBe(rewardAmount);
    expect(response.body.autoStaked).toBeUndefined();
    expect(response.body.message).toContain('credited to wallet');

    // Verify balance increased
    const wallet = await prisma.wallet.findUnique({ where: { userId: testUser.id } });
    expect(wallet?.balance).toBeGreaterThan(100); // Initial was 100
  });
});
