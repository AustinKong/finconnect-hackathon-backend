# GlobeTrotter+ E2E Test

## Overview

This E2E test validates the complete GlobeTrotter+ flow including:
- User/wallet/card creation
- Topup with auto-staking
- Yield accrual simulation
- Cross-border POS transactions with auto-unstaking
- Mission completion and reward auto-staking
- Analytics summary

## Running the Tests

### Run Individual Test Suites

```bash
# Run GlobeTrotter+ E2E test
npm test -- globetrotter.e2e.test.ts

# Run POS E2E tests
npm test -- pos.e2e.test.ts
```

### Test Scenarios Covered

#### GlobeTrotter+ E2E Test (`globetrotter.e2e.test.ts`)
1. **Setup**: Create user, wallet (auto-stake enabled), card, merchants, and mission
2. **Topup**: Add $1000 with automatic staking → shares > 0
3. **Yield Accrual**: Simulate +10 days of interest accrual
4. **Non-Partner Purchase**: Authorize €120 at NONPARTNER_FR merchant
   - Triggers auto-unstaking to cover transaction
   - FX conversion EUR→USD
   - Shares decrease due to unstaking
5. **Partner Purchase**: Authorize €60 at Eiffel Tower Gift Shop
   - Completes mission (≥€50 spent at partner)
   - Auto-claims €5 reward
   - Reward is auto-staked (increases shares)
6. **Additional Yield**: Simulate +1 day of yield accrual
7. **Analytics Verification**: Check summary endpoint for:
   - Total transactions: 8
   - Purchase transactions: 2
   - Cross-border transactions: 2
   - Missions completed: 1
   - Rewards earned: €5

## New Endpoints Added

### POST /yield/accrue
Manually trigger yield accrual (for testing).

**Request Body:**
```json
{
  "now_sec": 1234567890  // Optional: Unix timestamp to simulate time
}
```

**Response:**
```json
{
  "success": true,
  "oldRate": 1.0,
  "newRate": 1.00137,
  "interestEarned": 0.0000001,
  "message": "Interest accrued successfully"
}
```

### GET /analytics/summary
Get comprehensive analytics summary.

**Query Parameters:**
- `userId` (optional): Filter by specific user

**Response:**
```json
{
  "transactions": {
    "total": 8,
    "purchases": 2,
    "totalVolume": 1000
  },
  "crossBorder": {
    "count": 2,
    "volume": 198.288
  },
  "missions": {
    "completed": 1,
    "active": 0,
    "rewardsEarned": 5
  },
  "staking": {
    "shares": 782.34,
    "stakedValue": 783.52,
    "yieldEarned": 0
  }
}
```

## Key Implementation Details

### Auto-Unstaking for POS
When a user makes a purchase with insufficient balance but has staked funds:
1. Calculate deficit: `required_amount - current_balance`
2. Calculate shares to burn: `deficit / exchange_rate`
3. Withdraw from lending protocol
4. Add to wallet balance
5. Proceed with purchase authorization

### Reward Auto-Staking
When a mission is completed:
1. Mission reward is automatically claimed
2. If `wallet.autoStake` is enabled, reward goes through staking flow
3. Creates both MISSION_REWARD and STAKE transactions
4. Increases user's shares

### Yield Accrual
- Continuous compound interest: `value = principal * e^(APR * time_in_years)`
- Exchange rate increases over time based on APR
- Shares remain constant; value grows with exchange rate

## Test Notes

- Tests use SQLite database at `./dev.db`
- Each test suite creates its own test data and cleans up after
- Tests should be run individually due to Express server lifecycle
- Jest configured with `maxWorkers: 1` for sequential execution
