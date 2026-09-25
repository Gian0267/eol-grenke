-- Intenzione dichiarata dal cliente di attivare un nuovo noleggio (quarta opzione).
ALTER TABLE "Contratto_EOL" ADD COLUMN "nuovo_noleggio_richiesto_il" TIMESTAMP(3);
