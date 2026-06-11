-- CreateTable
CREATE TABLE "Codice_Sconto" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "valore_eur" DECIMAL(65,30) NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "piva_cliente" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'GENERATO',
    "data_generazione" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_scadenza" TIMESTAMP(3) NOT NULL,
    "data_utilizzo" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Codice_Sconto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Codice_Sconto_codice_key" ON "Codice_Sconto"("codice");

-- CreateIndex
CREATE INDEX "Codice_Sconto_contratto_eol_id_idx" ON "Codice_Sconto"("contratto_eol_id");

-- CreateIndex
CREATE INDEX "Codice_Sconto_stato_idx" ON "Codice_Sconto"("stato");

-- CreateIndex
CREATE INDEX "Codice_Sconto_piva_cliente_idx" ON "Codice_Sconto"("piva_cliente");

-- AddForeignKey
ALTER TABLE "Codice_Sconto" ADD CONSTRAINT "Codice_Sconto_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
