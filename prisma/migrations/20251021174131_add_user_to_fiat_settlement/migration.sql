-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FiatSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT,
    "userId" TEXT,
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
    CONSTRAINT "FiatSettlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FiatSettlement" ("createdAt", "fiatAmount", "fiatCurrency", "fxMarkup", "fxRate", "id", "merchantId", "settledAt", "settlementFee", "settlementType", "status", "tokenAmount", "updatedAt") SELECT "createdAt", "fiatAmount", "fiatCurrency", "fxMarkup", "fxRate", "id", "merchantId", "settledAt", "settlementFee", "settlementType", "status", "tokenAmount", "updatedAt" FROM "FiatSettlement";
DROP TABLE "FiatSettlement";
ALTER TABLE "new_FiatSettlement" RENAME TO "FiatSettlement";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
