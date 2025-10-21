# Quick Start Guide - GlobeTrotter+ Backend

Get up and running with the GlobeTrotter+ backend in 3 minutes!

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)

## Installation (30 seconds)

```bash
# Clone the repository
git clone <repository-url>
cd finconnect-hackathon-backend

# Install dependencies
npm install
```

## Database Setup (1 minute)

```bash
# Generate Prisma client, run migrations, and seed data
npm run setup
```

This creates:
- ✅ SQLite database with 7 tables
- ✅ 2 test users (Alice & Bob)
- ✅ 10 global merchants
- ✅ 2 active missions
- ✅ Exchange rates for 15 currencies

## Start the Server (10 seconds)

```bash
# Development mode with hot reload
npm run dev
```

Server starts at: **http://localhost:3000**

## Verify Installation (30 seconds)

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-10-21T15:00:00.000Z"}
```

### Test 2: Get Missions
```bash
curl http://localhost:3000/missions
```

Should return 2 missions.

### Test 3: Get FX Rates
```bash
curl http://localhost:3000/fx/rates
```

Should return 15 supported currencies.

## Run All Tests (1 minute)

```bash
# Make the test script executable
chmod +x test-api.sh

# Run comprehensive API tests
./test-api.sh
```

This tests all major endpoints and displays results.

## Visual Database Browser

Open Prisma Studio to view and edit data:

```bash
npm run prisma:studio
```

Then open http://localhost:5555 in your browser.

## Next Steps

1. **Read the documentation**:
   - [README.md](README.md) - Complete API reference
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System design
   - [EXAMPLES.md](EXAMPLES.md) - API usage examples

2. **Try the API**:
   - Get a user ID: `sqlite3 prisma/dev.db "SELECT id, name FROM User;"`
   - Top up wallet: See [EXAMPLES.md](EXAMPLES.md#2-top-up-wallet)
   - Make a purchase: See [EXAMPLES.md](EXAMPLES.md#1-make-a-purchase)

3. **Explore the code**:
   - Routes: `src/routes/`
   - Services: `src/services/`
   - Database models: `prisma/schema.prisma`

## Common Commands

```bash
# Development
npm run dev              # Start with hot reload
npm run build            # Build TypeScript
npm start               # Start production server

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed database
npm run prisma:studio    # Open database GUI

# Full setup
npm run setup           # Do all of the above
```

## Environment Variables

Default values are in `.env`:
```env
DATABASE_URL="file:./dev.db"
PORT=3000
NODE_ENV=development
STABLECOIN_YIELD_RATE=0.05
VISA_PROCESSING_FEE=0.029
```

## Troubleshooting

### Port already in use
```bash
# Change PORT in .env or kill existing process
PORT=3001 npm run dev
```

### Database issues
```bash
# Reset database
rm prisma/dev.db
npm run setup
```

### Build errors
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

## Support

- Check [README.md](README.md) for detailed documentation
- View [EXAMPLES.md](EXAMPLES.md) for usage examples
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design

## What's Next?

The backend is ready! You can now:
- ✅ Build a frontend application
- ✅ Test with Postman or curl
- ✅ Integrate with mobile apps
- ✅ Deploy to production

Happy coding! 🚀
