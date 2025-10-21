# GlobeTrotter+ Backend

A TypeScript + Express backend for GlobeTrotter+, a travel rewards and payments platform featuring stablecoin yield, multi-currency support, and gamified travel missions.

## Features

- 💰 **Wallet Management**: Top-up, balance tracking, and transaction history
- 🌾 **Stablecoin Yield**: Stake USDC for automatic yield generation
- 💳 **POS Authorization**: Auto-unstake, FX conversion, and Visa network integration
- 🎯 **Mission System**: Gamified travel missions with rewards
- 📊 **Analytics**: User and global analytics dashboards
- 💱 **Foreign Exchange**: Multi-currency support with live conversion rates
- 🔌 **Mock APIs**: Simulated stablecoin and Visa network services

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
│   └── seed.ts            # Seed data (merchants + missions)
├── src/
│   ├── routes/            # API route handlers
│   │   ├── wallet.ts      # Wallet management
│   │   ├── pos.ts         # POS authorization
│   │   ├── missions.ts    # Mission management
│   │   ├── analytics.ts   # Analytics endpoints
│   │   ├── fx.ts          # Foreign exchange
│   │   └── mock.ts        # Mock service APIs
│   ├── services/          # Business logic
│   │   ├── StablecoinYieldAdapterMock.ts
│   │   ├── VisaNetworkMock.ts
│   │   ├── MissionEngine.ts
│   │   └── FXService.ts
│   ├── utils/
│   │   └── prisma.ts      # Prisma client instance
│   └── index.ts           # Main application entry
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
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

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Wallet (`/wallet`)
- `GET /wallet/:userId` - Get wallet details
- `POST /wallet/topup` - Top up wallet balance
- `POST /wallet/stake` - Stake funds for yield
- `POST /wallet/unstake` - Unstake funds
- `GET /wallet/:userId/transactions` - Get transaction history

### POS (`/pos`)
- `POST /pos/authorize` - Authorize a purchase (handles auto-unstake, FX, mission evaluation)
- `POST /pos/refund` - Process a refund

### Missions (`/missions`)
- `GET /missions` - Get all active missions
- `GET /missions/:missionId` - Get mission details
- `GET /missions/user/:userId` - Get user's missions
- `GET /missions/user/:userId/available` - Get available missions
- `POST /missions/enroll` - Enroll in a mission
- `POST /missions/claim` - Claim mission reward
- `POST /missions` - Create new mission (admin)

### Analytics (`/analytics`)
- `GET /analytics/user/:userId` - Get user analytics
- `GET /analytics/user/:userId/spending-trends` - Get spending trends
- `GET /analytics/global` - Get global platform analytics

### Foreign Exchange (`/fx`)
- `GET /fx/rates` - Get all supported currencies
- `GET /fx/rate/:from/:to` - Get specific exchange rate
- `POST /fx/convert` - Convert currency
- `GET /fx/history/:from/:to` - Get rate history
- `POST /fx/rate` - Update exchange rate (admin)

### Mock APIs (`/mock`)

**Stablecoin Yield**
- `POST /mock/stablecoin/stake` - Mock stake operation
- `POST /mock/stablecoin/unstake` - Mock unstake operation
- `POST /mock/stablecoin/yield` - Calculate yield
- `GET /mock/stablecoin/rate` - Get current yield rate

**Visa Network**
- `POST /mock/visa/authorize` - Mock Visa authorization
- `POST /mock/visa/capture` - Mock Visa capture
- `GET /mock/visa/authorization/:authorizationId` - Get authorization details
- `GET /mock/visa/capture/:captureId` - Get capture details
- `GET /mock/visa/fee/:amount` - Calculate processing fee

## Example Usage

### Top up wallet
```bash
curl -X POST http://localhost:3000/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{"userId":"<user-id>","amount":500,"currency":"USD"}'
```

### Make a purchase
```bash
curl -X POST http://localhost:3000/pos/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"<user-id>",
    "merchantId":"<merchant-id>",
    "amount":100,
    "currency":"USD"
  }'
```

### Get analytics
```bash
curl http://localhost:3000/analytics/user/<user-id>
```

## Seeded Data

The seed script creates:

**Users**:
- Alice Traveler (alice@example.com) - $1000 balance, $500 staked
- Bob Explorer (bob@example.com) - $500 balance

**Merchants** (10 total):
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

**Missions** (2):
1. **Global Explorer** - Spend $500 across different countries for $50 cashback
2. **Fly High with Singapore Airlines** - Spend $300 at Singapore Airlines for $100 cashback

## Environment Variables

Configure in `.env` file:

```env
DATABASE_URL="file:./dev.db"
PORT=3000
NODE_ENV=development
STABLECOIN_YIELD_RATE=0.05
VISA_PROCESSING_FEE=0.029
```

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

**Open Prisma Studio** (Database GUI):
```bash
npm run prisma:studio
```

## Key Services

### StablecoinYieldAdapterMock
Manages stablecoin staking and yield generation:
- Stake/unstake USDC
- Auto-unstake for insufficient balance
- Daily yield calculation (5% APY default)

### VisaNetworkMock
Simulates Visa payment network:
- Authorization (hold funds)
- Capture (charge funds)
- Processing fee calculation (2.9% default)

### MissionEngine
Gamification engine for travel missions:
- Mission evaluation on transactions
- Progress tracking
- Reward distribution
- Auto-claim on completion

### FXService
Foreign exchange management:
- 15+ currency support
- Real-time conversion with markup
- Rate history tracking

## Development

**Build TypeScript**:
```bash
npm run build
```

**Run in development**:
```bash
npm run dev
```

## License

ISC