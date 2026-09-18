-- Apertura anticipata della finestra di pagamento, decisa dal backoffice.
ALTER TABLE "Contratto_EOL" ADD COLUMN "pagamento_anticipato_il" TIMESTAMP(3);
