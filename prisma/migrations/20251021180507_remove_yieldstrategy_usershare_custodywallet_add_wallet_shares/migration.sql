/*
  Warnings:

  - You are about to drop the `CustodyWallet` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserShare` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `YieldStrategy` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "UserShare_userId_custodyWalletId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CustodyWallet";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UserShare";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "YieldStrategy";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "stakedAmount" REAL NOT NULL DEFAULT 0,
    "yieldEarned" REAL NOT NULL DEFAULT 0,
    "shares" REAL NOT NULL DEFAULT 0,
    "autoStake" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("autoStake", "balance", "createdAt", "id", "stakedAmount", "updatedAt", "userId", "yieldEarned") SELECT "autoStake", "balance", "createdAt", "id", "stakedAmount", "updatedAt", "userId", "yieldEarned" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
