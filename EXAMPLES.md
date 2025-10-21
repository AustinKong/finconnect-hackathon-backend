# GlobeTrotter+ API Usage Examples

This document provides practical examples of using the GlobeTrotter+ Backend API.

## Setup

Start the server:
```bash
npm run dev
```

Get a test user ID:
```bash
sqlite3 prisma/dev.db "SELECT id, name, email FROM User;"
```

## Wallet Operations

### 1. Get Wallet Balance
```bash
curl -s "http://localhost:3000/wallet/{userId}" | jq
```

Response:
```json
{
  "wallet": {
    "balance": 1000,
    "stakedAmount": 500,
    "yieldEarned": 25
  },
  "yieldRate": 0.05
}
```

### 2. Top Up Wallet
```bash
curl -X POST http://localhost:3000/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "amount": 250,
    "currency": "USD"
  }' | jq
```

### 3. Stake Funds for Yield
```bash
curl -X POST http://localhost:3000/wallet/stake \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "amount": 100
  }' | jq
```

### 4. Unstake Funds
```bash
curl -X POST http://localhost:3000/wallet/unstake \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "amount": 50
  }' | jq
```

### 5. Get Transaction History
```bash
curl -s "http://localhost:3000/wallet/{userId}/transactions?limit=10" | jq
```

## POS Transactions

### 1. Make a Purchase
```bash
# Get a merchant ID first
sqlite3 prisma/dev.db "SELECT id, name, country FROM Merchant LIMIT 1;"

curl -X POST http://localhost:3000/pos/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "merchantId": "{merchantId}",
    "amount": 50,
    "currency": "USD"
  }' | jq
```

Response includes:
- Authorization status
- Capture confirmation
- FX conversion details (if applicable)
- Auto-unstake info (if triggered)
- Mission progress updates

### 2. Process a Refund
```bash
curl -X POST http://localhost:3000/pos/refund \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "{transactionId}",
    "amount": 25
  }' | jq
```

## Missions

### 1. Get All Active Missions
```bash
curl -s "http://localhost:3000/missions" | jq
```

### 2. Get User's Enrolled Missions
```bash
curl -s "http://localhost:3000/missions/user/{userId}" | jq
```

### 3. Get Available Missions
```bash
curl -s "http://localhost:3000/missions/user/{userId}/available" | jq
```

### 4. Enroll in a Mission
```bash
curl -X POST http://localhost:3000/missions/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "missionId": "{missionId}"
  }' | jq
```

### 5. Claim Mission Reward
```bash
curl -X POST http://localhost:3000/missions/claim \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}",
    "missionId": "{missionId}"
  }' | jq
```

### 6. Create a New Mission (Admin)
```bash
curl -X POST http://localhost:3000/missions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Coffee Lover",
    "description": "Spend $100 at coffee shops worldwide",
    "type": "SPEND_CATEGORY",
    "targetValue": 100,
    "targetCategory": "FOOD_BEVERAGE",
    "rewardAmount": 20,
    "rewardType": "CASHBACK"
  }' | jq
```

## Analytics

### 1. Get User Analytics
```bash
curl -s "http://localhost:3000/analytics/user/{userId}" | jq
```

Response includes:
- Wallet summary
- Total transactions and spending
- Spending by category
- Mission stats
- Rewards earned

### 2. Get Spending Trends
```bash
# Last 30 days
curl -s "http://localhost:3000/analytics/user/{userId}/spending-trends?period=30" | jq
```

### 3. Get Global Analytics
```bash
curl -s "http://localhost:3000/analytics/global" | jq
```

## Foreign Exchange

### 1. Get All Supported Currencies
```bash
curl -s "http://localhost:3000/fx/rates" | jq
```

### 2. Get Specific Exchange Rate
```bash
curl -s "http://localhost:3000/fx/rate/USD/EUR" | jq
```

Response:
```json
{
  "from": "USD",
  "to": "EUR",
  "rate": 0.93,
  "timestamp": "2025-10-21T15:00:00.000Z"
}
```

