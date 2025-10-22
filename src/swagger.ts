import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GlobeTrotter+ API',
      version: '1.0.0',
      description: 'A travel rewards and payments platform featuring stablecoin yield, multi-currency support, and gamified travel missions.',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ClerkAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Clerk session token for authentication',
        },
        TestUserId: {
          type: 'apiKey',
          in: 'header',
          name: 'x-test-user-id',
          description: 'Test user ID (only available in test mode)',
        },
      },
      schemas: {
        Wallet: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            balance: { type: 'number', format: 'double' },
            shares: { type: 'number', format: 'double' },
            autoStake: { type: 'boolean' },
            yieldEarned: { type: 'number', format: 'double' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Card: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            walletId: { type: 'string' },
            cardNumber: { type: 'string' },
            cardholderName: { type: 'string' },
            expiryMonth: { type: 'integer' },
            expiryYear: { type: 'integer' },
            cvv: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            type: { type: 'string', enum: ['TOPUP', 'PURCHASE', 'REFUND', 'STAKE', 'UNSTAKE', 'YIELD', 'MISSION_REWARD'] },
            amount: { type: 'number', format: 'double' },
            currency: { type: 'string' },
            merchantId: { type: 'string', nullable: true },
            description: { type: 'string' },
            status: { type: 'string' },
            metadata: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Mission: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['SPENDING', 'MERCHANT', 'CATEGORY', 'TRAVEL'] },
            targetValue: { type: 'number', format: 'double', nullable: true },
            targetCategory: { type: 'string', nullable: true },
            targetMerchantId: { type: 'string', nullable: true },
            rewardAmount: { type: 'number', format: 'double' },
            rewardType: { type: 'string', enum: ['CASHBACK', 'POINTS', 'MILES'] },
            isActive: { type: 'boolean' },
            startDate: { type: 'string', format: 'date-time', nullable: true },
            endDate: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        UserMission: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            missionId: { type: 'string' },
            progress: { type: 'number', format: 'double' },
            isCompleted: { type: 'boolean' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            rewardClaimed: { type: 'boolean' },
            claimedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Merchant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            category: { type: 'string' },
            country: { type: 'string' },
            currency: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/index.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
