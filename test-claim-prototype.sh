#!/bin/bash

# Test script for the claim-prototype endpoint
# This demonstrates how to use the endpoint in a real scenario

echo "=== Testing POST /missions/claim-prototype endpoint ==="
echo ""

# Get a test user ID from the database
USER_ID=$(sqlite3 prisma/dev.db "SELECT id FROM User LIMIT 1;")

if [ -z "$USER_ID" ]; then
  echo "Error: No users found in database. Please run: npm run prisma:seed"
  exit 1
fi

echo "Using test user ID: $USER_ID"
echo ""

# In production, you would use a real Clerk token in the Authorization header
# For testing, we're using the x-test-user-id header (only works in test mode)
echo "Testing with rewardAmount: 100"
echo ""

curl -X POST http://localhost:3000/missions/claim-prototype \
  -H "Content-Type: application/json" \
  -H "x-test-user-id: $USER_ID" \
  -d '{
    "rewardAmount": 100
  }' | jq .

echo ""
echo "=== Test completed ==="
echo ""
echo "In production, replace the x-test-user-id header with:"
echo "  Authorization: Bearer <clerk_session_token>"
