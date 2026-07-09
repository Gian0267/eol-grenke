-- CreateTable
CREATE TABLE "MonitoredEmail" (
    "id" TEXT NOT NULL,
    "imap_uid" INTEGER NOT NULL,
    "message_id" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL,
    "matched_keywords" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contratto_eol_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredEmail_message_id_key" ON "MonitoredEmail"("message_id");

-- CreateIndex
CREATE INDEX "MonitoredEmail_status_idx" ON "MonitoredEmail"("status");

-- CreateIndex
CREATE INDEX "MonitoredEmail_received_at_idx" ON "MonitoredEmail"("received_at");

-- AddForeignKey
ALTER TABLE "MonitoredEmail" ADD CONSTRAINT "MonitoredEmail_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE SET NULL ON UPDATE CASCADE;
