-- Riacquisto parziale: il backoffice puo' escludere dei dispositivi dal
-- riacquisto per un singolo cliente. Verso Grenke l'acquisto resta sempre
-- integrale, quindi pricing_grenke non viene toccato.
--
-- beni_esclusi_json: indici (in beni_json) dei beni NON riscattati; NULL o []
--   significa riacquisto totale, cioe' il comportamento di sempre.
-- pricing_riacquisto_pieno: prezzo dell'intero contratto, conservato alla
--   prima esclusione per poter tornare indietro senza ricalcoli.
ALTER TABLE "Contratto_EOL" ADD COLUMN "beni_esclusi_json" TEXT;
ALTER TABLE "Contratto_EOL" ADD COLUMN "pricing_riacquisto_pieno" DECIMAL(65,30);
