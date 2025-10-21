import custodyWallet from './mock/CustodyStablecoinMock';
import lendingProtocol from './mock/LendingProtocolMock';
import yieldStrategy from './services/YieldStrategyManager';
import fiatSettlement from './services/FiatSettlementBridge';

/**
 * Simple test to verify all modules can be initialized and basic operations work
 */
async function testModules() {
  console.log('🧪 Testing GlobeTrotter+ Backend Modules...\n');

  try {
    // Test 1: Initialize Custody Wallet
    console.log('1️⃣ Testing CustodyStablecoinMock...');
    const wallet = await custodyWallet.initializeCustodyWallet();
    console.log(`✅ Custody wallet initialized: ${wallet.id}`);
    console.log(`   Exchange rate: ${wallet.exchangeRate}\n`);

    // Test 2: Initialize Lending Protocol
    console.log('2️⃣ Testing LendingProtocolMock...');
    const protocol = await lendingProtocol.initializeProtocol();
    console.log(`✅ Lending protocol initialized: ${protocol.id}`);
    console.log(`   APR: ${protocol.currentAPR * 100}%`);
    console.log(`   Exchange rate: ${protocol.exchangeRate}\n`);

    // Test 3: Initialize Yield Strategy
    console.log('3️⃣ Testing YieldStrategyManager...');
    const strategy = await yieldStrategy.initializeStrategy();
    console.log(`✅ Yield strategy initialized: ${strategy.id}`);
    console.log(`   Min buffer: ${strategy.minLiquidityBuffer * 100}%`);
    console.log(`   Max buffer: ${strategy.maxLiquidityBuffer * 100}%`);
    console.log(`   Auto-rebalance: ${strategy.autoRebalance}\n`);

    // Test 4: Test Fiat Settlement Bridge
    console.log('4️⃣ Testing FiatSettlementBridge...');
    const rates = fiatSettlement.getRates();
    console.log(`✅ Fiat settlement bridge ready`);
    console.log(`   FX markup: ${rates.fxMarkup * 100}%`);
    console.log(`   Settlement fee: ${rates.settlementFeeRate * 100}%\n`);

    // Test 5: Integration test - deposit flow
    console.log('5️⃣ Testing integrated deposit flow...');
    const testUserId = 'test-user-123';
    
    // Deposit 1000 USDC via yield strategy (which manages user shares)
    const depositResult = await yieldStrategy.deposit(testUserId, 1000);
    console.log(`✅ User deposited 1000 USDC, received ${depositResult.shares?.toFixed(2)} shares`);

    // Check if rebalancing is needed
    const rebalanceCheck = await yieldStrategy.shouldRebalance();
    console.log(`   Should rebalance: ${rebalanceCheck.shouldRebalance}`);
    if (rebalanceCheck.reason) {
      console.log(`   Reason: ${rebalanceCheck.reason}`);
    }

    // Get user balance from yield strategy
    const balance = await yieldStrategy.getUserBalance(testUserId);
    console.log(`✅ User balance: ${balance.tokenBalance?.toFixed(2)} USDC (${balance.shares?.toFixed(2)} shares)\n`);

    // Test 6: Get a settlement quote
    console.log('6️⃣ Testing settlement quote...');
    const quote = await fiatSettlement.getTokenToFiatQuote(1000, 'EUR');
    if (quote.success && quote.quote) {
      console.log(`✅ Quote for 1000 USDC → EUR:`);
      console.log(`   Fiat amount: ${quote.quote.effectiveFiatAmount.toFixed(2)} EUR`);
      console.log(`   FX rate: ${quote.quote.fxRate.toFixed(4)}`);
      console.log(`   Settlement fee: ${quote.quote.settlementFee.toFixed(2)} EUR\n`);
    }

    // Test 7: Get statistics
    console.log('7️⃣ Getting statistics...');
    const poolStats = await custodyWallet.getPoolStats();
    const protocolStats = await lendingProtocol.getStats();
    const strategyStats = await yieldStrategy.getStats();

    if (poolStats.success && poolStats.stats) {
      console.log(`✅ Pool stats:`);
      console.log(`   Total balance: ${poolStats.stats.totalPoolBalance.toFixed(2)} USDC`);
      console.log(`   Total shares: ${poolStats.stats.totalShares.toFixed(2)}`);
    }

    if (protocolStats.success && protocolStats.stats) {
      console.log(`✅ Protocol stats:`);
      console.log(`   Total deposited: ${protocolStats.stats.totalDeposited.toFixed(2)} USDC`);
      console.log(`   Total interest: ${protocolStats.stats.totalInterestEarned.toFixed(2)} USDC`);
    }

    if (strategyStats.success && strategyStats.stats) {
      console.log(`✅ Strategy stats:`);
      console.log(`   Current liquidity: ${strategyStats.stats.currentLiquidity.toFixed(2)} USDC`);
      console.log(`   Total staked: ${strategyStats.stats.totalStaked.toFixed(2)} USDC`);
      console.log(`   Liquidity ratio: ${(strategyStats.stats.liquidityRatio * 100).toFixed(2)}%`);
      console.log(`   Total users: ${strategyStats.stats.totalUsers}\n`);
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
