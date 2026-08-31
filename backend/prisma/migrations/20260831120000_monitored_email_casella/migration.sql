-- Monitor multi-casella: traccia su quale casella la mail e' stata intercettata.
-- Nullable: le segnalazioni raccolte dal monitor a casella singola restano valide.
ALTER TABLE "MonitoredEmail" ADD COLUMN "casella" TEXT;

CREATE INDEX "MonitoredEmail_casella_idx" ON "MonitoredEmail"("casella");
