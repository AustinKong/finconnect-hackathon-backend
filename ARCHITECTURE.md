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
│  │UserMis   │Exchange  │             │           │           │ │
│  │sion      │Rate      │             │           │           │ │
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
7. **ExchangeRate** - FX rates between currencies

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
