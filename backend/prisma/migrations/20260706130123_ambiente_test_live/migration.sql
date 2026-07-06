-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "ambiente" TEXT NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "Contratto_EOL" ADD COLUMN     "ambiente" TEXT NOT NULL DEFAULT 'LIVE';

-- CreateIndex
CREATE INDEX "Contratto_EOL_ambiente_idx" ON "Contratto_EOL"("ambiente");

-- Backfill: tutto ciò che esiste prima di questa migrazione è dato di prova
UPDATE "Contratto_EOL" SET "ambiente" = 'TEST';
UPDATE "Cliente" SET "ambiente" = 'TEST';
