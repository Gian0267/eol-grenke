/*
  Warnings:

  - You are about to alter the column `usato` on the `OtpCode` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - A unique constraint covering the columns `[piva]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contratto_nsm_id]` on the table `Contratto_EOL` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[session_id]` on the table `Pagamento` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN "session_id" TEXT;

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Task_Escalation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assegnato_a_id" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'DA_CHIAMARE',
    "data_creazione" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_completamento" DATETIME,
    "esito" TEXT,
    "note" TEXT,
    CONSTRAINT "Task_Escalation_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_Escalation_assegnato_a_id_fkey" FOREIGN KEY ("assegnato_a_id") REFERENCES "Utente_NSM" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinatario" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "scadenza" DATETIME NOT NULL,
    "usato" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OtpCode" ("codice", "created_at", "destinatario", "id", "metodo", "scadenza", "usato") SELECT "codice", "created_at", "destinatario", "id", "metodo", "scadenza", "usato" FROM "OtpCode";
DROP TABLE "OtpCode";
ALTER TABLE "new_OtpCode" RENAME TO "OtpCode";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Counter_year_type_key" ON "Counter"("year", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_piva_key" ON "Cliente"("piva");

-- CreateIndex
CREATE UNIQUE INDEX "Contratto_EOL_contratto_nsm_id_key" ON "Contratto_EOL"("contratto_nsm_id");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_session_id_key" ON "Pagamento"("session_id");
