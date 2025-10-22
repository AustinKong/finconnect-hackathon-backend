# Claim Prototype Endpoint Guide

## Overview

The `/missions/claim-prototype` endpoint is a prototype/testing endpoint that simulates completing an arbitrary mission and credits the reward to the authenticated user's wallet.

## Endpoint

```
POST /missions/claim-prototype
```

**Authentication Required**: Yes (Clerk token)

## Use Case

This endpoint is designed for:
- **Testing**: Quickly test the mission reward flow without completing actual missions
- **Prototyping**: Demonstrate the reward crediting mechanism
- **Development**: Speed up development by simulating mission completions

## Request

### Headers

```
Content-Type: application/json
Authorization: Bearer <clerk_session_token>
```

In test mode (`NODE_ENV=test`), you can use:
```
x-test-user-id: <user-id>
```

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rewardAmount` | number | Yes | The amount of reward to credit in USD. Must be positive. |

### Example Request

```bash
curl -X POST http://localhost:3000/missions/claim-prototype \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_..." \
  -d '{
    "rewardAmount": 50
  }'
```

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "rewardAmount": 50,
  "wallet": {
    "id": "wallet-id",
    "userId": "user-id",
    "balance": 150.50,
    "shares": 125.75,
    "autoStake": true,
    "yieldEarned": 5.25,
    "createdAt": "2024-10-22T10:00:00.000Z",
    "updatedAt": "2024-10-22T10:05:00.000Z"
  },
  "autoStaked": 48.77,
  "message": "Reward of 50 USD credited and auto-staked"
}
```

**Response Fields:**

- `success`: Boolean indicating if the operation was successful
- `rewardAmount`: The amount credited
- `wallet`: Updated wallet object with current balances
- `autoStaked`: Amount that was automatically staked (only present if auto-staking is enabled)
- `message`: Human-readable success message

### Error Responses

#### 400 Bad Request - Missing rewardAmount

```json
{
  "error": "rewardAmount is required and must be a positive number"
}
```

#### 400 Bad Request - Invalid rewardAmount

```json
{
  "error": "rewardAmount is required and must be a positive number"
}
```

#### 401 Unauthorized - Missing authentication

```json
{
  "error": "Unauthorized"
}
```

## Behavior

### Auto-Staking

If the user's wallet has auto-staking enabled:
1. The reward amount is automatically deposited into the lending protocol
2. The user receives shares representing their staked amount
3. The staked funds begin earning yield immediately
4. The response includes the `autoStaked` amount

If auto-staking is disabled:
1. The reward is added directly to the wallet balance
2. No shares are created
3. The response does not include an `autoStaked` field

### Transaction Recording

Every successful claim creates two transactions in the database:
1. A `MISSION_REWARD` transaction recording the reward credit
2. A `STAKE` transaction if the reward was auto-staked

### Logging

The endpoint logs reward issuance events:

```
[REWARD_ISSUED] { prototype: true, reward_usdc_cents: 5000, auto_staked: true }
```

## Testing

### Unit Tests

The endpoint has comprehensive test coverage in `src/__tests__/claim-prototype.test.ts`:

- ✅ Successfully claims reward with auto-staking
- ✅ Successfully claims reward without auto-staking
- ✅ Validates rewardAmount parameter
- ✅ Requires authentication
- ✅ Creates proper transaction records

Run tests with:
```bash
npm test claim-prototype.test.ts
```

### Integration Testing

Use the provided test script:

```bash
./test-claim-prototype.sh
```

Or manually with curl:

```bash
# Get a user ID from your database
USER_ID=$(sqlite3 prisma/dev.db "SELECT id FROM User LIMIT 1;")

# Test the endpoint
curl -X POST http://localhost:3000/missions/claim-prototype \
  -H "Content-Type: application/json" \
  -H "x-test-user-id: $USER_ID" \
  -d '{"rewardAmount": 100}'
```

## Production Considerations

### Security

⚠️ **Important**: This is a prototype endpoint and should be carefully considered before deploying to production:

1. **Access Control**: Consider restricting this endpoint to admin users only
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **Audit Logging**: Add comprehensive audit logs for all claims
4. **Amount Limits**: Consider adding maximum reward amount limits
5. **Disable in Production**: You may want to disable this endpoint entirely in production

### Recommended Production Setup

```typescript
// Example: Restrict to admin users only
router.post('/claim-prototype', requireAuthMiddleware, requireAdminMiddleware, async (req, res) => {
  // ... endpoint logic
});
```

Or disable in production:

```typescript
if (process.env.NODE_ENV !== 'production') {
  router.post('/claim-prototype', requireAuthMiddleware, async (req, res) => {
    // ... endpoint logic
  });
}
```

## Related Endpoints

- `POST /missions/claim` - Claim rewards for actual completed missions
- `POST /missions/enroll` - Enroll in a mission
- `GET /missions/user` - View user's missions and progress
- `POST /wallet/topup` - Top up wallet (alternative way to add funds)

## Support

For issues or questions about this endpoint:
1. Check the test suite for usage examples
2. Review the transaction logs in the database
3. Verify Clerk authentication is properly configured
4. Ensure the user's wallet exists before claiming
