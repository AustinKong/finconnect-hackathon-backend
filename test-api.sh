#!/bin/bash
# Test script for GlobeTrotter+ Backend API
# Run this after starting the server with: npm run dev

BASE_URL="http://localhost:3000"

echo "🧪 GlobeTrotter+ Backend API Test Suite"
echo "========================================"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
curl -s "$BASE_URL/health" | jq .
echo ""

# Test 2: Get all missions
echo "2️⃣  Testing Missions Endpoint..."
curl -s "$BASE_URL/missions" | jq '.missions[] | {title, rewardAmount, type}'
echo ""

# Test 3: Get global analytics
echo "3️⃣  Testing Analytics Endpoint..."
curl -s "$BASE_URL/analytics/global" | jq .
echo ""

# Test 4: Get FX rates
echo "4️⃣  Testing FX Rates..."
curl -s "$BASE_URL/fx/rates" | jq '{currencies: .currencies[:5]}'
echo ""

# Test 5: Convert currency
echo "5️⃣  Testing Currency Conversion (100 USD to EUR)..."
curl -s -X POST "$BASE_URL/fx/convert" \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"from":"USD","to":"EUR","includeMarkup":true}' \
  | jq .conversion
echo ""

# Test 6: Mock stablecoin rate
echo "6️⃣  Testing Mock Stablecoin Yield Rate..."
curl -s "$BASE_URL/mock/stablecoin/rate" | jq .
echo ""

# Test 7: Mock Visa authorization
echo "7️⃣  Testing Mock Visa Authorization..."
curl -s -X POST "$BASE_URL/mock/visa/authorize" \
  -H "Content-Type: application/json" \
  -d '{"cardNumber":"4111111111111111","amount":50,"currency":"USD","merchantId":"test-merchant"}' \
  | jq '{success, authorizationId, status}'
echo ""

# Get user ID for wallet tests
echo "8️⃣  Getting Test User ID..."
cd /home/runner/work/finconnect-hackathon-backend/finconnect-hackathon-backend
USER_ID=$(sqlite3 prisma/dev.db "SELECT id FROM User LIMIT 1;")
echo "User ID: $USER_ID"
echo ""

# Test 8: Get wallet
echo "9️⃣  Testing Get Wallet..."
curl -s "$BASE_URL/wallet/$USER_ID" | jq '{balance: .wallet.balance, stakedAmount: .wallet.stakedAmount, yieldRate}'
echo ""

# Test 9: Top up wallet
echo "🔟 Testing Wallet Top-up (Adding $100)..."
curl -s -X POST "$BASE_URL/wallet/topup" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"amount\":100,\"currency\":\"USD\"}" \
  | jq '{success, newBalance: .wallet.balance}'
echo ""

echo "✅ Test suite completed!"
echo ""
echo "To run the server: npm run dev"
echo "To view database: npm run prisma:studio"
