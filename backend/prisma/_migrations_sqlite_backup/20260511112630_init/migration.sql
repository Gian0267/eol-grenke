-- CreateTable
CREATE TABLE "Contratto_EOL" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_nsm_id" TEXT NOT NULL,
    "contratto_grenke_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "data_stipula" DATETIME NOT NULL,
    "data_scadenza" DATETIME NOT NULL,
    "canone_mensile" DECIMAL NOT NULL,
    "numero_mesi" INTEGER NOT NULL,
    "monte_canoni" DECIMAL NOT NULL,
    "valore_originario" DECIMAL,
    "beni_json" TEXT NOT NULL,
    "pricing_riacquisto" DECIMAL NOT NULL,
    "pricing_grenke" DECIMAL NOT NULL,
    "margine_lordo" DECIMAL NOT NULL,
    "valore_gift_card" DECIMAL NOT NULL,
    "stato" TEXT NOT NULL,
    "origine" TEXT NOT NULL,
    "agente_originario_id" TEXT,
    "agente_assegnato_id" TEXT,
    "data_importazione" DATETIME NOT NULL,
    "token_accesso_cliente" TEXT,
    "stato_riconciliazione" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Contratto_EOL_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contratto_EOL_agente_originario_id_fkey" FOREIGN KEY ("agente_originario_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contratto_EOL_agente_assegnato_id_fkey" FOREIGN KEY ("agente_assegnato_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Decisione_Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT NOT NULL,
    "opzione_scelta" TEXT NOT NULL,
    "data_decisione" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "otp_verificato" BOOLEAN NOT NULL DEFAULT false,
    "otp_metodo" TEXT,
    "pdf_conferma_path" TEXT,
    "hash_pdf" TEXT,
    "note_cliente" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decisione_Cliente_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT NOT NULL,
    "importo_netto" DECIMAL NOT NULL,
    "importo_iva" DECIMAL NOT NULL,
    "importo_totale" DECIMAL NOT NULL,
    "metodo" TEXT NOT NULL,
    "stato" TEXT NOT NULL,
    "riferimento_transazione" TEXT,
    "data_iniziato" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_completato" DATETIME,
    "fattura_numero" TEXT,
    "fattura_path" TEXT,
    "natura_giuridica" TEXT NOT NULL,
    CONSTRAINT "Pagamento_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comunicazione" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canale" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "oggetto" TEXT,
    "corpo_html" TEXT,
    "esito_chiamata" TEXT,
    "allegati_json" TEXT,
    "data_invio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_consegna" DATETIME,
    "data_apertura" DATETIME,
    "esito_invio" TEXT NOT NULL,
    "operatore_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comunicazione_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comunicazione_operatore_id_fkey" FOREIGN KEY ("operatore_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Richiesta_Contatto" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "data_richiamato" DATETIME,
    "esito" TEXT,
    "pratica_sbloccata" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Richiesta_Contatto_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Richiesta_Contatto_agente_assegnato_id_fkey" FOREIGN KEY ("agente_assegnato_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Audit_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attore_tipo" TEXT NOT NULL,
    "attore_id" TEXT NOT NULL,
    "azione" TEXT NOT NULL,
    "dati_json" TEXT NOT NULL,
    "hash_precedente" TEXT NOT NULL,
    "hash_corrente" TEXT NOT NULL,
    CONSTRAINT "Audit_Event_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Utente_NSM" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "ruolo" TEXT NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Utente_NSM_email_key" ON "Utente_NSM"("email");
