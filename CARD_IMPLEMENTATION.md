# Card Implementation - 1:N Wallet-to-Card Relationship

## Overview

This document describes the implementation of a 1:N wallet-to-card relationship where one wallet can have multiple cards. Cards are used for POS transactions but do not hold any balance - all transactions are debited from the associated wallet.

## Database Schema Changes

### Card Model

A new `Card` model was added to the Prisma schema with the following fields:

```prisma
model Card {
  id              String   @id @default(uuid())
  walletId        String
  wallet          Wallet   @relation(fields: [walletId], references: [id])
  cardNumber      String   @unique
  cardholderName  String
  expiryMonth     Int
  expiryYear      Int
  cvv             String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Wallet Model Update

The `Wallet` model was updated to include the relationship:

```prisma
model Wallet {
  // ... existing fields
  cards           Card[]
}
```

## API Endpoints

### Card Management

#### 1. Issue a New Card
**POST** `/wallet/:userId/cards`

Issues a new card for a user's wallet. Automatically generates card details.

**Request Body:**
```json
{
  "cardholderName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "card": {
    "id": "uuid",
    "cardNumber": "4111111111111111",
    "cardholderName": "John Doe",
    "expiryMonth": 12,
    "expiryYear": 2027,
    "cvv": "123",
    "isActive": true,
    "createdAt": "2025-10-22T01:19:30.923Z"
  }
}
```

#### 2. List All Cards
**GET** `/wallet/:userId/cards`

Returns all cards associated with a wallet.

**Response:**
```json
{
  "success": true,
  "cards": [
    {
      "id": "uuid",
      "walletId": "wallet-uuid",
      "cardNumber": "4111111111111111",
      "cardholderName": "John Doe",
      "expiryMonth": 12,
      "expiryYear": 2027,
      "cvv": "123",
      "isActive": true,
      "createdAt": "2025-10-22T01:19:30.923Z",
      "updatedAt": "2025-10-22T01:19:30.923Z"
    }
  ]
}
```

#### 3. Get Card Details
**GET** `/wallet/:userId/cards/:cardId`

Returns details of a specific card. Verifies the card belongs to the wallet.

**Response:**
```json
{
  "success": true,
  "card": {
    "id": "uuid",
    "walletId": "wallet-uuid",
    "cardNumber": "4111111111111111",
    "cardholderName": "John Doe",
    "expiryMonth": 12,
    "expiryYear": 2027,
    "cvv": "123",
    "isActive": true,
    "createdAt": "2025-10-22T01:19:30.923Z",
    "updatedAt": "2025-10-22T01:19:30.923Z"
  }
}
```

### POS Authorization (Updated)

**POST** `/pos/authorize`

The POS authorization endpoint was updated to use card information instead of userId.

**Key Changes:**
- Now requires `cardNumber` instead of `userId`
- Looks up the card and associated wallet
- Verifies the card is active
- Debits the transaction from the wallet (not the card)
- Includes card information in the response and transaction metadata

**Request Body:**
```json
{
  "cardNumber": "4111111111111111",
  "merchantId": "merchant-id",
  "amount": 50,
  "currency": "EUR"
}
```

**Response:**
```json
{
  "success": true,
  "authorization": {
    "authorizationId": "AUTH_xxx",
    "status": "AUTHORIZED"
  },
  "capture": {
    "captureId": "CAP_xxx",
    "status": "CAPTURED"
  },
  "transaction": {
    "id": "uuid",
    "userId": "user-uuid",
    "type": "PURCHASE",
    "amount": 55.08,
    "currency": "USD",
    "merchantId": "merchant-id",
    "description": "Purchase at Merchant Name",
    "status": "COMPLETED",
    "metadata": "{...cardId, cardNumber (last 4)...}",
    "createdAt": "2025-10-22T01:20:56.325Z"
  },
  "merchant": {...},
  "card": {
    "id": "card-uuid",
    "last4": "1111"
  },
  "fxConversion": {...},
  "autoUnstake": null,
  "missions": {...},
  "wallet": {
    "balance": 944.92,
    ...
  }
}
```

## Key Features

### 1. Card Issuance
- Cards are generated with random 16-digit numbers (starting with 4 for Visa)
- Automatically generates 3-digit CVV
- Default expiry is 3 years from issuance
- Cards can be issued multiple times for the same wallet

### 2. Security
- Each card is linked to exactly one wallet
- Card number is unique across the system
- Cards can be activated/deactivated via `isActive` flag
- Access control: users can only access cards belonging to their wallet

### 3. Balance Management
- Cards **do not hold any balance**
- All transactions are debited from the associated wallet
- The existing auto-unstake functionality still works
- Wallet balance checks happen before authorizing transactions

### 4. Transaction Tracking
- Card information is stored in transaction metadata
- Includes both card ID and last 4 digits for reference
- Full transaction history remains linked to the user

## Migration

A database migration was created:
- File: `prisma/migrations/20251022011750_add_card_model/migration.sql`
- Creates the `Card` table
- Adds foreign key constraint to `Wallet`
- Creates unique index on `cardNumber`

## Seed Data

The seed file was updated to create sample cards:
- Alice Traveler: 2 cards
  - Card 1: 4111111111111111 (expires 12/2027)
  - Card 2: 4222222222222222 (expires 6/2028)
- Bob Explorer: 1 card
  - Card 1: 4333333333333333 (expires 9/2026)

## Testing

The implementation was thoroughly tested:
1. ✅ List cards for a wallet
2. ✅ Issue new cards dynamically
3. ✅ Get specific card details
4. ✅ POS authorization using card number
5. ✅ Wallet balance deduction
6. ✅ Error handling (invalid card, wrong wallet)
7. ✅ Security checks (cross-wallet access prevention)

See `test-api.sh` for automated test scripts.

## Example Usage

### Issue a Card
```bash
curl -X POST http://localhost:3000/wallet/{userId}/cards \
  -H "Content-Type: application/json" \
  -d '{"cardholderName":"John Doe"}'
```

### Make a Purchase
```bash
curl -X POST http://localhost:3000/pos/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "cardNumber": "4111111111111111",
    "merchantId": "eiffel-tower-gift-shop",
    "amount": 50,
    "currency": "EUR"
  }'
```

### List Cards
```bash
curl http://localhost:3000/wallet/{userId}/cards
```

## Benefits

1. **Flexibility**: Users can have multiple cards (personal, business, etc.)
2. **Security**: Cards can be individually activated/deactivated
3. **Simplicity**: Cards are just identifiers - balance management stays at wallet level
4. **Tracking**: Full transaction history with card information
5. **Scalability**: Easy to extend with additional card features (limits, categories, etc.)

## Future Enhancements

Possible future improvements:
- Card spending limits
- Card-specific categories or restrictions
- Virtual vs physical card types
- Card freezing/unfreezing
- Card replacement
- PIN management
- Card-level transaction limits
