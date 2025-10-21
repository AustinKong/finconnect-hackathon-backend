# GlobeTrotter+ Advanced Yield & Settlement Modules

This document describes the four new backend modules added to support advanced yield generation and merchant settlement features in the GlobeTrotter+ platform.

## Overview

The new modules work together to provide:
1. **Pooled custody** with share-based accounting
2. **Lending protocol integration** for yield generation (Aave-style)
3. **Intelligent liquidity management** with automatic rebalancing
4. **Fiat settlement bridge** for merchant payments

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   User Deposits USDC                    │
└────────────────────┬────────────────────────────────────┘
                     ▼
        ┌────────────────────────────┐
        │  CustodyStablecoinMock     │
        │  - Pooled wallet           │
        │  - Share-based accounting  │
        │  - Exchange rate tracking  │
        └────────┬───────────────────┘
                 │
                 ▼
        ┌────────────────────────────┐
        │  YieldStrategyManager      │
        │  - Liquidity buffer (10-30%)│
        │  - Auto-rebalancing        │
        │  - Stake/unstake decisions │
        └────────┬───────────────────┘
                 │
                 ▼
        ┌────────────────────────────┐
        │  LendingProtocolMock       │
        │  - Aave-style yield (5% APR)│
        │  - Continuous compounding  │
        │  - Exchange rate growth    │
        └────────────────────────────┘
                 
        ┌────────────────────────────┐
        │  FiatSettlementBridge      │
        │  - Token ↔ Fiat conversion │
        │  - FX rates + fees         │
        │  - Merchant settlements    │
        └────────────────────────────┘
```

## Module Details

### 1. CustodyStablecoinMock

**Purpose**: Manages a pooled wallet where multiple users' tokens are held together, using a share-based accounting system similar to Uniswap LP tokens.

**Key Concepts**:
- Users deposit tokens and receive **shares**
- Share value increases as yield is earned (via exchange rate)
- When withdrawing, shares are burned to receive tokens
- Exchange rate = tokens per share

**Core Methods**:
```typescript
// Initialize or get custody wallet
await custodyWallet.initializeCustodyWallet();

// Deposit tokens (user receives shares)
const result = await custodyWallet.deposit(userId, 1000);
// Returns: { success: true, shares: 1000, exchangeRate: 1.0 }

// Withdraw tokens (burns shares)
const result = await custodyWallet.withdraw(userId, 500);
// Returns: { success: true, shares: 500, exchangeRate: 1.0 }

// Get user's balance
const balance = await custodyWallet.getUserBalance(userId);
// Returns: { shares: 500, tokenBalance: 500, exchangeRate: 1.0 }

// Update exchange rate (called by yield strategy)
await custodyWallet.updateExchangeRate(1.05);

// Get pool statistics
const stats = await custodyWallet.getPoolStats();
// Returns: { totalPoolBalance, totalShares, exchangeRate, totalUsers }
```

### 2. LendingProtocolMock

**Purpose**: Simulates an Aave-style lending protocol where deposited funds earn yield through continuous compounding.

**Key Concepts**:
- Deposits are converted to shares at current exchange rate
- Interest accrues continuously (not daily)
- Exchange rate increases over time: `rate(t) = rate(0) × e^(APR × t)`
- Default APR: 5% (configurable via `LENDING_PROTOCOL_APR`)

**Core Methods**:
```typescript
// Initialize protocol
await lendingProtocol.initializeProtocol();

// Deposit tokens into protocol
const result = await lendingProtocol.deposit(1000);
// Returns: { success: true, shares: 1000, exchangeRate: 1.0 }

// Withdraw tokens from protocol
const result = await lendingProtocol.withdraw(500); // shares
// Returns: { success: true, amount: 525, exchangeRate: 1.05 }

// Accrue interest (updates exchange rate)
const result = await lendingProtocol.accrueInterest();
// Returns: { oldRate: 1.0, newRate: 1.00014, interestEarned: 1.4 }

// Update APR
await lendingProtocol.updateAPR(0.08); // 8% APR

// Get current exchange rate
const rate = await lendingProtocol.getExchangeRate();

// Get protocol statistics
const stats = await lendingProtocol.getStats();
// Returns: { currentAPR, totalDeposited, totalInterestEarned, exchangeRate, ... }

// Calculate projected value
const projected = lendingProtocol.calculateProjectedValue(1000, 1); // $1000 over 1 year
// Returns: 1051.27 (5% APR with continuous compounding)
```

### 3. YieldStrategyManager

**Purpose**: Manages the yield strategy by maintaining optimal liquidity buffers and deciding when to stake/unstake funds in the lending protocol.

**Key Concepts**:
- Maintains **liquidity buffer** between 10-30% of total balance
- Auto-rebalances when deviation exceeds 5%
- Stake excess liquidity into lending protocol
- Unstake from protocol when liquidity is low
- Syncs yield from lending protocol to custody wallet

**Core Methods**:
```typescript
// Initialize strategy
await yieldStrategy.initializeStrategy();

