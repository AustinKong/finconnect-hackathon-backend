import request from 'supertest';
import app from '../index';
import { prisma } from './setup';

describe('Auth Endpoints', () => {
  const testEmail = 'testuser@example.com';
  const testName = 'Test User';

  beforeEach(async () => {
    // Clean up any existing test user
    const existingUser = await prisma.user.findUnique({
      where: { email: testEmail }
    });

    if (existingUser) {
      await prisma.transaction.deleteMany({ where: { userId: existingUser.id } });
      await prisma.userMission.deleteMany({ where: { userId: existingUser.id } });
      const wallet = await prisma.wallet.findUnique({ where: { userId: existingUser.id } });
      if (wallet) {
        await prisma.card.deleteMany({ where: { walletId: wallet.id } });
        await prisma.wallet.delete({ where: { userId: existingUser.id } });
      }
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
  });

  afterEach(async () => {
    // Clean up test user
    const user = await prisma.user.findUnique({
      where: { email: testEmail }
    });

    if (user) {
      await prisma.transaction.deleteMany({ where: { userId: user.id } });
      await prisma.userMission.deleteMany({ where: { userId: user.id } });
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (wallet) {
        await prisma.card.deleteMany({ where: { walletId: wallet.id } });
        await prisma.wallet.delete({ where: { userId: user.id } });
      }
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  describe('POST /auth/register', () => {
    it('should register a new user with email and name', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: testName
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.user.name).toBe(testName);
      expect(response.body.wallet).toBeDefined();
      expect(response.body.wallet.balance).toBe(0);
      expect(response.body.wallet.autoStake).toBe(true);
    });

    it('should create a wallet automatically when registering', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: testName
        });

      expect(response.status).toBe(201);
      const userId = response.body.userId;

      // Verify wallet was created
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      expect(wallet).toBeDefined();
      expect(wallet?.userId).toBe(userId);
      expect(wallet?.balance).toBe(0);
    });

    it('should return error if email is missing', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: testName
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('email and name are required');
    });

    it('should return error if name is missing', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('email and name are required');
    });

    it('should return error if user with email already exists', async () => {
      // Register first time
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: testName
        });

      // Try to register again with same email
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: 'Another Name'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User with this email already exists');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app)
        .post('/auth/register')
        .send({
          email: testEmail,
          name: testName
        });
    });

    it('should login with existing email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testEmail
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.user.name).toBe(testName);
      expect(response.body.wallet).toBeDefined();
    });

    it('should return userId on successful login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testEmail
        });

      expect(response.status).toBe(200);
      expect(response.body.userId).toBeDefined();
      expect(typeof response.body.userId).toBe('string');
    });

    it('should return error if email is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('email is required');
    });

    it('should return error if user does not exist', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });
  });
});
