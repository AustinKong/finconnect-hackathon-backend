import lendingProtocol from './mock/LendingProtocolMock';
import yieldManager from './services/YieldManager';
import fiatSettlement from './mock/FiatSettlementBridge';
import custodyWallet from './mock/CustodyStablecoinMock';
import prisma from './utils/prisma';

/**
 * Simple test to verify all modules can be initialized and basic operations work
 */
async function testModules() {
  console.log('🧪 Testing GlobeTrotter+ Backend Modules...\n');

  try {
    // Test 1: Initialize Custody Wallet (simplified, no DB operations)
    console.log('1️⃣ Testing CustodyStablecoinMock...');
    const walletStats = custodyWallet.getStats();
    console.log(`✅ Custody wallet ready`);
    console.log(`   Exchange rate: ${walletStats.exchangeRate}`);
    console.log(`   Pooled balance: ${walletStats.pooledBalance}\n`);

    // Test 2: Initialize Lending Protocol
    console.log('2️⃣ Testing LendingProtocolMock...');
    const protocol = await lendingProtocol.initializeProtocol();
    console.log(`✅ Lending protocol initialized: ${protocol.id}`);
    console.log(`   APR: ${protocol.currentAPR * 100}%`);
    console.log(`   Exchange rate: ${protocol.exchangeRate}\n`);

    // Test 3: Initialize Yield Manager
    console.log('3️⃣ Testing YieldManager...');
    const protocol2 = await yieldManager.initialize();
    console.log(`✅ Yield manager initialized`);
    console.log(`   Yield rate: ${yieldManager.getYieldRate() * 100}%\n`);

    // Test 4: Test Fiat Settlement Bridge
    console.log('4️⃣ Testing FiatSettlementBridge...');
    const rates = fiatSettlement.getRates();
    console.log(`✅ Fiat settlement bridge ready`);
    console.log(`   FX markup: ${rates.fxMarkup * 100}%`);
    console.log(`   Settlement fee: ${rates.settlementFeeRate * 100}%\n`);

    // Test 5: Integration test - deposit flow with fiat
    console.log('5️⃣ Testing integrated deposit flow with fiat...');
    const testUserId = 'test-user-123';
    
    // Create test user if not exists
    let testUser = await prisma.user.findUnique({ where: { id: testUserId } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          id: testUserId,
          email: 'test@example.com',
          name: 'Test User'
        }
      });
      await prisma.wallet.create({
        data: {
          userId: testUserId,
          balance: 0,
          yieldEarned: 0,
          shares: 0,
          autoStake: true
        }
      });
    }
    
    // Deposit 1000 USD via yield manager (fiat → stablecoin → lending protocol)
    const depositResult = await yieldManager.deposit(testUserId, 1000, 'USD');
    console.log(`✅ User deposited 1000 USD, received ${depositResult.shares?.toFixed(2)} shares`);
    console.log(`   Stablecoin amount: ${depositResult.stablecoinAmount?.toFixed(2)} USDC`);
    console.log(`   FX rate: ${depositResult.fxRate?.toFixed(4)}`);

    // Get user balance from yield manager
    const balance = await yieldManager.getUserBalance(testUserId, 'USD');
    console.log(`✅ User balance: ${balance.stablecoinBalance?.toFixed(2)} USDC (${balance.fiatBalance?.toFixed(2)} USD, ${balance.shares?.toFixed(2)} shares)\n`);

    // Test 6: Get a settlement quote
    console.log('6️⃣ Testing settlement quote...');
    const quote = await fiatSettlement.getStablecoinToFiatQuote(1000, 'EUR');
    if (quote.success && quote.quote) {
      console.log(`✅ Quote for 1000 USDC → EUR:`);
      console.log(`   Fiat amount: ${quote.quote.effectiveFiatAmount.toFixed(2)} EUR`);
      console.log(`   FX rate: ${quote.quote.fxRate.toFixed(4)}`);
      console.log(`   Settlement fee: ${quote.quote.settlementFee.toFixed(2)} EUR\n`);
    }

    // Test 7: Get statistics
    console.log('7️⃣ Getting statistics...');
    const custodyStats = custodyWallet.getStats();
    const protocolStats = await lendingProtocol.getStats();

    console.log(`✅ Custody wallet stats:`);
    console.log(`   Pooled balance: ${custodyStats.pooledBalance.toFixed(2)} USDC`);
    console.log(`   Exchange rate: ${custodyStats.exchangeRate.toFixed(6)}`);

    if (protocolStats.success && protocolStats.stats) {
      console.log(`✅ Protocol stats:`);
      console.log(`   Total deposited: ${protocolStats.stats.totalDeposited.toFixed(2)} USDC`);
      console.log(`   Total interest: ${protocolStats.stats.totalInterestEarned.toFixed(2)} USDC`);
    }

    const managerStats = await yieldManager.getStats();
    if (managerStats.success && managerStats.stats) {
      console.log(`✅ Manager stats:`);
      console.log(`   Exchange rate: ${managerStats.stats.exchangeRate.toFixed(6)}`);
      console.log(`   Total users: ${managerStats.stats.totalUsers}\n`);
    }

    // Test 8: Test withdrawal flow with fiat
    console.log('8️⃣ Testing withdrawal flow with fiat...');
    
    // Check if user has sufficient balance
    const balanceCheck = await yieldManager.hasSufficientBalance(testUserId, 100, 'USD');
    console.log(`✅ Sufficient balance check: ${balanceCheck.hasSufficient} (has ${balanceCheck.currentBalance?.toFixed(2)} USD, needs 100 USD)`);
    
    if (balanceCheck.hasSufficient) {
      // Withdraw 100 USD
      const withdrawResult = await yieldManager.withdraw(testUserId, 100, 'USD');
      console.log(`✅ User withdrew ${withdrawResult.fiatAmount?.toFixed(2)} USD, burned ${withdrawResult.shares?.toFixed(2)} shares`);
      console.log(`   Stablecoin amount: ${withdrawResult.stablecoinAmount?.toFixed(2)} USDC`);
      
      // Check balance after withdrawal
      const balanceAfter = await yieldManager.getUserBalance(testUserId, 'USD');
      console.log(`✅ Balance after withdrawal: ${balanceAfter.stablecoinBalance?.toFixed(2)} USDC (${balanceAfter.fiatBalance?.toFixed(2)} USD, ${balanceAfter.shares?.toFixed(2)} shares)\n`);
    }

    // Test 9: Test yield synchronization
    console.log('9️⃣ Testing yield synchronization...');
    
    // Sync yield from lending protocol
    const syncResult = await yieldManager.syncYield();
    if (syncResult.success) {
      console.log(`✅ Yield synchronized successfully`);
      console.log(`   Exchange rate: ${syncResult.exchangeRate?.toFixed(6)}`);
      console.log(`   Interest earned: ${syncResult.interestEarned?.toFixed(2)} USDC`);
      
      // Check updated balance after yield accrual
      const balanceAfterYield = await yieldManager.getUserBalance(testUserId, 'USD');
      console.log(`✅ Balance after yield: ${balanceAfterYield.stablecoinBalance?.toFixed(2)} USDC (${balanceAfterYield.fiatBalance?.toFixed(2)} USD)\n`);
    }

    console.log('✅ All tests passed! Modules are working correctly.\n');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testModules()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default testModules;