// Check if rebalancing is needed
const check = await yieldStrategy.shouldRebalance();
// Returns: { shouldRebalance: true, reason: "Liquidity below minimum buffer", 
//           currentRatio: 0.08, targetRatio: 0.2 }

// Execute rebalancing
const result = await yieldStrategy.rebalance();
// Returns: { success: true, action: 'stake', amount: 500, 
//           message: "Staked 500.00 tokens" }

// Add liquidity (on user deposit)
await yieldStrategy.addLiquidity(1000);

// Remove liquidity (on user withdrawal)
await yieldStrategy.removeLiquidity(500);

// Sync yield from lending protocol
const result = await yieldStrategy.syncYield();
// Returns: { success: true, interestEarned: 1.5, exchangeRate: 1.00015 }

// Update strategy settings
await yieldStrategy.updateSettings({
  minLiquidityBuffer: 0.15,  // 15%
  maxLiquidityBuffer: 0.35,  // 35%
  rebalanceThreshold: 0.03,  // 3%
  autoRebalance: true
});

// Get strategy statistics
const stats = await yieldStrategy.getStats();
// Returns: { currentLiquidity, totalStaked, totalManaged, liquidityRatio, ... }
```

### 4. FiatSettlementBridge

**Purpose**: Handles conversion between tokens (USDC) and fiat currencies for merchant settlements, applying FX rates and settlement fees.

**Key Concepts**:
- Converts USDC ↔ Fiat using real FX rates
- Applies **2% FX markup** (configurable via `FX_MARKUP`)
- Charges **0.5% settlement fee** (configurable via `SETTLEMENT_FEE_RATE`)
- Tracks all settlements for audit trail

**Core Methods**:
```typescript
// Convert tokens to fiat (pay merchant in local currency)
const result = await fiatSettlement.tokenToFiat(
  merchantId,
  1000,  // 1000 USDC
  'EUR'
);
// Returns: { success: true, fiatAmount: 891.8, fxRate: 0.926, 
//           settlementFee: 9.17, settlementId: "..." }

// Convert fiat to tokens (merchant receives tokens)
const result = await fiatSettlement.fiatToToken(
  merchantId,
  1000,  // 1000 EUR
  'EUR'
);
// Returns: { success: true, tokenAmount: 1067.5, fxRate: 1.073, 
//           settlementFee: 5.34, settlementId: "..." }

// Get quote without executing
const quote = await fiatSettlement.getTokenToFiatQuote(1000, 'EUR');
// Returns: { quote: { tokenAmount, fiatAmount, fxRate, settlementFee, 
//                     effectiveFiatAmount } }

const quote = await fiatSettlement.getFiatToTokenQuote(1000, 'EUR');

// Get merchant settlement history
const history = await fiatSettlement.getMerchantSettlements(merchantId, 50);
// Returns: { success: true, settlements: [...] }

// Get settlement by ID
const settlement = await fiatSettlement.getSettlement(settlementId);

// Get settlement statistics
const stats = await fiatSettlement.getSettlementStats(merchantId);
// Returns: { totalSettlements, totalTokenToFiat, totalFiatToToken, 
//           totalFeesCollected, currenciesUsed }

// Update rates
fiatSettlement.setFxMarkup(0.03);        // 3% markup
fiatSettlement.setSettlementFeeRate(0.01); // 1% fee

// Get current rates
const rates = fiatSettlement.getRates();
```

## Integration Example

Here's a complete workflow showing how these modules work together:

```typescript
import custodyWallet from './services/CustodyStablecoinMock';
import lendingProtocol from './services/LendingProtocolMock';
import yieldStrategy from './services/YieldStrategyManager';
import fiatSettlement from './services/FiatSettlementBridge';

