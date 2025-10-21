# YieldStrategyManager Refactoring Documentation

## Overview
This document describes the refactored YieldStrategyManager that integrates with FiatSettlementBridge for fiat deposits/withdrawals and simplifies the architecture by removing liquidity buffer logic.

## Key Changes

### 1. Fiat Integration
The YieldStrategyManager now supports fiat currency deposits and withdrawals through the FiatSettlementBridge.

#### Deposit Flow (Fiat → Stablecoin → Lending Protocol)
```
User Deposits Fiat (e.g., 1000 USD)
    ↓
FiatSettlementBridge converts: Fiat → Stablecoin (with FX + fees)
    ↓
Deposit stablecoin into LendingProtocol
    ↓
Issue shares to user based on LendingProtocol exchange rate
    ↓
Update CustodyStablecoin pool balances
    ↓
Update YieldStrategy totalStaked
```

#### Withdrawal Flow (Lending Protocol → Stablecoin → Fiat)
```
User Requests Fiat Withdrawal (e.g., 100 USD)
    ↓
Calculate required token amount (considering FX rates + fees)
    ↓
Calculate shares to burn based on LendingProtocol exchange rate
    ↓
Check user has sufficient shares
    ↓
Withdraw from LendingProtocol (auto-unstake)
    ↓
Update CustodyStablecoin pool balances
    ↓
Burn user shares
    ↓
Convert tokens to fiat via FiatSettlementBridge
    ↓
Return fiat to user
```

### 2. Removed Liquidity Buffer Logic
The previous implementation maintained a complex liquidity buffer (10-30% of deposits) for withdrawals and performed auto-rebalancing. This has been simplified:

**Removed Methods:**
- `shouldRebalance()` - No longer needed
- `rebalance()` - No longer needed
- `addLiquidity()` - No longer needed
- `removeLiquidity()` - No longer needed
- `addLiquidityInternal()` - No longer needed
- `updateSettings()` - No longer needed

**Simplified Approach:**
- All deposits go directly to LendingProtocol
- All withdrawals come directly from LendingProtocol (auto-unstake)
- No liquidity buffer management required

### 3. New Methods

#### `deposit(userId: string, fiatAmount: number, currency: string = 'USD')`
Deposits fiat currency and issues shares to the user.

**Parameters:**
- `userId`: User identifier
- `fiatAmount`: Amount in fiat currency
- `currency`: Currency code (default: 'USD')

**Returns:**
```typescript
{
  success: boolean;
  shares?: number;          // Shares issued
  tokenAmount?: number;     // Stablecoin amount after conversion
  fiatAmount?: number;      // Original fiat amount
  fxRate?: number;          // FX rate used
  exchangeRate?: number;    // LendingProtocol exchange rate
  message?: string;
}
```

#### `withdraw(userId: string, fiatAmount: number, currency: string = 'USD')`
Withdraws fiat currency by burning user shares.

**Parameters:**
- `userId`: User identifier
- `fiatAmount`: Amount in fiat currency
- `currency`: Currency code (default: 'USD')

**Returns:**
```typescript
{
  success: boolean;
  shares?: number;          // Shares burned
  tokenAmount?: number;     // Stablecoin amount withdrawn
  fiatAmount?: number;      // Fiat amount received
  fxRate?: number;          // FX rate used
  exchangeRate?: number;    // LendingProtocol exchange rate
  message?: string;
}
```

#### `getUserBalance(userId: string, currency: string = 'USD')`
Gets user's balance in both tokens and fiat.

**Parameters:**
- `userId`: User identifier
- `currency`: Currency code for fiat conversion (default: 'USD')

**Returns:**
```typescript
{
  success: boolean;
  shares?: number;          // User's shares
  tokenBalance?: number;    // Balance in tokens (USDC)
  fiatBalance?: number;     // Balance in fiat
  exchangeRate?: number;    // LendingProtocol exchange rate
  fxRate?: number;          // FX rate used for conversion
}
```

#### `hasSufficientBalance(userId: string, fiatAmount: number, currency: string = 'USD')`
Checks if user has sufficient balance for withdrawal.

**Parameters:**
- `userId`: User identifier
- `fiatAmount`: Required amount in fiat
- `currency`: Currency code (default: 'USD')

**Returns:**
```typescript
{
  success: boolean;
  hasSufficient?: boolean;
  currentBalance?: number;
  requiredBalance?: number;
}
```

