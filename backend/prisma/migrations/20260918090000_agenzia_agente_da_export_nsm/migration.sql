-- Rete commerciale dall'export NSM: colonna A (agenzia) e colonna B (agente).
-- Campi descrittivi, nullable: le pratiche gia' in archivio restano valide e
-- vengono riempite a parte da uno script di aggiornamento.
ALTER TABLE "Contratto_EOL" ADD COLUMN "agenzia" TEXT;
ALTER TABLE "Contratto_EOL" ADD COLUMN "agente" TEXT;
