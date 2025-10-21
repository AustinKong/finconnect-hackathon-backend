# Refactoring Summary: CustodyStablecoinMock and YieldStrategyManager

## Problem Statement
CustodyStablecoinMock was doing too much - it acted as both a stablecoin wallet AND managed individual user shares. The goal was to separate these concerns so that:
- **CustodyStablecoinMock**: Only acts like a Stablecoin wallet (manages pool-level data)
- **YieldStrategyManager**: Handles all user share management

## Changes Made

### 1. CustodyStablecoinMock (src/mock/CustodyStablecoinMock.ts)
**Removed responsibilities:**
- User deposit/withdraw operations
- User share tracking and management
- User balance queries

**Kept responsibilities:**
- Pool wallet initialization and management
- Pool balance and shares tracking (totalPoolBalance, totalShares)
- Exchange rate management
- Pool-level statistics

**New methods:**
- `updatePoolBalance(balanceDelta, sharesDelta)`: Allows YieldStrategyManager to update pool totals
- `getExchangeRate()`: Returns current exchange rate for calculations

**Modified methods:**
- `getPoolStats()`: Removed `totalUsers` field (now managed by YieldStrategyManager)
- `getCustodyWallet()`: Removed user shares include

### 2. YieldStrategyManager (src/services/YieldStrategyManager.ts)
**Added responsibilities:**
- User deposit operations (creates/updates UserShare records)
- User withdrawal operations (burns UserShare records)
- User balance queries

**New methods:**
- `deposit(userId, tokenAmount)`: Handle user deposits and share allocation
- `withdraw(userId, tokenAmount)`: Handle user withdrawals and share burning
- `getUserBalance(userId)`: Get user's token balance from their shares
- `getCustodyWalletId()`: Private helper to get custody wallet ID

**Modified methods:**
- `initializeStrategy()`: Now also initializes custody wallet reference
- `getStats()`: Added `totalUsers` field to track user count
- `addLiquidityInternal()`: Private method for internal use without auto-rebalancing

**Kept responsibilities:**
- Liquidity buffer management
- Stake/unstake decision making
- Auto-rebalancing
- Yield synchronization

### 3. StablecoinYieldAdapterMock (src/services/StablecoinYieldAdapterMock.ts)
**New file created:**
- Adapter layer for wallet operations
- Provides `getYieldRate()` method for UI/API
- Provides `autoUnstake()` method for POS transactions
- Acts as a bridge between existing wallet routes and new YieldStrategyManager

### 4. Test Updates (src/test-modules.ts)
**Updated to use new architecture:**
- User deposits now go through `yieldStrategy.deposit()` instead of `custodyWallet.deposit()`
- User balance queries now go through `yieldStrategy.getUserBalance()` instead of `custodyWallet.getUserBalance()`
- Removed manual `yieldStrategy.addLiquidity()` call (now handled internally by deposit)
- Updated stats display to show user count from strategy stats

## Architecture Flow

### Deposit Flow
1. User calls `yieldStrategy.deposit(userId, amount)`
2. YieldStrategyManager calculates shares based on current exchange rate
3. YieldStrategyManager updates custody wallet pool totals via `custodyWallet.updatePoolBalance()`
4. YieldStrategyManager creates/updates UserShare record
5. YieldStrategyManager adds liquidity to strategy buffer
6. Auto-rebalancing may occur if enabled and threshold met

### Withdrawal Flow
1. User calls `yieldStrategy.withdraw(userId, amount)`
2. YieldStrategyManager validates user has sufficient shares
3. YieldStrategyManager removes liquidity from buffer (may trigger unstaking)
4. YieldStrategyManager updates custody wallet pool totals via `custodyWallet.updatePoolBalance()`
5. YieldStrategyManager updates UserShare record
6. Auto-rebalancing may occur if enabled and threshold met

## Benefits
1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Maintainability**: Easier to understand and modify each component independently
3. **Testability**: Components can be tested in isolation
4. **Scalability**: Clear boundaries make it easier to add new features
5. **Correctness**: User share management is now tightly coupled with liquidity management

## Testing
All existing tests pass successfully:
- ✅ Original test-modules.ts passes
- ✅ Comprehensive refactoring tests pass
- ✅ Build completes without errors
- ✅ All TypeScript type checks pass
