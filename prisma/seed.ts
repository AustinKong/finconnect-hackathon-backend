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
      name: 'Starbucks Tokyo',
      category: 'FOOD_BEVERAGE',
      country: 'JP',
      currency: 'JPY',
      mcc: '5814'
    },
    {
      name: 'Eiffel Tower Gift Shop',
      category: 'SHOPPING',
      country: 'FR',
      currency: 'EUR',
      mcc: '5999'
    },
    {
      name: 'Singapore Airlines',
      category: 'TRAVEL',
      country: 'SG',
      currency: 'SGD',
      mcc: '4511'
    },
    {
      name: 'Harrods London',
      category: 'SHOPPING',
      country: 'GB',
      currency: 'GBP',
      mcc: '5311'
    },
    {
      name: 'Sydney Opera House',
      category: 'ENTERTAINMENT',
      country: 'AU',
      currency: 'AUD',
      mcc: '7929'
    },
    {
      name: 'Bangkok Street Food Market',
      category: 'FOOD_BEVERAGE',
      country: 'TH',
      currency: 'THB',
      mcc: '5812'
    },
    {
      name: 'New York Taxi',
      category: 'TRANSPORT',
      country: 'US',
      currency: 'USD',
      mcc: '4121'
    },
    {
      name: 'Dubai Mall',
      category: 'SHOPPING',
      country: 'AE',
      currency: 'AED',
      mcc: '5311'
    },
    {
      name: 'Rome Trevi Fountain Cafe',
      category: 'FOOD_BEVERAGE',
      country: 'IT',
      currency: 'EUR',
      mcc: '5814'
    },
    {
      name: 'Barcelona FC Store',
      category: 'SHOPPING',
      country: 'ES',
      currency: 'EUR',
      mcc: '5941'
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

  // Create missions
  const mission1 = await prisma.mission.upsert({
    where: { id: 'global-explorer' },
    update: {},
    create: {
      id: 'global-explorer',
      title: 'Global Explorer',
      description: 'Spend $500 across different countries to unlock a $50 cashback reward',
      type: 'SPEND_AMOUNT',
      targetValue: 500,
      rewardAmount: 50,
      rewardType: 'CASHBACK',
      isActive: true
    }
  });

  const singaporeAirlines = createdMerchants.find(m => m.name === 'Singapore Airlines');
  const mission2 = await prisma.mission.upsert({
    where: { id: 'fly-high' },
    update: {},
    create: {
      id: 'fly-high',
      title: 'Fly High with Singapore Airlines',
      description: 'Book a flight with Singapore Airlines and earn $100 cashback',
      type: 'SPEND_MERCHANT',
      targetValue: 300,
      targetMerchantId: singaporeAirlines?.id,
      rewardAmount: 100,
      rewardType: 'CASHBACK',
      isActive: true,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
    }
  });

  console.log('✅ Created missions:', mission1.title, mission2.title);

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

  // Enroll users in missions
  await prisma.userMission.upsert({
    where: {
      userId_missionId: {
        userId: user1.id,
        missionId: mission1.id
      }
    },
    update: {},
    create: {
      userId: user1.id,
      missionId: mission1.id,
      progress: 250,
      isCompleted: false
    }
  });

  await prisma.userMission.upsert({
    where: {
      userId_missionId: {
        userId: user2.id,
        missionId: mission2.id
      }
    },
    update: {},
    create: {
      userId: user2.id,
      missionId: mission2.id,
      progress: 0,
      isCompleted: false
    }
  });

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