async function completeWorkflow() {
  // 1. User deposits 10,000 USDC
  const userId = 'user-123';
  const depositResult = await custodyWallet.deposit(userId, 10000);
  console.log(`User received ${depositResult.shares} shares`);

  // 2. Add liquidity to yield strategy (triggers auto-rebalance if needed)
  await yieldStrategy.addLiquidity(10000);

  // 3. Check if rebalancing is needed
  const rebalanceCheck = await yieldStrategy.shouldRebalance();
  if (rebalanceCheck.shouldRebalance) {
    console.log(`Rebalancing: ${rebalanceCheck.reason}`);
    
    // 4. Execute rebalance (stakes excess liquidity into lending protocol)
    const rebalanceResult = await yieldStrategy.rebalance();
    console.log(`Rebalanced: ${rebalanceResult.message}`);
  }

  // 5. Wait some time, then accrue interest
  // In production, this would be done periodically (e.g., via cron job)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 6. Sync yield from lending protocol to custody wallet
  const syncResult = await yieldStrategy.syncYield();
  console.log(`Interest earned: ${syncResult.interestEarned} USDC`);
  console.log(`New exchange rate: ${syncResult.exchangeRate}`);

  // 7. Check user's balance (should be higher due to yield)
  const balance = await custodyWallet.getUserBalance(userId);
  console.log(`User balance: ${balance.tokenBalance} USDC (${balance.shares} shares)`);

  // 8. Merchant settlement - pay merchant in EUR
  const merchantId = 'merchant-456';
  const settlementResult = await fiatSettlement.tokenToFiat(
    merchantId,
    1000,  // 1000 USDC
    'EUR'
  );
  console.log(`Settled ${settlementResult.fiatAmount} EUR to merchant`);
  console.log(`Settlement fee: ${settlementResult.settlementFee} EUR`);
}
```

## Database Schema

### CustodyWallet
- `id`: UUID
- `totalPoolBalance`: Total tokens in pool
- `totalShares`: Total shares issued
- `exchangeRate`: Current exchange rate (tokens per share)
- `lastRebalanceAt`: Last rebalance timestamp

### UserShare
- `id`: UUID
- `userId`: User ID
- `custodyWalletId`: Reference to custody wallet
- `shares`: User's shares in pool
- `lastDepositAt`: Last deposit timestamp
- `lastWithdrawalAt`: Last withdrawal timestamp

### LendingProtocol
- `id`: UUID
- `name`: Protocol name (e.g., "AaveMock")
- `currentAPR`: Current annual percentage rate
- `totalDeposited`: Total amount deposited
- `totalInterestEarned`: Total interest earned
- `exchangeRate`: Current exchange rate
- `lastAccrualAt`: Last interest accrual timestamp

### LendingDeposit
- `id`: UUID
- `protocolId`: Reference to lending protocol
- `amount`: Deposit amount
- `shares`: Shares received
- `depositRate`: Exchange rate at deposit time

### YieldStrategy
- `id`: UUID
- `minLiquidityBuffer`: Minimum liquidity buffer ratio (e.g., 0.1 = 10%)
- `maxLiquidityBuffer`: Maximum liquidity buffer ratio (e.g., 0.3 = 30%)
- `currentLiquidity`: Current available liquidity
- `totalStaked`: Total amount staked in protocol
- `rebalanceThreshold`: Threshold to trigger rebalance (e.g., 0.05 = 5%)
- `autoRebalance`: Whether to auto-rebalance
- `lastRebalanceAt`: Last rebalance timestamp

### FiatSettlement
- `id`: UUID
- `merchantId`: Reference to merchant
- `settlementType`: "TOKEN_TO_FIAT" or "FIAT_TO_TOKEN"
- `tokenAmount`: Amount in tokens
- `fiatAmount`: Amount in fiat
- `fiatCurrency`: Currency code
- `fxRate`: Exchange rate used
- `fxMarkup`: FX markup applied
- `settlementFee`: Settlement fee charged
- `status`: "PENDING", "COMPLETED", or "FAILED"
- `settledAt`: Settlement timestamp

## Configuration

Environment variables:
```env
# Lending protocol APR (default: 0.05 = 5%)
LENDING_PROTOCOL_APR=0.05

# FX markup for settlements (default: 0.02 = 2%)
FX_MARKUP=0.02

# Settlement fee rate (default: 0.005 = 0.5%)
SETTLEMENT_FEE_RATE=0.005
```

## Best Practices

1. **Periodic Yield Sync**: Call `yieldStrategy.syncYield()` periodically (e.g., every hour or daily) to accrue interest and update exchange rates.

2. **Auto-Rebalancing**: Enable `autoRebalance: true` in YieldStrategy to automatically maintain optimal liquidity buffers.

3. **Monitor Liquidity**: Keep an eye on the liquidity ratio to ensure sufficient funds for user withdrawals.

4. **Settlement Tracking**: Always track settlement IDs for audit purposes and merchant reconciliation.

5. **Exchange Rate Updates**: The custody wallet exchange rate should only be updated by the yield strategy manager to maintain consistency.

6. **Fee Configuration**: Adjust FX markup and settlement fees based on market conditions and business requirements.

## Testing

To test the modules in isolation:

```typescript
// Test custody wallet
const wallet = await custodyWallet.initializeCustodyWallet();
await custodyWallet.deposit('user-1', 1000);
await custodyWallet.deposit('user-2', 2000);
const stats = await custodyWallet.getPoolStats();

// Test lending protocol
await lendingProtocol.initializeProtocol();
await lendingProtocol.deposit(3000);
await lendingProtocol.accrueInterest();
const protocolStats = await lendingProtocol.getStats();

// Test yield strategy
await yieldStrategy.initializeStrategy();
await yieldStrategy.addLiquidity(3000);
const strategyStats = await yieldStrategy.getStats();

// Test fiat settlement
const quote = await fiatSettlement.getTokenToFiatQuote(1000, 'EUR');
const settlement = await fiatSettlement.tokenToFiat(merchantId, 1000, 'EUR');
```

## Future Enhancements

1. **Multiple Custody Wallets**: Support different pools for different strategies
2. **Dynamic APR**: Adjust APR based on utilization rates
3. **Multiple Lending Protocols**: Integrate with real protocols like Aave, Compound
4. **Advanced Rebalancing**: Machine learning for optimal liquidity prediction
5. **Cross-chain Settlements**: Support for settlements across different blockchains
6. **Batched Settlements**: Batch multiple settlements to reduce fees
