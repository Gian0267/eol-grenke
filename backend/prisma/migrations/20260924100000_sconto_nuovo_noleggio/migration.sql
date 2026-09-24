-- Sconto sul riscatto per chi attiva un nuovo noleggio entro la data limite.
ALTER TABLE "Contratto_EOL" ADD COLUMN "nuovo_noleggio_spedito_il" TIMESTAMP(3);
ALTER TABLE "Contratto_EOL" ADD COLUMN "sconto_riscatto_percentuale" DECIMAL(65,30);
