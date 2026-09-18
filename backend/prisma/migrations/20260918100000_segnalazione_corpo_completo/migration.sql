-- Corpo completo della mail segnalata. Nullable: le segnalazioni gia' raccolte
-- hanno solo lo snippet e il corpo viene ripescato dalla casella alla prima
-- apertura.
ALTER TABLE "MonitoredEmail" ADD COLUMN "corpo_testo" TEXT;
