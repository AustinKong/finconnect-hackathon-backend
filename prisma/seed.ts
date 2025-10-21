import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Traveler',
      wallet: {
        create: {
          balance: 1000,
          stakedAmount: 500,
          yieldEarned: 25
        }
      }
    }
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Explorer',
      wallet: {
        create: {
          balance: 500,
          stakedAmount: 0,
          yieldEarned: 0
        }
      }
    }
  });

  console.log('✅ Created users:', user1.name, user2.name);

  // Create merchants
  const merchants = [
    {
      name: 'Eiffel Tower Gift Shop',
      category: 'SHOPPING',
      country: 'FR',
      currency: 'EUR',
      mcc: '5999'
    },
    {
      name: 'Le Jules Verne',
      category: 'FOOD_BEVERAGE',
      country: 'FR',
      currency: 'EUR',
      mcc: '5812'
    },
    {
      name: 'Louvre Museum Shop',
      category: 'SHOPPING',
      country: 'FR',
      currency: 'EUR',
      mcc: '5942'
    },
    {
      name: 'Galeries Lafayette Paris Haussmann',
      category: 'SHOPPING',
      country: 'FR',
      currency: 'EUR',
      mcc: '5311'
    },
    {
      name: 'Cafe de Flore',
      category: 'FOOD_BEVERAGE',
      country: 'FR',
      currency: 'EUR',
      mcc: '5812'
    },
    {
      name: 'Shakespeare and Company',
      category: 'SHOPPING',
      country: 'FR',
      currency: 'EUR',
      mcc: '5942'
    }
  ];

  const createdMerchants = [];
  for (const merchant of merchants) {
    const created = await prisma.merchant.upsert({
      where: { id: merchant.name.toLowerCase().replace(/\s+/g, '-') },
      update: merchant,
      create: {
        id: merchant.name.toLowerCase().replace(/\s+/g, '-'),
        ...merchant
      }
    });
    createdMerchants.push(created);
  }

  console.log(`✅ Created ${createdMerchants.length} merchants`);

  // Create missions (Paris-focused)
  const missions = [
    {
      id: 'eiffel-souvenir-spree',
      title: 'Eiffel Souvenir Spree',
      description: 'Spend €50 at the Eiffel Tower Gift Shop to earn €5 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 50,
      targetMerchantName: 'Eiffel Tower Gift Shop',
      rewardAmount: 5,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'eiffel-souvenir-bonus',
      title: 'Eiffel Big Spender',
      description: 'Spend €150 at the Eiffel Tower Gift Shop to earn €15 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 150,
      targetMerchantName: 'Eiffel Tower Gift Shop',
      rewardAmount: 15,
      rewardType: 'CASHBACK',
      isActive: true,
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'le-jules-verne-dine',
      title: 'Le Jules Verne Fine Dining',
      description: 'Dine at Le Jules Verne and spend €150 to earn €20 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 150,
      targetMerchantName: 'Le Jules Verne',
      rewardAmount: 20,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'le-jules-verne-wine-pairing',
      title: 'Wine Pairing at Le Jules Verne',
      description: 'Spend €80 on wine pairing to earn €10 in points',
      type: 'SPEND_MERCHANT',
      targetValue: 80,
      targetMerchantName: 'Le Jules Verne',
      rewardAmount: 10,
      rewardType: 'POINTS',
      isActive: true
    },
    {
      id: 'louvre-shop-art-collector',
      title: 'Louvre Art Collector',
      description: 'Spend €100 at the Louvre Museum Shop and earn €15 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 100,
      targetMerchantName: 'Louvre Museum Shop',
      rewardAmount: 15,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'louvre-shop-family-pack',
      title: 'Louvre Family Souvenirs',
      description: 'Spend €40 at the Louvre Museum Shop to earn €5 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 40,
      targetMerchantName: 'Louvre Museum Shop',
      rewardAmount: 5,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'galeries-lafayette-shopping-spree',
      title: 'Galeries Lafayette Shopping Spree',
      description: 'Spend €200 at Galeries Lafayette to earn €25 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 200,
      targetMerchantName: 'Galeries Lafayette Paris Haussmann',
      rewardAmount: 25,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'galeries-lafayette-fashion-finds',
      title: 'Fashion Finds at Galeries Lafayette',
      description: 'Spend €150 on fashion (SHOPPING) across Galeries Lafayette to earn €20 cashback',
      type: 'SPEND_CATEGORY',
      targetCategory: 'SHOPPING',
      targetValue: 150,
      rewardAmount: 20,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'galeries-lafayette-late-night',
      title: 'Late Night at Galeries Lafayette',
      description: 'Spend €50 during late-night hours to earn €7 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 50,
      targetMerchantName: 'Galeries Lafayette Paris Haussmann',
      rewardAmount: 7,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'cafe-de-flore-morning',
      title: 'Cafe de Flore Morning Ritual',
      description: 'Buy a morning coffee at Cafe de Flore and earn €3 cashback when you spend €20',
      type: 'SPEND_MERCHANT',
      targetValue: 20,
      targetMerchantName: 'Cafe de Flore',
      rewardAmount: 3,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'cafe-de-flore-espresso-addict',
      title: 'Espresso Addict',
      description: 'Spend €40 in total at food & beverage merchants (FOOD_BEVERAGE) to earn €5 cashback',
      type: 'SPEND_CATEGORY',
      targetCategory: 'FOOD_BEVERAGE',
      targetValue: 40,
      rewardAmount: 5,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'shakespeare-bookworm',
      title: 'Bookworm at Shakespeare & Company',
      description: 'Spend €30 at Shakespeare and Company to earn €5 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 30,
      targetMerchantName: 'Shakespeare and Company',
      rewardAmount: 5,
      rewardType: 'CASHBACK',
      isActive: true
    },
    {
      id: 'shakespeare-literary-collector',
      title: 'Literary Collector',
      description: 'Spend €100 on books at Shakespeare and Company to earn €12 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 100,
      targetMerchantName: 'Shakespeare and Company',
      rewardAmount: 12,
      rewardType: 'CASHBACK',
      isActive: true,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'paris-tourist-welcome',
      title: 'Paris Tourist Welcome',
      description: 'Spend €300 across Paris merchants to earn €40 cashback',
      type: 'SPEND_AMOUNT',
      targetValue: 300,
      rewardAmount: 40,
      rewardType: 'CASHBACK',
      isActive: true,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'paris-night-out',
      title: 'Paris Night Out',
      description: 'Spend €80 on entertainment in Paris to earn €10 cashback',
      type: 'SPEND_CATEGORY',
      targetCategory: 'ENTERTAINMENT',
      targetValue: 80,
      rewardAmount: 10,
      rewardType: 'CASHBACK',
      isActive: true
    }
  ];

  const createdMissions = [];
  for (const mission of missions) {
    const targetMerchant = mission.targetMerchantName
      ? createdMerchants.find((m) => m.name === mission.targetMerchantName)
      : undefined;

    const createData: any = {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      type: mission.type,
      rewardAmount: mission.rewardAmount,
      rewardType: mission.rewardType,
      isActive: mission.isActive ?? true
    };

    if (mission.targetValue !== undefined) createData.targetValue = mission.targetValue;
    if (mission.targetCategory) createData.targetCategory = mission.targetCategory;
    if (targetMerchant) createData.targetMerchantId = targetMerchant.id;
    if (mission.endDate) createData.endDate = mission.endDate;

    const created = await prisma.mission.upsert({
      where: { id: mission.id },
      update: {},
      create: createData
    });

    createdMissions.push(created);
  }

  console.log(`✅ Created ${createdMissions.length} missions`);

  // Create some exchange rates
  const exchangeRates = [
    { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.93, markup: 0.02 },
    { fromCurrency: 'EUR', toCurrency: 'USD', rate: 1.08, markup: 0.02 },
    { fromCurrency: 'USD', toCurrency: 'GBP', rate: 0.80, markup: 0.02 },
    { fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.25, markup: 0.02 },
    { fromCurrency: 'USD', toCurrency: 'JPY', rate: 149.50, markup: 0.02 },
    { fromCurrency: 'JPY', toCurrency: 'USD', rate: 0.0067, markup: 0.02 },
    { fromCurrency: 'USD', toCurrency: 'SGD', rate: 1.35, markup: 0.02 },
    { fromCurrency: 'SGD', toCurrency: 'USD', rate: 0.74, markup: 0.02 }
  ];

  for (const rate of exchangeRates) {
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: rate.fromCurrency,
          toCurrency: rate.toCurrency
        }
      },
      update: rate,
      create: rate
    });
  }

  console.log(`✅ Created ${exchangeRates.length} exchange rates`);

  // Enroll users in missions (sample enrollments)
  const assignments = [
    { user: user1, missionId: 'eiffel-souvenir-spree', progress: 20, isCompleted: false },
    { user: user1, missionId: 'le-jules-verne-dine', progress: 80, isCompleted: false },
    { user: user1, missionId: 'paris-tourist-welcome', progress: 120, isCompleted: false },
    { user: user1, missionId: 'shakespeare-bookworm', progress: 15, isCompleted: false },
    { user: user1, missionId: 'galeries-lafayette-shopping-spree', progress: 50, isCompleted: false },

    { user: user2, missionId: 'cafe-de-flore-morning', progress: 20, isCompleted: true },
    { user: user2, missionId: 'eiffel-souvenir-bonus', progress: 50, isCompleted: false },
    { user: user2, missionId: 'louvre-shop-art-collector', progress: 5, isCompleted: false },
    { user: user2, missionId: 'paris-night-out', progress: 0, isCompleted: false }
  ];

  for (const a of assignments) {
    const mission = createdMissions.find((m) => m.id === a.missionId);
    if (!mission) {
      console.warn('Skipping assignment, mission not found:', a.missionId);
      continue;
    }

    await prisma.userMission.upsert({
      where: {
        userId_missionId: {
          userId: a.user.id,
          missionId: mission.id
        }
      },
      update: {},
      create: {
        userId: a.user.id,
        missionId: mission.id,
        progress: a.progress,
        isCompleted: a.isCompleted,
        completedAt: a.isCompleted ? new Date() : undefined
      }
    });
  }

  console.log('✅ Enrolled users in missions');
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
