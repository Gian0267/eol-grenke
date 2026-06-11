-- Ripristino corrispondenza 1:1 NSM ↔ Grenke: contratto_nsm_id torna unico
-- (l'indice semplice viene sostituito dall'indice univoco)

-- DropIndex
DROP INDEX "Contratto_EOL_contratto_nsm_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Contratto_EOL_contratto_nsm_id_key" ON "Contratto_EOL"("contratto_nsm_id");
