import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Clean up database before all tests
beforeAll(async () => {
  // Ensure database is clean
  await prisma.transaction.deleteMany({});
  await prisma.userMission.deleteMany({});
  await prisma.card.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.mission.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.lendingDeposit.deleteMany({});
  await prisma.lendingProtocol.deleteMany({});
  await prisma.fiatSettlement.deleteMany({});
});

// Clean up database after all tests
afterAll(async () => {
  await prisma.$disconnect();
  // Force exit after a short delay to clean up hanging handles
  setTimeout(() => process.exit(0), 500);
});

export { prisma };
