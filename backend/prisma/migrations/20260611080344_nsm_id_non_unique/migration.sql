-- DropIndex
DROP INDEX "Contratto_EOL_contratto_nsm_id_key";

-- CreateIndex
CREATE INDEX "Contratto_EOL_contratto_nsm_id_idx" ON "Contratto_EOL"("contratto_nsm_id");

-- CreateIndex
CREATE INDEX "Contratto_EOL_contratto_grenke_id_idx" ON "Contratto_EOL"("contratto_grenke_id");
