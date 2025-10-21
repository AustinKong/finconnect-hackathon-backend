-- CreateTable
CREATE TABLE "CustodyWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "totalPoolBalance" REAL NOT NULL DEFAULT 0,
    "totalShares" REAL NOT NULL DEFAULT 0,
    "exchangeRate" REAL NOT NULL DEFAULT 1.0,
    "lastRebalanceAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "custodyWalletId" TEXT NOT NULL,
    "shares" REAL NOT NULL DEFAULT 0,
    "lastDepositAt" DATETIME,
    "lastWithdrawalAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserShare_custodyWalletId_fkey" FOREIGN KEY ("custodyWalletId") REFERENCES "CustodyWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LendingProtocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'AaveMock',
    "currentAPR" REAL NOT NULL DEFAULT 0.05,
    "totalDeposited" REAL NOT NULL DEFAULT 0,
    "totalInterestEarned" REAL NOT NULL DEFAULT 0,
    "exchangeRate" REAL NOT NULL DEFAULT 1.0,
    "lastAccrualAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LendingDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "shares" REAL NOT NULL,
    "depositRate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LendingDeposit_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "LendingProtocol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YieldStrategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minLiquidityBuffer" REAL NOT NULL DEFAULT 0.1,
    "maxLiquidityBuffer" REAL NOT NULL DEFAULT 0.3,
    "currentLiquidity" REAL NOT NULL DEFAULT 0,
    "totalStaked" REAL NOT NULL DEFAULT 0,
    "rebalanceThreshold" REAL NOT NULL DEFAULT 0.05,
    "autoRebalance" BOOLEAN NOT NULL DEFAULT true,
    "lastRebalanceAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FiatSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "settlementType" TEXT NOT NULL,
    "tokenAmount" REAL NOT NULL,
    "fiatAmount" REAL NOT NULL,
    "fiatCurrency" TEXT NOT NULL,
    "fxRate" REAL NOT NULL,
    "fxMarkup" REAL NOT NULL DEFAULT 0.02,
    "settlementFee" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FiatSettlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserShare_userId_custodyWalletId_key" ON "UserShare"("userId", "custodyWalletId");
