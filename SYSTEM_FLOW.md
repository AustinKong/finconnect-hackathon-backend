# GlobeTrotter+ System Flow Documentation

This document provides a comprehensive overview of how the GlobeTrotter+ system works, including the purpose of mock services, the complete user flow with actual endpoints, and how different components interact with each other.

---

## Table of Contents

1. [Mock Services Overview](#mock-services-overview)
2. [System Components Interaction](#system-components-interaction)
3. [User Flows & Stories](#user-flows--stories)
4. [Frontend Interactions](#frontend-interactions)
5. [Prototype-Only Features](#prototype-only-features)

---

## Mock Services Overview

The GlobeTrotter+ backend uses several mock services to simulate real-world financial infrastructure. These mocks represent production systems that would exist in a real implementation.

### 1. CustodyStablecoinMock

**What it represents:** A pooled stablecoin custody wallet (similar to Circle's USDC custody or a DeFi protocol's vault).

**Purpose:** Acts as a centralized vault that holds all stablecoins in the system. It manages token-level operations through a simple pooled balance system.

**Key Operations:**
- `mint(amount)` - Creates new stablecoins (called when fiat is converted to stablecoin or when lending protocol deposits)
- `burn(amount)` - Destroys stablecoins (called when stablecoin is converted to fiat or when lending protocol withdraws)
- `getBalance()` - Returns total pooled stablecoin balance
- `updateExchangeRate(rate)` - Syncs exchange rate from the lending protocol
- `getExchangeRate()` - Returns current exchange rate

**Real-world equivalent:** Circle API for USDC, or a smart contract vault on Ethereum/Polygon.

**Important:** Only `LendingProtocolMock` and `FiatSettlementBridge` should call `mint()` and `burn()`. This service has no business logic - it's purely for token accounting.

---

### 2. LendingProtocolMock

**What it represents:** An Aave-style DeFi lending protocol that generates yield through continuous compound interest.

**Purpose:** Simulates how staked funds earn yield over time. The exchange rate grows continuously based on APR (5% by default), similar to how Aave's aToken or Compound's cToken increases in value.

**Key Operations:**
- `deposit(amount)` - Deposits stablecoins and receives shares (calls `CustodyStablecoinMock.mint()`)
- `withdraw(shares)` - Burns shares and withdraws tokens (calls `CustodyStablecoinMock.burn()`)
- `accrueInterest()` - Updates exchange rate based on time elapsed (continuous compounding: `rate = rate₀ × e^(APR × time)`)
- `getExchangeRate()` - Returns current exchange rate (shares → tokens)
- `getStats()` - Returns protocol statistics (total deposited, interest earned, APR, etc.)

**Share System:** When users deposit, they receive shares calculated as `shares = amount / exchangeRate`. When withdrawing, they receive `amount = shares × exchangeRate`. As the exchange rate grows over time, the same shares are worth more tokens.

**Real-world equivalent:** Aave aTokens, Compound cTokens, or Yearn vaults.

**Formula:** Exchange rate evolves as: `exchangeRate(t) = exchangeRate(0) × e^(APR × years_elapsed)`

---

### 3. FiatSettlementBridge

**What it represents:** A fiat-to-crypto bridge service (similar to Wyre, Ramp Network, or a traditional payment processor's crypto integration).

**Purpose:** Handles conversions between fiat currencies and stablecoins, applying FX rates and settlement fees.

**Key Operations:**
- `fiatToStablecoin(userId, fiatAmount, currency)` - Converts fiat to USDC (calls `CustodyStablecoinMock.mint()`)
- `stablecoinToFiat(userId, stablecoinAmount, currency)` - Converts USDC to fiat (calls `CustodyStablecoinMock.burn()`)
- `getFiatToStablecoinQuote(amount, currency)` - Gets conversion quote without executing
- `getStablecoinToFiatQuote(amount, currency)` - Gets conversion quote without executing

**Fees Applied:**
- FX Markup: 2% (default) - Applied to exchange rate
- Settlement Fee: 0.5% (default) - Applied to final amount

**Real-world equivalent:** Wyre API, Ramp Network, MoonPay, or traditional ACH/SWIFT processors with crypto integration.

**Prototype Note:** In this prototype, we simulate bank account debits/credits by manually adjusting the user's wallet balance. In production, this would integrate with real banking APIs (Plaid, Stripe, etc.) and only mint/burn stablecoins after confirming fiat transfers.

---

### 4. VisaNetworkMock

**What it represents:** The Visa payment network infrastructure that processes card transactions.

**Purpose:** Simulates the authorization and capture flow that happens when a card is used for payment.

**Key Operations:**
- `authorize(request)` - Authorizes a transaction (reserves funds, returns authorization ID)
- `capture(authorizationId)` - Captures an authorized transaction (actually charges the funds)
- `getProcessingFee(amount)` - Calculates Visa processing fee (2.9% default)
- `getAuthorization(id)` - Retrieves authorization details
- `getCapture(id)` - Retrieves capture details

**Two-Phase Transaction:**
1. **Authorization:** When a card is swiped at a merchant, Visa checks if funds are available and creates an authorization hold
2. **Capture:** Later (often within 24-48 hours), the merchant submits for capture to actually receive the funds

**Real-world equivalent:** Visa DPS (Data Processing Services), the actual Visa network that processes billions of transactions globally.

**Prototype Note:** In production, this would be replaced by actual Visa Direct API or a payment processor like Stripe/Adyen that connects to Visa.

---

### 5. FXServiceMock

**What it represents:** A foreign exchange rate provider (similar to Bloomberg, Reuters, or OANDA).

**Purpose:** Provides real-time exchange rates for currency conversions.

**Key Operations:**
- `getRate(from, to)` - Gets exchange rate between two currencies
- `convert(amount, from, to, withMarkup)` - Converts amount with optional markup
- `getSupportedCurrencies()` - Lists all supported currencies (15 currencies)
- `getRateHistory(from, to, days)` - Gets historical rates

**Supported Currencies:** USD, EUR, GBP, JPY, SGD, AUD, CAD, CHF, CNY, HKD, THB, MYR, INR, AED, NZD

**Markup:** 2% markup is applied to commercial transactions to cover FX spread costs.

**Real-world equivalent:** FX rate APIs like XE.com, OANDA, or Bloomberg Terminal.

---

## System Components Interaction

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    THREE FRONTENDS                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Mobile App     │   POS Machine   │  Merchant Bank          │
│  (User)         │   (Merchant)    │  (Acquirer/Visa)        │
└────────┬────────┴────────┬────────┴────────┬────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│              GlobeTrotter+ Backend API                       │
│  /wallet  /pos  /missions  /analytics  /yield               │
└─────────────────────────────────────────────────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Services                          │
│  WalletService  │  MissionEngine  │  YieldManager           │
└─────────────────────────────────────────────────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Mock Services                           │
│  CustodyStablecoin  │  LendingProtocol  │  FiatBridge       │
│  VisaNetwork       │  FXService                             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database (SQLite)                          │
│  User  │  Wallet  │  Transaction  │  Mission  │  Merchant  │
└─────────────────────────────────────────────────────────────┘
```

### Component Interactions by Use Case

#### Use Case 1: User Makes a Purchase

```
Mobile App → POST /pos/authorize → POS Route
                                      ↓
                            Get Card & Wallet from DB
                                      ↓
                            FXService.convert() if needed
                                      ↓
                     Check balance + staked (WalletService)
                                      ↓
                   Auto-unstake if needed (WalletService)
                            ↓                    ↓
                   YieldManager.withdraw()  LendingProtocol.withdraw()
                            ↓                    ↓
                            └──────────→ CustodyWallet.burn()
                                      ↓
                            VisaNetwork.authorize()
                                      ↓
                            Deduct from wallet balance
                                      ↓
                            Create transaction record
                                      ↓
                            MissionEngine.evaluateTransaction()
                                      ↓
                            VisaNetwork.capture()
                                      ↓
                    Return: transaction, missions updated, wallet
```

#### Use Case 2: User Deposits Fiat and Earns Yield

```
Mobile App → POST /wallet/topup → Wallet Route
                                      ↓
                            WalletService.addFunds()
                                      ↓
                   (if autoStake enabled) YieldManager.deposit()
                                      ↓
                            FiatBridge.fiatToStablecoin()
                                      ↓
                            CustodyWallet.mint(stablecoins)
                                      ↓
                            LendingProtocol.deposit(stablecoins)
                                      ↓
                            CustodyWallet.mint(lending tokens)
                                      ↓
                            Update wallet.shares
                                      ↓
                    Return: wallet with updated shares & balance
```

#### Use Case 3: Yield Accrues Over Time

```
Cron Job / Manual Trigger → POST /yield/accrue → Yield Route
                                      ↓
                            YieldManager.syncYield()
                                      ↓
                            LendingProtocol.accrueInterest()
                                      ↓
                Calculate new exchange rate (compound interest)
                exchangeRate_new = exchangeRate_old × e^(APR × time)
                                      ↓
                            CustodyWallet.updateExchangeRate()
                                      ↓
           All users' shares are now worth more (no wallet update needed)
```

---

## User Flows & Stories

### Story 1: Alice Signs Up and Gets Started

**Assumption:** User Alice already exists in the system (created during database seeding). In production, there would be a user registration endpoint (POST /users/register).

1. **Alice checks her wallet**
   ```bash
   GET /wallet/{aliceUserId}
   ```
   Response: `{ wallet: { balance: 1000, shares: 500, ... }, yieldRate: 0.05 }`

2. **Alice requests a card to make purchases**
   ```bash
   POST /wallet/{aliceUserId}/cards
   Body: { "cardholderName": "Alice Traveler" }
   ```
   Response: `{ card: { cardNumber: "4123...", cvv: "123", ... } }`
   
   **Note:** This is NOT an assumption - we have a real endpoint to issue cards.

### Story 2: Alice Tops Up Her Wallet

3. **Alice deposits $500 via bank transfer**
   ```bash
   POST /wallet/topup
   Body: { "userId": "{aliceUserId}", "amount": 500, "currency": "USD" }
   ```
   
   Behind the scenes:
   - WalletService credits wallet balance: `balance += 500`
   - If `autoStake = true` (default), funds are automatically staked:
     - FiatBridge converts $500 USD → ~$490 USDC (after fees)
     - LendingProtocol deposits $490 USDC → receives ~490 shares (at rate 1.0)
     - Wallet.shares increases by 490
   
   **Prototype Note:** We simulate the bank transfer by manually crediting the wallet. In production, this would integrate with Plaid/Stripe to debit the real bank account.

### Story 3: Alice Travels to Tokyo and Makes a Purchase

4. **Alice visits Starbucks Tokyo and buys coffee for ¥500**
   
   POS machine sends:
   ```bash
   POST /pos/authorize
   Body: {
     "cardNumber": "4123...",
     "merchantId": "{starbucksTokyoId}",
     "amount": 500,
     "currency": "JPY"
   }
   ```
   
   Behind the scenes:
   - Get merchant: Starbucks Tokyo (currency: JPY, country: JP, category: CAFE)
   - FXService converts: ¥500 → ~$3.50 USD (at rate ~142 JPY/USD + 2% markup)
   - Check balance: Alice has $1000 balance + $490 staked (from auto-stake)
   - Balance is sufficient ($1000 > $3.50), no auto-unstake needed
   - VisaNetwork.authorize() - Creates authorization hold
   - Deduct from wallet: `balance = 1000 - 3.50 = 996.50`
   - Create transaction record
   - MissionEngine evaluates:
     - Checks if Alice enrolled in any missions
     - "Global Explorer" mission: Spend $500 across countries → Progress: $3.50 / $500
   - VisaNetwork.capture() - Actually charges the transaction
   
   Response: 
   ```json
   {
     "success": true,
     "transaction": { "amount": 3.50, "merchantId": "...", ... },
     "fxConversion": { "originalAmount": 500, "originalCurrency": "JPY", "rate": 142.8 },
     "missions": { "updated": 1, "completed": 0 },
     "wallet": { "balance": 996.50, "shares": 490, ... }
   }
   ```

### Story 4: Alice Spends More and Needs Auto-Unstake

5. **Alice books a flight with Singapore Airlines for $600 USD**
   
   POS machine sends:
   ```bash
   POST /pos/authorize
   Body: {
     "cardNumber": "4123...",
     "merchantId": "{singaporeAirlinesId}",
     "amount": 600,
     "currency": "USD"
   }
   ```
   
   Behind the scenes:
   - Merchant: Singapore Airlines (currency: USD, country: SG, category: AIRLINE)
   - No FX conversion needed (USD → USD)
   - Check balance: Alice has $996.50 balance + $490 staked
   - Balance insufficient ($996.50 < $600), trigger auto-unstake:
     - Calculate shortfall: $600 - $996.50 = $3.50
     - WalletService.autoUnstakeForPOS() triggers:
       - YieldManager.withdraw(shares needed)
       - LendingProtocol.withdraw(shares) → returns tokens (at current exchange rate)
       - CustodyWallet.burn(tokens)
       - Credits wallet balance with unstaked amount
   - After auto-unstake: balance ~$1000, shares reduced
   - VisaNetwork.authorize() and capture()
   - MissionEngine evaluates:
     - "Global Explorer": Progress updated to ~$603.50 / $500 → **COMPLETED!**
     - "Fly High with Singapore Airlines": Progress $600 / $300 → **COMPLETED!**
     - Auto-claim rewards: $50 + $100 = $150 added to balance
   
   Response:
   ```json
   {
     "success": true,
     "autoUnstake": { "unstakedAmount": 3.50, "message": "Auto-unstaked funds..." },
     "missions": { "updated": 2, "completed": 2 },
     "wallet": { "balance": ~$550, "shares": ~487, ... }
   }
   ```

### Story 5: Time Passes and Yield Accrues

**Prototype Note:** This is a PROTOTYPE-ONLY endpoint. In production, yield would accrue passively in real-time based on block timestamps or time-based smart contract calls.

6. **One week passes (simulated)**
   ```bash
   POST /yield/accrue
   Body: { "now_sec": <timestamp_one_week_later> }
   ```
   
   Behind the scenes:
   - Calculate time elapsed: 7 days = 7/365.25 years = 0.01916 years
   - Apply compound interest: `newRate = 1.0 × e^(0.05 × 0.01916) = 1.000958`
   - Update exchange rate in LendingProtocol and CustodyWallet
   - All users' shares automatically worth more (no individual wallet updates)
   - Alice's 487 shares now worth: 487 × 1.000958 = ~$487.47 (earned ~$0.47)
   
   **Remark:** The `/yield/accrue` endpoint is for testing only. In a real system, the exchange rate would continuously increase based on blockchain time or database timestamps, without needing manual triggers.

### Story 6: Alice Checks Her Earnings

7. **Alice views her analytics**
   ```bash
   GET /analytics/user/{aliceUserId}
   ```
   
   Response shows:
   - Total balance: $550
   - Staked amount: $487.47 (calculated from shares × exchange rate)
   - Yield earned: $0.47
   - Total spent: ~$603.50
   - Missions completed: 2
   - Rewards earned: $150

### Story 7: Merchant Settlement (Background Process)

**Assumption:** Merchant settlement happens automatically in the background. We don't have a specific endpoint for merchants to request payouts, but we have the infrastructure (FiatSettlementBridge) to handle it.

Behind the scenes for merchant payouts:
- System calls `FiatBridge.stablecoinToFiat(merchantId, amount, "JPY")`
- Burns stablecoins from custody wallet
- Records settlement with FX rate applied
- In production, this would trigger a SWIFT/ACH transfer to merchant's bank account

**Remark:** The actual merchant payout endpoint would be something like `POST /settlements/merchants/{merchantId}/payout` which is not implemented in this prototype, but the underlying FiatSettlementBridge service is ready to support it.

---

## Frontend Interactions

### 1. Mobile Frontend (User App)

**Purpose:** The main user interface where travelers manage their wallet, view missions, and track spending.

**Key Screens:**
- **Home/Dashboard:** Shows balance, staked amount, yield earned, active missions
- **Card Management:** Issue new cards, view card details
- **Transactions:** View purchase history
- **Missions:** Browse available missions, enroll, track progress, claim rewards
- **Analytics:** View spending trends, categories, countries visited

**Key Endpoints Used:**

```javascript
// Dashboard
GET /wallet/{userId}                    // Get wallet balance, shares, yield
GET /missions/user/{userId}             // Get user's active missions
GET /analytics/user/{userId}            // Get spending stats

// Top-up
POST /wallet/topup                      // Deposit funds
Body: { userId, amount, currency }

// Cards
POST /wallet/{userId}/cards             // Issue new card
GET /wallet/{userId}/cards              // List all cards
GET /wallet/{userId}/cards/{cardId}     // Get card details

// Transactions
GET /wallet/{userId}/transactions       // View transaction history

// Missions
GET /missions                           // Browse all missions
GET /missions/user/{userId}/available   // Get missions user can enroll in
POST /missions/enroll                   // Enroll in a mission
Body: { userId, missionId }

// Settings
PUT /wallet/{userId}/autostake          // Enable/disable auto-staking
Body: { autoStake: true/false }
```

**User Flow Example:**
1. User opens app → Dashboard loads wallet + missions
2. User taps "Top Up" → Enters amount → POST /wallet/topup
3. User taps "Missions" → Views available missions → Enrolls in one
4. User makes purchase at POS → Mission progress updates automatically
5. User sees notification "Mission completed!" → Reward auto-claimed

---

### 2. Simple POS Machine Frontend (Merchant)

**Purpose:** A simplified point-of-sale system that merchants use to accept GlobeTrotter+ card payments.

**Key Screens:**
- **Payment Entry:** Enter amount and currency
- **Card Reader:** Input card number (or simulate card swipe)
- **Transaction Status:** Show authorization success/failure
- **Receipt:** Print/display transaction receipt

**Key Endpoints Used:**

```javascript
// Process Payment
POST /pos/authorize                     // Authorize card payment
Body: {
  cardNumber: "4123...",
  merchantId: "{merchantId}",
  amount: 500,
  currency: "JPY"
}

// Refund (if needed)
POST /pos/refund                        // Refund a transaction
Body: {
  transactionId: "{transactionId}",
  amount: 500  // Optional partial refund
}
```

**Merchant Flow Example:**
1. Customer hands card to merchant
2. Merchant enters amount (e.g., ¥500) in local currency
3. Merchant inputs/swipes card number
4. POS calls POST /pos/authorize
5. Backend handles:
   - FX conversion (JPY → USD)
   - Auto-unstake if needed
   - Visa authorization + capture
   - Mission evaluation
6. POS displays "Payment Successful" + receipt
7. Customer's mobile app updates mission progress automatically

**Remark:** In this prototype, the POS machine is simulated - merchants manually input card numbers. In production, this would integrate with actual card readers (EMV chip, NFC/contactless).

---

### 3. Merchant Bank/Acquirer Frontend (Visa Simulation)

**Purpose:** Simulates the acquirer bank's role in the payment network. In the real world, this would be Visa's internal systems + the merchant's acquiring bank.

**Key Screens:**
- **Transaction Monitor:** View all authorizations and captures
- **Settlement Dashboard:** View merchant settlements and payouts
- **Authorization Details:** Inspect individual transactions

**Key Components Represented:**

```
POS Machine → POST /pos/authorize → Backend
                                      ↓
                            VisaNetwork.authorize()  ← Simulates Visa DPS
                                      ↓
                            VisaNetwork.capture()    ← Simulates settlement
                                      ↓
                      (Background) FiatBridge.stablecoinToFiat() ← Merchant payout
```

**What's Happening:**
1. **Authorization Phase:**
   - POS sends transaction to backend
   - Backend calls `VisaNetwork.authorize()` (simulates Visa network checking card validity)
   - Visa mock creates authorization ID and status

2. **Capture Phase:**
   - Backend immediately calls `VisaNetwork.capture()` (in real world, this happens 24-48h later)
   - Visa mock marks transaction as captured

3. **Settlement Phase (Background):**
   - Merchant bank requests settlement for captured transactions
   - System calls `FiatBridge.stablecoinToFiat()` to convert merchant's USDC earnings to local currency
   - Settlement record created with FX rate, fees, etc.

**Key Endpoints Used (Internal/Admin):**

```javascript
// These would be internal endpoints in production
GET /mock/visa/authorization/{authId}   // View authorization details
GET /mock/visa/capture/{captureId}      // View capture details

// Settlement (would be background job)
// Not exposed as endpoint in prototype, but logic exists in FiatSettlementBridge
stablecoinToFiat(merchantId, amount, currency)
```

**Remark:** The "Merchant Bank/Acquirer" frontend is conceptual in this prototype. In reality, Visa's systems and the acquiring bank's systems are separate entities. Here, `VisaNetworkMock` stands in for both Visa's network and the acquirer bank's authorization system. Merchant settlements would be handled by scheduled jobs calling `FiatSettlementBridge`, not a user-facing interface.

---

## Prototype-Only Features

### Features That Exist Only for Testing

#### 1. Manual Yield Accrual Endpoint

```bash
POST /yield/accrue
Body: { "now_sec": <future_timestamp> }
```

**Why it exists:** To simulate the passage of time and test yield accrual without waiting days/weeks.

**Real system behavior:** Yield would accrue automatically and continuously. Smart contracts update exchange rates based on block timestamps, or backend cron jobs run every few hours to update rates.

**Remark:** This endpoint allows us to "fast forward time" to see how yield accumulates. In production, you'd simply wait, and the exchange rate would gradually increase based on real elapsed time.

---

#### 2. Simulated Bank Account Integration

**Current prototype behavior:**
- `POST /wallet/topup` manually credits the wallet balance
- `FiatBridge.fiatToStablecoin()` assumes fiat was received off-chain

**Real system behavior:**
- User initiates bank transfer via Plaid/Stripe
- System waits for confirmation from bank API
- Only after confirming fiat receipt, mint stablecoins

**Remark:** In this prototype, we skip the actual banking integration and assume the fiat transfer succeeded. A real implementation would integrate with Plaid (bank account verification), Stripe (ACH/wire transfers), or similar services.

---

#### 3. Pre-Seeded Users and Merchants

**Current prototype behavior:**
- Database is seeded with 2 users (Alice, Bob)
- 10 merchants are pre-created
- Exchange rates are pre-populated

**Real system behavior:**
- User registration endpoint: `POST /users/register`
- Merchant onboarding: `POST /merchants/register`
- Exchange rates fetched from external API (XE.com, Bloomberg)

**Remark:** We assume users and merchants already exist to streamline testing. In production, there would be complete registration, KYC verification, and onboarding flows.

---

#### 4. Instant Card Issuance

```bash
POST /wallet/{userId}/cards
```

**Current prototype behavior:** Card is issued instantly with generated number, CVV, expiry.

**Real system behavior:** 
- Card issuance requires KYC verification
- Integration with card issuer (Marqeta, Lithic, Stripe Issuing)
- Physical card manufacturing and shipping (3-7 days)
- Virtual card available immediately, physical card follows

**Remark:** This is simplified for prototype purposes. Real card issuance involves regulatory compliance, fraud checks, and logistics.

---

#### 5. Auto-Claim Mission Rewards

**Current prototype behavior:** When a mission is completed, rewards are automatically added to the wallet.

**Real system behavior:** Depending on design, you might want users to manually claim rewards (gamification), or have a separate claim endpoint that users must call.

**Remark:** Auto-claiming simplifies the UX for this prototype. In production, you could require explicit claiming to increase engagement: `POST /missions/claim { userId, missionId }`.

---

#### 6. Immediate Visa Capture

**Current prototype behavior:** After authorization, capture happens immediately in the same request.

**Real system behavior:** 
- Authorization happens when card is swiped
- Capture happens 24-48 hours later when merchant submits batch settlement
- There's a window where authorization can be canceled or adjusted

**Remark:** We combine authorization and capture for simplicity. In production, these would be separate API calls, often hours apart.

---

## Summary

This prototype demonstrates a complete travel payments + yield system with:

✅ **Fully functional endpoints** for wallet management, POS transactions, missions, and analytics  
✅ **Realistic mock services** representing real-world infrastructure (Visa, lending protocols, FX bridges)  
✅ **Complete user flows** from signup to earning yield to completing missions  
✅ **Three frontend perspectives** (mobile app, POS machine, merchant bank)  

🔧 **Prototype shortcuts** clearly marked:
- Manual time manipulation (`/yield/accrue`)
- Simulated bank transfers (no real banking API)
- Pre-seeded data (no registration endpoints)
- Instant card issuance (no real issuer integration)
- Combined auth+capture (no settlement delay)

In a production deployment, these shortcuts would be replaced with real integrations, regulatory compliance, and background job scheduling.

---

**For developers:** Start by exploring the [QUICKSTART.md](QUICKSTART.md) to set up the system, then refer to [README.md](README.md) for complete API documentation, and [ARCHITECTURE.md](ARCHITECTURE.md) for technical architecture details.