### 3. Convert Currency
```bash
curl -X POST http://localhost:3000/fx/convert \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "from": "USD",
    "to": "JPY",
    "includeMarkup": true
  }' | jq
```

Response:
```json
{
  "conversion": {
    "originalAmount": 100,
    "convertedAmount": 14950,
    "rate": 149.5,
    "markup": 0.02,
    "finalAmount": 15249,
    "fromCurrency": "USD",
    "toCurrency": "JPY"
  }
}
```

### 4. Get Rate History
```bash
curl -s "http://localhost:3000/fx/history/USD/EUR" | jq
```

## Mock Services

### Stablecoin Operations

#### Get Current Yield Rate
```bash
curl -s "http://localhost:3000/mock/stablecoin/rate" | jq
```

Response:
```json
{
  "yieldRate": 0.05,
  "apy": "5.00%",
  "dailyRate": 0.00013698630136986303
}
```

#### Calculate Yield
```bash
curl -X POST http://localhost:3000/mock/stablecoin/yield \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "{userId}"
  }' | jq
```

### Visa Network Operations

#### Authorize Transaction
```bash
curl -X POST http://localhost:3000/mock/visa/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "cardNumber": "4111111111111111",
    "amount": 100,
    "currency": "USD",
    "merchantId": "test-merchant"
  }' | jq
```

Response:
```json
{
  "success": true,
  "authorizationId": "AUTH_1761060185105_90dasaah8",
  "amount": 100,
  "currency": "USD",
  "status": "AUTHORIZED",
  "timestamp": "2025-10-21T15:00:00.000Z"
}
```

#### Capture Transaction
```bash
curl -X POST http://localhost:3000/mock/visa/capture \
  -H "Content-Type: application/json" \
  -d '{
    "authorizationId": "AUTH_1761060185105_90dasaah8",
    "amount": 100
  }' | jq
```

#### Get Authorization Details
```bash
curl -s "http://localhost:3000/mock/visa/authorization/{authorizationId}" | jq
```

#### Calculate Processing Fee
```bash
curl -s "http://localhost:3000/mock/visa/fee/100" | jq
```

Response:
```json
{
  "amount": 100,
  "fee": 2.9,
  "total": 102.9,
  "feePercentage": "2.9%"
}
```

## Complete User Journey Example

### Scenario: Alice travels to Tokyo and makes a purchase

```bash
# 1. Check wallet balance
ALICE_ID="<alice-user-id>"
curl -s "http://localhost:3000/wallet/$ALICE_ID" | jq '.wallet | {balance, stakedAmount}'

# 2. Top up wallet if needed
curl -X POST http://localhost:3000/wallet/topup \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"amount\":500,\"currency\":\"USD\"}" | jq

# 3. Enroll in "Global Explorer" mission
MISSION_ID="global-explorer"
curl -X POST http://localhost:3000/missions/enroll \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"missionId\":\"$MISSION_ID\"}" | jq

# 4. Make purchase at Starbucks Tokyo
MERCHANT_ID="starbucks-tokyo"
curl -X POST http://localhost:3000/pos/authorize \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\":\"$ALICE_ID\",
    \"merchantId\":\"$MERCHANT_ID\",
    \"amount\":800,
    \"currency\":\"JPY\"
  }" | jq

# 5. Check mission progress
curl -s "http://localhost:3000/missions/user/$ALICE_ID" | jq

# 6. View analytics
curl -s "http://localhost:3000/analytics/user/$ALICE_ID" | jq
```

## Testing with the Provided Script

Run the comprehensive test script:
```bash
./test-api.sh
```

This will test all major endpoints and provide a quick overview of the API functionality.

## Using Prisma Studio

For a visual database browser:
```bash
npm run prisma:studio
```

Then open http://localhost:5555 in your browser to:
- View and edit all database records
- See relationships between models
- Run queries visually
- Monitor real-time data changes
