# GlobeTrotter+ Backend

A TypeScript + Express backend for GlobeTrotter+, a travel rewards and payments platform featuring stablecoin yield, multi-currency support, and gamified travel missions.

## Features

- 💰 **Wallet Management**: Top-up, balance tracking, transaction history, and card issuance
- 🌾 **Stablecoin Yield**: Automated yield generation through lending protocols
- 💳 **POS Authorization**: Auto-unstake, FX conversion, and Visa network integration
- 🎯 **Mission System**: Gamified travel missions with rewards
- 📊 **Analytics**: User and global analytics dashboards with spending trends
- 💱 **Foreign Exchange**: Multi-currency support with live conversion rates
- 🔌 **Mock APIs**: Simulated stablecoin, lending protocol, and Visa network services

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite with Prisma ORM
- **Environment**: dotenv for configuration

## Project Structure

```
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Database migrations
│   └── seed.ts            # Seed data (users, merchants, missions)
├── src/
│   ├── routes/            # API route handlers
│   │   ├── wallet.ts      # Wallet and card management
│   │   ├── pos.ts         # POS authorization
│   │   ├── missions.ts    # Mission management
│   │   ├── analytics.ts   # Analytics endpoints
│   │   └── yield.ts       # Yield management
│   ├── services/          # Business logic
│   │   ├── YieldManager.ts
│   │   ├── WalletService.ts
│   │   └── MissionEngine.ts
│   ├── mock/              # Mock services
│   │   ├── LendingProtocolMock.ts
│   │   ├── VisaNetworkMock.ts
│   │   └── FXServiceMock.ts
│   ├── utils/
│   │   └── prisma.ts      # Prisma client instance
│   └── index.ts           # Main application entry
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/AustinKong/finconnect-hackathon-backend.git
   cd finconnect-hackathon-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   npm run setup
   ```
   This will:
   - Generate Prisma client
   - Run database migrations
   - Seed initial data (2 users, 10 merchants, 2 missions)

4. **Configure environment variables** (optional)
   
   Copy `.env.example` to `.env` and modify if needed:
   ```bash
   cp .env.example .env
   ```
   
   Default configuration:
   ```env
   DATABASE_URL="file:./dev.db"
   PORT=3000
   NODE_ENV=development
   STABLECOIN_YIELD_RATE=0.05
   VISA_PROCESSING_FEE=0.029
   ```

### Running the Application

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

### Verify Installation

Test the server is running:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-10-22T09:57:00.000Z"}
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Wallet (`/wallet`)
- `GET /wallet/:userId` - Get wallet details including yield rate
- `POST /wallet/topup` - Top up wallet balance (supports auto-staking)
- `GET /wallet/:userId/transactions` - Get transaction history with pagination
- `PUT /wallet/:userId/autostake` - Enable/disable auto-staking feature
- `POST /wallet/:userId/cards` - Issue a new virtual card
- `GET /wallet/:userId/cards` - Get all cards for a wallet
- `GET /wallet/:userId/cards/:cardId` - Get specific card details

### POS (`/pos`)
- `POST /pos/authorize` - Authorize a purchase using card number (handles auto-unstake, FX, mission evaluation)
- `POST /pos/refund` - Process a refund for a transaction

### Missions (`/missions`)
- `GET /missions` - Get all active missions
- `GET /missions/:missionId` - Get mission details with leaderboard
- `GET /missions/user/:userId` - Get user's enrolled missions
- `GET /missions/user/:userId/available` - Get available missions for enrollment
- `POST /missions/enroll` - Enroll user in a mission
- `POST /missions/claim` - Claim mission reward
- `POST /missions` - Create new mission (admin)

### Analytics (`/analytics`)
- `GET /analytics/user/:userId` - Get comprehensive user analytics
- `GET /analytics/user/:userId/spending-trends` - Get spending trends over time period
- `GET /analytics/global` - Get global platform analytics
- `GET /analytics/summary` - Get summary analytics (optionally filtered by userId)

### Yield (`/yield`)
- `POST /yield/accrue` - Manually trigger interest accrual (for testing)
- `GET /yield/rate` - Get current yield rate and exchange rate
- `GET /yield/stats` - Get yield statistics including pool data

## Example Usage

