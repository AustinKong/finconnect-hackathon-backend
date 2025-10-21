# GlobeTrotter+ Backend Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GlobeTrotter+ Backend                         │
│                     (Express + TypeScript)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         API Routes                               │
├─────────────┬───────────┬──────────┬──────────┬────────┬────────┤
│   Wallet    │    POS    │ Missions │Analytics │   FX   │  Mock  │
│  /wallet    │   /pos    │/missions │/analytics│  /fx   │ /mock  │
└─────────────┴───────────┴──────────┴──────────┴────────┴────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Services Layer                             │
├──────────────────────┬──────────────────┬──────────────────────┤
│ StablecoinYield      │  VisaNetwork     │   MissionEngine      │
│ AdapterMock          │  Mock            │                      │
│ - stake()            │ - authorize()    │ - evaluate()         │
│ - unstake()          │ - capture()      │ - enroll()           │
│ - calculateYield()   │ - getProcessing  │ - claimReward()      │
│ - autoUnstake()      │   Fee()          │ - getAvailable()     │
├──────────────────────┴──────────────────┴──────────────────────┤
│                      FXService                                   │
│  - getRate()  - convert()  - getSupportedCurrencies()           │
├─────────────────────────────────────────────────────────────────┤
│            New GlobeTrotter+ Advanced Modules                   │
├──────────────────┬───────────────────┬────────────────────────┤
│ CustodyStablecoin│ LendingProtocol   │ YieldStrategy          │
│ Mock             │ Mock              │ Manager                │
│ - deposit()      │ - deposit()       │ - rebalance()          │
│ - withdraw()     │ - withdraw()      │ - addLiquidity()       │
│ - getUserBalance()│ - accrueInterest()│ - removeLiquidity()    │
│ - getPoolStats() │ - getStats()      │ - syncYield()          │
├──────────────────┴───────────────────┴────────────────────────┤
│                   FiatSettlementBridge                          │
│  - tokenToFiat()  - fiatToToken()  - getQuote()                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Prisma ORM Layer                              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SQLite Database                                │
│  ┌──────────┬──────────┬─────────────┬───────────┬───────────┐ │
│  │  User    │  Wallet  │ Transaction │  Merchant │  Mission  │ │
│  ├──────────┼──────────┼─────────────┼───────────┼───────────┤ │
│  │UserMis   │Custody   │Lending      │Fiat       │Yield      │ │
│  │sion      │Wallet    │Protocol     │Settlement │Strategy   │ │
│  │          │UserShare │LendingDep   │           │           │ │
│  └──────────┴──────────┴─────────────┴───────────┴───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Models

### Core Models
1. **User** - User accounts
2. **Wallet** - User's wallet with balance, staked amount, yield
3. **Transaction** - All financial transactions
4. **Merchant** - Merchants where users can spend
5. **Mission** - Gamified travel missions
6. **UserMission** - User's progress on missions

### New GlobeTrotter+ Models
7. **CustodyWallet** - Pooled wallet with share-based accounting
8. **UserShare** - User's shares in the custody pool
9. **LendingProtocol** - Aave-style lending protocol for yield
10. **LendingDeposit** - Individual deposits in lending protocol
11. **YieldStrategy** - Liquidity buffer and rebalancing strategy
12. **FiatSettlement** - Merchant fiat settlements with FX

## API Flow Examples

### 1. Wallet Top-up Flow
```
Client → POST /wallet/topup
         ↓
      Validate user & amount
         ↓
      Update wallet balance
         ↓
      Create transaction record
         ↓
      Return updated wallet
```

### 2. POS Purchase Flow
```
Client → POST /pos/authorize
         ↓
      Get merchant details
         ↓
      Convert currency (FXService)
         ↓
      Auto-unstake if needed (StablecoinYieldAdapter)
         ↓
      Authorize with Visa (VisaNetworkMock)
         ↓
      Deduct from wallet
         ↓
      Create transaction
         ↓
      Evaluate missions (MissionEngine)
         ↓
      Capture transaction (VisaNetworkMock)
         ↓
      Return result with mission updates
```

### 3. Mission Completion Flow
```
Transaction created
         ↓
      MissionEngine.evaluateTransaction()
         ↓
      Check all user's active missions
         ↓
      Update progress based on:
         - Spend amount
         - Merchant category
         - Specific merchant
         - Country
         ↓
      If target reached:
         - Mark as completed
         - Auto-claim reward
         - Add to wallet balance
```

## Key Features

### Auto-Unstake Mechanism
When a user makes a purchase and has insufficient balance:
1. Check if staked amount can cover shortfall
2. Automatically unstake required amount
3. Proceed with transaction
4. Return notification of auto-unstake

### FX Conversion
All transactions in foreign currency:
1. Look up exchange rate (from/to)
2. Apply 2% markup
3. Convert to USD
4. Process transaction
5. Record original and converted amounts

### Mission Evaluation
After each transaction:
1. Get user's active missions
2. Check if transaction matches mission criteria
3. Update progress
4. Auto-complete and claim rewards
5. Return missions updated/completed count

## Service Integrations

### StablecoinYieldAdapterMock
Simulates a yield-bearing stablecoin protocol:
- **APY**: 5% (configurable)
- **Daily Rate**: APY / 365
- **Features**: Stake, unstake, auto-unstake, yield calculation

### VisaNetworkMock
Simulates Visa payment network:
- **Processing Fee**: 2.9% (configurable)
- **Authorization**: Reserve funds
- **Capture**: Charge funds
- **Tracking**: Store auth/capture history

## Environment Configuration

```env
DATABASE_URL          # SQLite database location
PORT                  # Server port (default: 3000)
NODE_ENV              # Environment (development/production)
STABLECOIN_YIELD_RATE # Annual yield rate (default: 0.05)
VISA_PROCESSING_FEE   # Visa fee percentage (default: 0.029)
```

## Endpoints Summary

### Wallet Management
- Get wallet, top-up, stake, unstake, transactions

### POS Operations
- Authorize purchases, process refunds

### Missions
- List missions, enroll, track progress, claim rewards

### Analytics
- User stats, spending trends, global metrics

### Foreign Exchange
- Get rates, convert currency, rate history

### Mock Services
- Stablecoin operations, Visa operations

## Database Seed Data

**Users**: 2 test users (Alice, Bob)
**Merchants**: 10 global merchants across 8 countries
**Missions**: 2 active missions
**Exchange Rates**: 8 currency pairs
**Currencies Supported**: 15 (USD, EUR, GBP, JPY, SGD, AUD, etc.)

## GlobeTrotter+ Advanced Modules

The platform now includes 4 advanced modules for yield generation and merchant settlements:

### 1. CustodyStablecoinMock
Manages a pooled custody wallet where user deposits are tracked via shares (similar to Uniswap LP tokens). The share value increases as yield is earned from the lending protocol.

### 2. LendingProtocolMock
Simulates an Aave-style lending protocol with continuous compound interest (5% APR by default). Deposited funds earn yield through an increasing exchange rate: `rate(t) = rate(0) × e^(APR × t)`

### 3. YieldStrategyManager
Intelligently manages liquidity by:
- Maintaining 10-30% liquidity buffer for withdrawals
- Auto-staking excess liquidity into lending protocol
- Auto-unstaking when liquidity is needed
- Rebalancing when deviation exceeds 5%

### 4. FiatSettlementBridge
Handles token ↔ fiat conversions for merchant settlements:
- Applies real-time FX rates (from FXServiceMock)
- 2% FX markup for conversions
- 0.5% settlement fee
- Full audit trail for all settlements

**See MODULES.md for detailed documentation and usage examples.**
