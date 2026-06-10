-- CreateTable
CREATE TABLE "Contratto_EOL" (
    "id" TEXT NOT NULL,
    "contratto_nsm_id" TEXT NOT NULL,
    "contratto_grenke_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "data_stipula" TIMESTAMP(3) NOT NULL,
    "data_scadenza" TIMESTAMP(3) NOT NULL,
    "canone_mensile" DECIMAL(65,30) NOT NULL,
    "numero_mesi" INTEGER NOT NULL,
    "monte_canoni" DECIMAL(65,30) NOT NULL,
    "valore_originario" DECIMAL(65,30),
    "beni_json" TEXT NOT NULL,
    "pricing_riacquisto" DECIMAL(65,30) NOT NULL,
    "pricing_grenke" DECIMAL(65,30) NOT NULL,
    "margine_lordo" DECIMAL(65,30) NOT NULL,
    "valore_gift_card" DECIMAL(65,30) NOT NULL,
    "stato" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "agente_originario_id" TEXT,
    "agente_assegnato_id" TEXT,
    "data_importazione" TIMESTAMP(3) NOT NULL,
    "token_accesso_cliente" TEXT,
    "stato_riconciliazione" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contratto_EOL_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "ragione_sociale" TEXT NOT NULL,
    "piva" TEXT NOT NULL,
    "codice_fiscale" TEXT,
    "email" TEXT NOT NULL,
    "pec" TEXT,
    "telefono" TEXT,
    "referente_nome" TEXT,
    "referente_email" TEXT,
    "referente_telefono" TEXT,
    "indirizzo_sede" TEXT,
    "cap" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "opt_out_comunicazioni" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decisione_Cliente" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "opzione_scelta" TEXT NOT NULL,
    "data_decisione" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "otp_verificato" BOOLEAN NOT NULL DEFAULT false,
    "otp_metodo" TEXT,
    "pdf_conferma_path" TEXT,
    "hash_pdf" TEXT,
    "note_cliente" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decisione_Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "importo_netto" DECIMAL(65,30) NOT NULL,
    "importo_iva" DECIMAL(65,30) NOT NULL,
    "importo_totale" DECIMAL(65,30) NOT NULL,
    "metodo" TEXT NOT NULL,
    "stato" TEXT NOT NULL,
    "session_id" TEXT,
    "riferimento_transazione" TEXT,
    "data_iniziato" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_completato" TIMESTAMP(3),
    "fattura_numero" TEXT,
    "fattura_path" TEXT,
    "natura_giuridica" TEXT NOT NULL,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comunicazione" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canale" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "oggetto" TEXT,
    "corpo_html" TEXT,
    "esito_chiamata" TEXT,
    "allegati_json" TEXT,
    "data_invio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_consegna" TIMESTAMP(3),
    "data_apertura" TIMESTAMP(3),
    "esito_invio" TEXT NOT NULL,
    "operatore_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comunicazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Richiesta_Contatto" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "nome_referente" TEXT,
    "telefono" TEXT,
    "giorno_preferito" TEXT,
    "fascia_oraria" TEXT,
    "modalita_preferita" TEXT,
    "note" TEXT,
    "agente_assegnato_id" TEXT,
    "stato" TEXT NOT NULL,
    "data_richiamato" TIMESTAMP(3),
    "esito" TEXT,
    "pratica_sbloccata" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Richiesta_Contatto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit_Event" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attore_tipo" TEXT NOT NULL,
    "attore_id" TEXT NOT NULL,
    "azione" TEXT NOT NULL,
    "dati_json" TEXT NOT NULL,
    "hash_precedente" TEXT NOT NULL,
    "hash_corrente" TEXT NOT NULL,

    CONSTRAINT "Audit_Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "scadenza" TIMESTAMP(3) NOT NULL,
    "usato" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utente_NSM" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "ruolo" TEXT NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superiore_id" TEXT,

    CONSTRAINT "Utente_NSM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impostazione" (
    "id" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "valore_default" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "Impostazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task_Escalation" (
    "id" TEXT NOT NULL,
    "contratto_eol_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assegnato_a_id" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'DA_CHIAMARE',
    "data_creazione" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_completamento" TIMESTAMP(3),
    "esito" TEXT,
    "note" TEXT,

    CONSTRAINT "Task_Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contratto_EOL_contratto_nsm_id_key" ON "Contratto_EOL"("contratto_nsm_id");

-- CreateIndex
CREATE INDEX "Contratto_EOL_stato_idx" ON "Contratto_EOL"("stato");

-- CreateIndex
CREATE INDEX "Contratto_EOL_data_scadenza_idx" ON "Contratto_EOL"("data_scadenza");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_piva_key" ON "Cliente"("piva");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_session_id_key" ON "Pagamento"("session_id");

-- CreateIndex
CREATE INDEX "Comunicazione_contratto_eol_id_tipo_idx" ON "Comunicazione"("contratto_eol_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_year_type_key" ON "Counter"("year", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Utente_NSM_email_key" ON "Utente_NSM"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Impostazione_chiave_key" ON "Impostazione"("chiave");

-- CreateIndex
CREATE INDEX "Impostazione_categoria_idx" ON "Impostazione"("categoria");

-- CreateIndex
CREATE INDEX "Task_Escalation_assegnato_a_id_stato_idx" ON "Task_Escalation"("assegnato_a_id", "stato");

-- AddForeignKey
ALTER TABLE "Contratto_EOL" ADD CONSTRAINT "Contratto_EOL_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contratto_EOL" ADD CONSTRAINT "Contratto_EOL_agente_originario_id_fkey" FOREIGN KEY ("agente_originario_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contratto_EOL" ADD CONSTRAINT "Contratto_EOL_agente_assegnato_id_fkey" FOREIGN KEY ("agente_assegnato_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decisione_Cliente" ADD CONSTRAINT "Decisione_Cliente_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicazione" ADD CONSTRAINT "Comunicazione_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comunicazione" ADD CONSTRAINT "Comunicazione_operatore_id_fkey" FOREIGN KEY ("operatore_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Richiesta_Contatto" ADD CONSTRAINT "Richiesta_Contatto_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Richiesta_Contatto" ADD CONSTRAINT "Richiesta_Contatto_agente_assegnato_id_fkey" FOREIGN KEY ("agente_assegnato_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit_Event" ADD CONSTRAINT "Audit_Event_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utente_NSM" ADD CONSTRAINT "Utente_NSM_superiore_id_fkey" FOREIGN KEY ("superiore_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impostazione" ADD CONSTRAINT "Impostazione_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "Utente_NSM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task_Escalation" ADD CONSTRAINT "Task_Escalation_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task_Escalation" ADD CONSTRAINT "Task_Escalation_assegnato_a_id_fkey" FOREIGN KEY ("assegnato_a_id") REFERENCES "Utente_NSM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