### 1. Top up wallet
```bash
curl -X POST http://localhost:3000/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id",
    "amount": 500,
    "currency": "USD"
  }'
```

### 2. Issue a virtual card
```bash
curl -X POST http://localhost:3000/wallet/user-id/cards \
  -H "Content-Type: application/json" \
  -d '{
    "cardholderName": "Alice Traveler"
  }'
```

### 3. Make a purchase with card
```bash
curl -X POST http://localhost:3000/pos/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "cardNumber": "4123456789012345",
    "merchantId": "merchant-id",
    "amount": 100,
    "currency": "USD"
  }'
```

### 4. Enroll in a mission
```bash
curl -X POST http://localhost:3000/missions/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id",
    "missionId": "mission-id"
  }'
```

### 5. Get user analytics
```bash
curl http://localhost:3000/analytics/user/user-id
```

### 6. Check yield statistics
```bash
curl http://localhost:3000/yield/stats
```

## Seeded Data

The database is seeded with test data for immediate use:

**Users** (2):
- Alice Traveler (alice@example.com) - $1000 balance, auto-stake enabled
- Bob Explorer (bob@example.com) - $500 balance

**Merchants** (10 global merchants):
- Starbucks Tokyo (JPY)
- Eiffel Tower Gift Shop (EUR)
- Singapore Airlines (SGD)
- Harrods London (GBP)
- Sydney Opera House (AUD)
- Bangkok Street Food Market (THB)
- New York Taxi (USD)
- Dubai Mall (AED)
- Rome Trevi Fountain Cafe (EUR)
- Barcelona FC Store (EUR)

**Missions** (2 active missions):
1. **Global Explorer** - Spend $500 across different countries for $50 cashback
2. **Fly High with Singapore Airlines** - Spend $300 at Singapore Airlines for $100 cashback

**Currencies Supported** (15+):
- USD, EUR, GBP, JPY, SGD, AUD, THB, AED, and more

## Key Services & Architecture

### YieldManager
Manages yield generation through lending protocols:
- Automated yield accrual via compound interest
- Share-based accounting for staked funds
- Rebalancing between liquidity buffer and lending protocol
- Default 5% APY on staked funds

### WalletService
Core wallet operations:
- Balance and share management
- Auto-staking of deposited funds (when enabled)
- Auto-unstaking for POS transactions when needed
- Card issuance and management

### MissionEngine
Gamification engine for travel missions:
- Automatic mission evaluation on transactions
- Progress tracking across multiple criteria
- Reward distribution and auto-claim
- Support for spending goals, merchant-specific, and category-based missions

### Mock Services

**LendingProtocolMock** - Simulates Aave-style lending protocol with continuous compound interest

**VisaNetworkMock** - Simulates Visa payment network with authorization and capture flow

**FXServiceMock** - Provides multi-currency conversion with real-time rates and markup

## Database Management

**Generate Prisma Client**:
```bash
npm run prisma:generate
```

**Create Migration**:
```bash
npm run prisma:migrate
```

**Seed Database**:
```bash
npm run prisma:seed
```

**Open Prisma Studio** (visual database browser):
```bash
npm run prisma:studio
```
Opens at `http://localhost:5555`

**Full Setup** (all of the above):
```bash
npm run setup
```

## Development

**Build TypeScript**:
```bash
npm run build
```

**Run in development mode** (with hot reload):
```bash
npm run dev
```

**Run tests**:
```bash
npm test
```

**Run tests with coverage**:
```bash
npm run test:coverage
```

## Key Features Explained

### Auto-Staking
When enabled on a wallet, deposited funds are automatically staked in the yield-generating lending protocol. Users earn passive income while maintaining the ability to spend.

### Auto-Unstaking for POS
When making a purchase with insufficient balance, the system automatically unstakes the required amount from the lending protocol to complete the transaction.

### FX Conversion
All transactions in foreign currencies are automatically converted to USD using live exchange rates with a small markup. The original amount and currency are preserved in transaction metadata.

### Mission System
Users can enroll in missions and earn rewards by completing spending goals. The system automatically evaluates transactions against active missions and distributes rewards upon completion.

### Card-Based Payments
Users can issue virtual cards linked to their wallet. Cards enable secure POS transactions without exposing wallet credentials.

## License

ISC