### 4. Updated Methods

#### `syncYield()`
Synchronizes exchange rate from LendingProtocol to CustodyStablecoin.
- Accrues interest in LendingProtocol
- Updates CustodyStablecoin exchange rate
- Updates YieldStrategy totalStaked with interest earned

#### `getStats()`
Returns simplified statistics (no liquidity buffer data).

**Returns:**
```typescript
{
  success: boolean;
  stats?: {
    totalStaked: number;      // Total amount staked in LendingProtocol
    totalUsers: number;       // Number of users with shares
    exchangeRate: number;     // Current LendingProtocol exchange rate
  };
}
```

## Architecture Benefits

### 1. Simplicity
- Removed complex liquidity buffer management
- Direct deposit/withdrawal to/from LendingProtocol
- Easier to understand and maintain

### 2. Fiat Support
- Users can deposit and withdraw in their local currency
- Automatic FX conversion handled by FiatSettlementBridge
- Transparent fee structure (FX markup + settlement fees)

### 3. Auto-Unstaking
- Withdrawals automatically unstake from LendingProtocol as needed
- No need to pre-maintain liquidity buffers
- Users always have access to their full balance

### 4. Yield Optimization
- 100% of deposits earn yield in LendingProtocol
- No idle funds sitting in liquidity buffers
- Maximum yield generation for all users

## Example Usage

### Deposit Example
```typescript
const yieldStrategy = new YieldStrategyManager();

// Initialize
await yieldStrategy.initializeStrategy();

// Deposit 1000 USD
const result = await yieldStrategy.deposit('user-123', 1000, 'USD');
console.log(`Received ${result.shares} shares`);
console.log(`Token amount: ${result.tokenAmount} USDC`);
```

### Withdrawal Example
```typescript
// Check balance first
const balance = await yieldStrategy.getUserBalance('user-123', 'USD');
console.log(`Balance: ${balance.fiatBalance} USD`);

// Check if sufficient balance
const check = await yieldStrategy.hasSufficientBalance('user-123', 100, 'USD');
if (check.hasSufficient) {
  // Withdraw 100 USD
  const result = await yieldStrategy.withdraw('user-123', 100, 'USD');
  console.log(`Withdrew ${result.fiatAmount} USD`);
  console.log(`Burned ${result.shares} shares`);
}
```

### Yield Sync Example
```typescript
// Periodically sync yield (e.g., via cron job)
const syncResult = await yieldStrategy.syncYield();
console.log(`Interest earned: ${syncResult.interestEarned} USDC`);
console.log(`New exchange rate: ${syncResult.exchangeRate}`);
```

## Migration Notes

### For Existing Code
If you have existing code using the old API:

**Before:**
```typescript
// Old API - token amounts only
await yieldStrategy.deposit(userId, 1000); // 1000 tokens
await yieldStrategy.withdraw(userId, 100); // 100 tokens
```

**After:**
```typescript
// New API - fiat amounts with currency
await yieldStrategy.deposit(userId, 1000, 'USD'); // 1000 USD
await yieldStrategy.withdraw(userId, 100, 'USD'); // 100 USD
```

### Breaking Changes
- `deposit()` now requires currency parameter and converts fiat
- `withdraw()` now requires currency parameter and converts to fiat
- `getUserBalance()` now returns fiat balance in addition to token balance
- Removed: `shouldRebalance()`, `rebalance()`, `addLiquidity()`, `removeLiquidity()`, `updateSettings()`
- `getStats()` now returns simplified structure without liquidity buffer fields

## Testing

Run the test suite to verify functionality:
```bash
npm run setup           # Initialize database
npx ts-node src/test-modules.ts  # Run tests
```

Tests cover:
1. Deposit flow with fiat conversion
2. User balance queries in both tokens and fiat
3. Withdrawal flow with fiat conversion
4. Yield synchronization
5. Balance checks

## Future Enhancements

Potential improvements for future versions:

1. **Multi-Currency Support**: Support deposits/withdrawals in multiple currencies simultaneously
2. **Slippage Protection**: Add slippage limits for large withdrawals
3. **Batch Operations**: Support batch deposits/withdrawals for efficiency
4. **Event Logging**: Emit events for deposits, withdrawals, and yield accruals
5. **Performance Metrics**: Track APY, total yield earned, etc.
