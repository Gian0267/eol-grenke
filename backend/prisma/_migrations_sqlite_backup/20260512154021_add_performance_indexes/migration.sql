-- CreateIndex
CREATE INDEX "Comunicazione_contratto_eol_id_tipo_idx" ON "Comunicazione"("contratto_eol_id", "tipo");

-- CreateIndex
CREATE INDEX "Contratto_EOL_stato_idx" ON "Contratto_EOL"("stato");

-- CreateIndex
CREATE INDEX "Contratto_EOL_data_scadenza_idx" ON "Contratto_EOL"("data_scadenza");

-- CreateIndex
CREATE INDEX "Task_Escalation_assegnato_a_id_stato_idx" ON "Task_Escalation"("assegnato_a_id", "stato");
