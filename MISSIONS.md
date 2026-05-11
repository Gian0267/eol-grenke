# NSM EOL Grenke — Missioni di sviluppo per Antigravity

**Versione:** 1.0
**Data:** 11 maggio 2026
**Riferimento:** SPECS.md v1.1
**Destinatario:** Sviluppatore in Antigravity IDE

---

## Come usare questo documento

Questo documento contiene **10 missioni** progressive per la costruzione del template "NSM EOL Grenke", ciascuna pensata per essere eseguita da un agent Antigravity in modo autonomo.

### Modalità di esecuzione consigliata

1. **Apri Antigravity** e carica la cartella del progetto
2. **Pin nel Workspace Context** i file `SPECS.md` e `MISSIONS.md` (Manager View → Workspace Context → Add files)
3. Per ogni missione:
   - Apri un nuovo agent (Manager View → New Agent)
   - Scegli il modello AI suggerito (vedi colonna "Modello consigliato" in ciascuna missione)
   - Copia il **prompt iniziale** della missione nel chat dell'agent
   - Lascia che l'agent lavori in autonomia, intervenendo solo quando ti chiede chiarimenti o conferme
4. **Verifica i criteri di accettazione** prima di passare alla missione successiva
5. **Commit Git** dopo ogni missione completata (l'agent stesso può farlo se glielo chiedi)

### Strategia di scelta del modello AI

Antigravity supporta più modelli. Per questo progetto consigliamo:

| Modello | Quando usarlo |
|---|---|
| **Claude Sonnet 4.6** | Default per la maggior parte delle missioni: bilanciamento ottimo tra velocità, qualità del codice e capacità di seguire specifiche dettagliate. Usalo quando la missione è ben definita e richiede esecuzione precisa. |
| **Claude Opus 4.6** | Per missioni complesse con ragionamento architetturale o gestione di edge case sottili (es. audit chain, flusso pagamenti, sicurezza). Più lento e costoso, da preservare per i punti critici. |
| **Gemini 3 Pro** | Per missioni con forte componente di generazione UI/UX (componenti React complessi con Tailwind, layout responsive). Tende a produrre frontend più curato esteticamente. |

In caso di dubbio, **inizia sempre con Claude Sonnet 4.6**. Se il risultato non ti convince, rilancia la missione con Opus o Gemini.

### Convenzioni nei prompt

I prompt suggeriti usano questa struttura:

```
@SPECS.md [riferimenti a sezioni specifiche]
@MISSIONS.md [riferimento alla missione corrente]

[Contesto sintetico]

OBIETTIVO: [cosa deve fare l'agent]

VINCOLI: [cosa NON deve fare]

OUTPUT ATTESO: [criteri di accettazione]

NOTE OPERATIVE: [istruzioni pratiche]
```

Puoi copiare e incollare i prompt così come sono, oppure adattarli al tuo stile.

---

## Indice missioni

| # | Titolo | Modello consigliato | Durata stimata |
|---|---|---|---|
| 1 | Setup progetto + schema database | Sonnet 4.6 | 30-45 min |
| 2 | Importazione Excel + riconciliazione automatica | Sonnet 4.6 | 60-90 min |
| 3 | Sistema email mock + invio comunicazione iniziale | Sonnet 4.6 | 45-60 min |
| 4 | Area cliente — schermata principale + widget Chiamami | Gemini 3 Pro | 90-120 min |
| 5 | Flusso restituzione completo | Sonnet 4.6 | 45-60 min |
| 6 | Flusso riacquisto completo (con step "Hai dubbi?" e mock pagamenti) | Opus 4.6 | 120-180 min |
| 7 | Flusso rinnovo + contatto personalizzato | Sonnet 4.6 | 60-90 min |
| 8 | Solleciti automatici + escalation telefonica | Sonnet 4.6 | 90-120 min |
| 9 | Backoffice NSM (dashboard + gestione pratiche + outlier) | Gemini 3 Pro | 120-180 min |
| 10 | Audit log + export lista Grenke + refinement finale | Opus 4.6 | 90-120 min |

**Totale stimato:** ~13-18 ore di lavoro agent, distribuibili su più sessioni.

---

# MISSIONE 1 — Setup progetto + schema database

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** nessuna (prima missione)
**Output:** progetto inizializzato, database SQLite creato con tutte le entità, seed di test funzionante

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 4 (schema dati) e 8 (architettura tecnica)
@MISSIONS.md missione 1

CONTESTO:
Sto costruendo un template applicativo per gestire il workflow di fine
noleggio dei contratti FLEX di Grenke per Smartcom Solutions / Noleggio
Su Misura. Questo è il primo passo: setup del progetto e creazione dello
schema database.

OBIETTIVO:
1. Inizializza un monorepo con due workspace: backend (Node.js + Express
   + Prisma + TypeScript) e frontend (React + Vite + TypeScript +
   Tailwind + shadcn/ui).
2. Configura il package.json principale con script "dev" che lancia
   simultaneamente backend e frontend (usa concurrently).
3. Nel backend, crea lo schema Prisma con TUTTE le entità descritte in
   SPECS.md sezione 4.1: Contratto_EOL, Cliente, Decisione_Cliente,
   Pagamento, Comunicazione, Richiesta_Contatto, Audit_Event, Utente_NSM.
   Rispetta nomi campi, tipi, enum e relazioni esattamente come da SPECS.
4. Configura SQLite come database in `backend/prisma/dev.db`.
5. Crea il file `backend/prisma/seed.ts` che popola il database con:
   - 5 utenti NSM (1 ADMIN, 1 BACKOFFICE_INTERNO, 2 AGENTE, 1 CAPO_AREA)
   - 5 clienti di esempio
   - 5 contratti EOL di esempio (3 RICONCILIATI_AUTO con contratto_nsm_id
     coerente, 2 OUTLIER_DA_GESTIRE senza match)
6. Imposta uno scaffolding minimo del backend Express con almeno:
   - Entry point `backend/src/index.ts` con health check `/api/health`
   - Middleware CORS configurato per accettare richieste dal frontend
   - Connessione a Prisma client
7. Imposta uno scaffolding minimo del frontend React+Vite con:
   - shadcn/ui installato e configurato
   - Tailwind configurato con tema neutro
   - Una home page placeholder che fa fetch al backend `/api/health`
8. Crea un README.md con istruzioni per: installazione, avvio dev,
   reset database, esecuzione seed.

VINCOLI:
- NON installare librerie non strettamente necessarie a questa missione
  (es. NON installare ancora SheetJS, Mailpit, ecc — saranno aggiunte
  nelle missioni successive)
- NON implementare ancora rotte di business: solo health check
- Usa TypeScript ovunque, niente JavaScript puro
- Tutti i campi data devono essere DateTime in Prisma, non String

OUTPUT ATTESO:
- Eseguendo `npm install && npm run dev:setup && npm run dev` parte tutto
  senza errori
- Visitando http://localhost:5173 vedo la home page con il messaggio
  "Backend OK" recuperato dall'API
- Eseguendo `npx prisma studio` dal backend vedo tutte le tabelle popolate
  con i dati seed
- Il file README.md spiega chiaramente come avviare e resettare l'ambiente

NOTE OPERATIVE:
- Se durante l'installazione delle dipendenze incontri conflitti di
  versione, scegli sempre le versioni più recenti stabili
- Per shadcn/ui usa `npx shadcn@latest init` con tema "neutral" e color
  base "slate"
- Committa con git alla fine: "feat: setup iniziale progetto e schema DB"
```

## Criteri di accettazione

- [ ] Esecuzione di `npm install` nella root + nei due workspace senza errori
- [ ] `npm run dev` avvia backend (porta 3001) e frontend (porta 5173)
- [ ] `npm run db:seed` popola correttamente le 8 tabelle
- [ ] `npx prisma studio` mostra: 5 utenti, 5 clienti, 5 contratti EOL (3 + 2)
- [ ] La home page del frontend mostra il messaggio recuperato dal backend
- [ ] Il README.md è scritto in italiano e spiega chiaramente i passi

## Cose da verificare manualmente dopo il completamento

- Apri `backend/prisma/schema.prisma` e verifica che ci siano tutte le entità con i campi corretti (sezione 4.1 del SPECS)
- Controlla che il calcolo automatico di `monte_canoni`, `pricing_grenke`, `pricing_riacquisto` e `margine_lordo` sia gestito (può essere nel seed o in un service helper)
- Verifica che il file `.env.example` contenga le variabili necessarie (DATABASE_URL, JWT_SECRET, PORT)

---

# MISSIONE 2 — Importazione Excel + riconciliazione automatica

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** Missione 1
**Output:** caricamento file Excel Grenke con riconciliazione automatica e gestione outlier

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 5.1 (pricing), 5.2 (gift card), 6.1 (flusso importazione),
6.6.5 (gestione outlier), 9.5 (excel_mapping.json)
@MISSIONS.md missione 2

CONTESTO:
Il database e lo scaffolding sono pronti (missione 1 completata). Ora
serve implementare il modulo di importazione del file Excel ricevuto da
Grenke con la lista contratti in scadenza.

OBIETTIVO:
1. Installa SheetJS (xlsx) nel backend.
2. Crea il file `config/excel_mapping.json` esattamente come da SPECS
   sezione 9.5.
3. Crea i seguenti file di configurazione mancanti (vedi sezione 9):
   - config/pricing_rules.json
   - config/loyalty_program.json
4. Implementa il service `backend/src/services/reconciliation.service.ts`
   che:
   - Riceve un file Excel come Buffer
   - Lo parsa secondo il mapping di config/excel_mapping.json
   - Per ogni riga, cerca un Contratto_EOL esistente con stesso
     contratto_grenke_id O cerca nei "contratti NSM in piattaforma" (per
     ora usa una mock list nel seed: vedi sezione 10 SPECS, 28 contratti
     che hanno match + 2 che non ce l'hanno)
   - Marca ogni riga come RICONCILIATO_AUTO o OUTLIER_DA_GESTIRE
   - Restituisce un oggetto di anteprima senza ancora persistere nulla
5. Implementa il service `backend/src/services/pricing.service.ts` con
   le funzioni calcolaPricing() e calcolaValoreGiftCard() esattamente
   come da SPECS sezioni 5.1 e 5.2.
6. Implementa la route POST `/api/backoffice/import/preview` che riceve
   il file Excel (multipart/form-data), chiama il reconciliation.service
   e restituisce l'anteprima.
7. Implementa la route POST `/api/backoffice/import/confirm` che riceve
   l'anteprima validata + le scelte dell'operatore sugli outlier
   (cerca/crea/scarta) e persiste i record Contratto_EOL nel DB,
   calcolando pricing e gift card.
8. Crea nel frontend la pagina `src/pages/backoffice/ImportLista.tsx` con:
   - Componente upload file Excel (drag-and-drop)
   - Tabella di anteprima con righe colorate (verde = RICONCILIATO_AUTO,
     giallo = OUTLIER, rosso = errore)
   - Per gli outlier, dropdown con suggerimenti di matching basati su
     ragione sociale/P.IVA
   - Tre azioni per outlier: "Associa esistente", "Crea nuovo", "Scarta"
     (con campo motivazione obbligatorio)
   - Bottone finale "Conferma importazione" che chiama l'endpoint confirm
9. Aggiungi al seed (`backend/prisma/seed.ts`) la lista di 28 contratti
   "preesistenti in piattaforma" che servono per testare la riconciliazione
   automatica (creali con uno stato speciale tipo PRE_EXISTING_NSM o
   semplicemente come contratti FLEX attivi non in fase EOL).
10. Crea un file Excel di esempio `data-samples/grenke-lista-esempio.xlsx`
    con 30 righe (28 che matchano, 2 outlier) usando SheetJS per generarlo
    via script in `data-samples/generate-sample.ts`.

VINCOLI:
- NON inviare ancora email (sarà la missione 3)
- NON generare ancora token JWT cliente (sarà la missione 4)
- NON registrare ancora Audit_Event in modo strutturato (sarà la
  missione 10): per ora va bene un console.log
- La route di confirm DEVE essere transazionale (Prisma $transaction):
  se fallisce a metà, rollback completo

OUTPUT ATTESO:
- Backoffice carica il file Excel di esempio
- Vede l'anteprima con 28 righe verdi e 2 gialle
- Risolve le 2 outlier (es. "Scarta" entrambe)
- Conferma importazione
- Verifica in Prisma Studio: 28 nuovi Contratto_EOL con stato
  LISTA_RICEVUTA, pricing e gift card calcolati correttamente

NOTE OPERATIVE:
- Per la validazione del file Excel, usa zod o joi per validare lo
  schema delle righe parsate
- Le date in Excel sono spesso numeri seriali: SheetJS le convertirà
  con l'opzione { cellDates: true }
- Per il calcolo della gift card, usa la funzione esatta da SPECS 5.2
  con i tagli [25, 50, 75, 100, 125, 150, 200, 250, 300]
- Committa con: "feat(import): importazione Excel Grenke con riconciliazione"
```

## Criteri di accettazione

- [ ] Carico `data-samples/grenke-lista-esempio.xlsx` e vedo l'anteprima
- [ ] L'anteprima distingue chiaramente 28 RICONCILIATO_AUTO e 2 OUTLIER
- [ ] Posso gestire gli outlier con tre azioni e una motivazione obbligatoria
- [ ] Conferma importazione crea i record nel DB (verifica in Prisma Studio)
- [ ] I pricing sono corretti: es. contratto con canone 70€ × 36 mesi → monte 2520€, pricing_grenke 126€, pricing_riacquisto 201,60€, margine 75,60€, gift_card 75€
- [ ] Se cancello dal DB i contratti EOL e ricarico lo stesso file, ottengo lo stesso risultato (idempotenza)

---

# MISSIONE 3 — Sistema email mock + invio comunicazione iniziale

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** Missioni 1, 2
**Output:** invio email comunicazione iniziale con link area cliente, visibili in Mailpit

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 5.5 (token JWT), 6.2 (invio comunicazione), 7.1
(template email), 11 (privacy)
@MISSIONS.md missione 3

CONTESTO:
Le pratiche EOL vengono importate correttamente dal file Excel. Ora serve
inviare la comunicazione iniziale al cliente con il link univoco per
accedere all'area self-service.

OBIETTIVO:
1. Setup Mailpit come server SMTP locale:
   - Aggiungi al docker-compose.yml (se non esiste, crealo) il servizio
     Mailpit con porte 1025 (SMTP) e 8025 (UI web)
   - Documenta in README come avviarlo
2. Installa nel backend nodemailer e jsonwebtoken.
3. Crea il provider email `backend/src/providers/notification/email.provider.ts`
   con interfaccia tipata e implementazione SMTP che punta a Mailpit
   (configurabile via env var SMTP_HOST, SMTP_PORT).
4. Crea il service `backend/src/services/email.service.ts` con:
   - Funzione `inviaComunicazioneIniziale(contratto_eol_id)` che:
     a) Carica il Contratto_EOL e il Cliente associato
     b) Genera un token JWT firmato (vedi SPECS 5.5)
     c) Renderizza il template HTML
     d) Invia email a Cliente.email E a Cliente.pec (se diverse)
     e) Crea record Comunicazione con tipo COMUNICAZIONE_INIZIALE
     f) Aggiorna stato pratica da LISTA_RICEVUTA a COMUNICAZIONE_INVIATA
5. Crea il template `templates/email/comunicazione_iniziale.html` con
   contenuto esattamente come SPECS sezione 7.1, usando handlebars come
   template engine (installalo). Variabili: ragione_sociale,
   numero_contratto_grenke, numero_contratto_nsm, data_scadenza, beni,
   monte_canoni, pricing_riacquisto, valore_gift_card, link_area_cliente,
   deadline_decisione.
6. Stile email professionale ma minimale: HTML inline CSS (compatibile
   con tutti i client email), brand colors NSM (blu scuro #1a3a52,
   accent verde per opzione rinnovo), font sans-serif standard.
7. Implementa route POST `/api/backoffice/pratiche/:id/invia-comunicazione`
   per invio singolo, e POST `/api/backoffice/pratiche/invia-comunicazione-batch`
   per invio multiplo a tutte le pratiche in stato LISTA_RICEVUTA.
8. Aggiungi al backoffice (ImportLista.tsx o nuova pagina ListaPratiche.tsx)
   un bottone "Invia comunicazione iniziale" che chiama l'endpoint batch.
9. Verifica conformità privacy: l'oggetto email deve essere chiaramente
   contrattuale ("Comunicazione relativa al Suo contratto di locazione
   operativa n. [N] in scadenza"), e in fondo deve esserci un link
   minuscolo "Non desidero più ricevere comunicazioni" che imposta il
   flag opt_out_comunicazioni del Cliente (route: GET
   /api/clienti/opt-out?token=...).

VINCOLI:
- NON implementare ancora i solleciti automatici (missione 8)
- NON implementare ancora l'area cliente (missione 4); per ora il link
  punta a una pagina placeholder che mostra l'ID del contratto
- Il token JWT deve avere scadenza configurabile e default = data_scadenza
  meno 30 giorni
- Devi GESTIRE il caso in cui Cliente.pec == Cliente.email: in tal caso
  invia una sola email
- Devi gestire l'errore SMTP gracefully (Mailpit giù): scrivi nel log
  e marca la Comunicazione come ERRORE, non bloccare l'intero batch

OUTPUT ATTESO:
- Apro http://localhost:8025 (Mailpit UI)
- Lancio "Invia comunicazione iniziale batch"
- Vedo arrivare in Mailpit N email (una per ogni pratica COMUNICAZIONE_INVIATA)
- Ogni email ha: oggetto contrattuale, contenuto formattato, link cliente
- Cliccando il link vado alla pagina placeholder
- Cliccando il link "opt-out" il flag nel DB si aggiorna
- In Prisma Studio le pratiche sono passate a COMUNICAZIONE_INVIATA e
  ci sono record Comunicazione con stato INVIATO

NOTE OPERATIVE:
- Mailpit è preferibile a MailHog (più moderno, UI migliore, supporta
  più protocolli SMTP)
- Per il rendering HTML email usa handlebars: lascia che l'agent lo
  installi
- Gli stili inline sono essenziali per la compatibilità con i client email
- Committa con: "feat(email): invio comunicazione iniziale ai clienti"
```

## Criteri di accettazione

- [ ] Mailpit è raggiungibile su http://localhost:8025
- [ ] Lanciando il batch invio, arrivano in Mailpit le email previste
- [ ] L'HTML dell'email si vede correttamente in Mailpit
- [ ] Il link nell'email contiene un token JWT valido e porta a una pagina placeholder
- [ ] Il link opt-out funziona e aggiorna il DB
- [ ] Lo stato delle pratiche è correttamente aggiornato a COMUNICAZIONE_INVIATA
- [ ] Esistono record Comunicazione con tipo COMUNICAZIONE_INIZIALE e canale EMAIL/PEC

---

# MISSIONE 4 — Area cliente: schermata principale + widget Chiamami

**Modello consigliato:** Gemini 3 Pro (per la qualità UI)
**Dipendenze:** Missioni 1, 2, 3
**Output:** area cliente accessibile via token JWT con 4 opzioni visibili e widget Chiamami funzionante

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 5.5 (token), 6.3 (area cliente), 7.2 (mockup
schermata principale), 5.3 (regole assegnazione)
@MISSIONS.md missione 4

CONTESTO:
Le email arrivano ai clienti con il link contenente un token JWT. Ora
serve costruire la pagina che il cliente vede quando clicca quel link.

OBIETTIVO:
1. Configura React Router nel frontend con almeno tre route:
   - `/` (placeholder home)
   - `/pratica/:token` (area cliente)
   - `/backoffice/*` (backoffice esistente da missioni precedenti)
2. Implementa nel backend il middleware `verifyClienteToken` che valida
   il JWT e attacca req.contratto_eol al request.
3. Crea route GET `/api/cliente/pratica` che restituisce i dati della
   pratica del cliente (autenticato via token).
4. Crea la pagina `frontend/src/pages/cliente/AreaPratica.tsx` che
   implementa esattamente il mockup di SPECS 7.2:
   - Header con logo NSM placeholder e titolo "Area Cliente — Fine Contratto"
   - Card con dati pratica (numero NSM + Grenke, scadenza, beni, monte canoni)
   - Quattro card opzioni nell'ordine: rinnovo (verde), riacquisto
     (blu), contatto (giallo), restituzione (rosso)
   - Ogni card mostra il valore specifico (gift_card € per rinnovo,
     pricing_riacquisto € per riacquisto)
   - Bottone "Scegli →" su ogni card
   - Conto alla rovescia per la deadline ("Mancano X giorni")
   - Stile professionale, responsive (mobile-first)
5. Implementa il componente `frontend/src/components/WidgetChiamami.tsx`
   come componente globale, posizionato in basso a destra con position:
   fixed:
   - Stato collapsed: bolla rotonda con icona telefono
   - Stato expanded: form con campi nome, telefono, giorno preferito,
     fascia oraria (radio: mattina/pomeriggio/indifferente)
   - Submit chiama POST /api/cliente/richiesta-contatto
   - Mostra conferma "Ti richiameremo entro 24 ore lavorative"
6. Implementa endpoint POST `/api/cliente/richiesta-contatto` che:
   - Valida il token JWT del cliente
   - Crea Richiesta_Contatto con origine = WIDGET_CHIAMAMI
   - Applica le regole di assegnazione da SPECS 5.3 (priorità agente
     originario, fallback Capo Area se monte_canoni >= 5000€, fallback
     BACKOFFICE_INTERNO)
   - Invia notifica email all'agente assegnato (template
     `templates/email/notifica_agente_richiesta_contatto.html`)
7. Crea pagina di stato per quando il token è scaduto: messaggio
   "Termine decisione superato" + CTA "Contatta NSM al 011 4557949".
8. Gestione errori 404 / 401 in modo user-friendly.

VINCOLI:
- NON implementare ancora i flussi di scelta delle 4 opzioni (saranno
  missioni 5, 6, 7); i bottoni "Scegli" portano a pagine placeholder
  per ora
- Stile: usa Tailwind + shadcn/ui (Card, Button, Badge), niente CSS
  custom se evitabile
- Il widget Chiamami DEVE essere visibile su qualsiasi pagina del
  flusso cliente (usa un layout component)
- I colori del brand sono: primary #1a3a52 (blu scuro), accent #16a34a
  (verde rinnovo), warning #ca8a04 (giallo contatto), info #2563eb
  (blu riacquisto), neutral #6b7280 (grigio restituzione)
- Tutti i testi DEVONO essere in italiano

OUTPUT ATTESO:
- Apro Mailpit, copio il link dall'email arrivata, lo incollo nel browser
- Vedo l'area cliente con i dati corretti
- Le 4 opzioni sono visualizzate nell'ordine corretto con i giusti valori
- Il widget Chiamami è visibile in basso a destra, posso aprirlo,
  compilarlo, inviare
- Verifico in Prisma Studio che si è creato un record Richiesta_Contatto
  con origine WIDGET_CHIAMAMI
- Verifico in Mailpit che è arrivata email all'agente assegnato
- Se modifico la scadenza del token a una data passata, vedo la pagina
  "termine superato"

NOTE OPERATIVE:
- Per il countdown deadline usa date-fns
- Per il widget Chiamami, considera framer-motion per l'animazione
  expand/collapse
- I dati del cliente NON devono esporre informazioni sensibili nel
  payload JSON: solo i campi necessari alla visualizzazione
- Committa con: "feat(cliente): area cliente con 4 opzioni e widget Chiamami"
```

## Criteri di accettazione

- [ ] Cliccando il link dall'email accedo all'area cliente con i dati corretti
- [ ] Le 4 opzioni sono visivamente distinte e nell'ordine giusto
- [ ] Il valore della gift card e il pricing di riacquisto sono mostrati correttamente
- [ ] Il countdown alla deadline funziona
- [ ] Il widget Chiamami si apre/chiude e invia richieste correttamente
- [ ] La richiesta crea un record nel DB con assegnazione corretta
- [ ] L'agente assegnato riceve email di notifica in Mailpit
- [ ] Pagina "token scaduto" è user-friendly

---

# MISSIONE 5 — Flusso restituzione completo

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** Missione 4
**Output:** flusso "Restituisci il bene" funzionante con FES (mock OTP) e PDF verbale

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 6.4d (flusso restituzione), 5.4 (multi-bene)
@MISSIONS.md missione 5

CONTESTO:
L'area cliente è pronta. Iniziamo a implementare il primo dei quattro
flussi di scelta: la restituzione del bene. È il più semplice perché
chiude la pratica senza pagamenti né rinnovi.

OBIETTIVO:
1. Implementa il service `backend/src/services/otp.service.ts` come
   MOCK:
   - generateOtp(metodo: 'SMS' | 'EMAIL', destinatario: string) →
     ritorna un codice OTP a 6 cifre, lo logga in console + lo salva
     in DB (creando tabella Otp se serve, con scadenza 10 min)
   - verifyOtp(metodo, destinatario, codice) → ritorna true/false
   - In modalità test (feature_flags.modalita_test = true), accetta
     SEMPRE il codice "123456" come valido per qualsiasi destinatario
2. Implementa il provider firma `backend/src/providers/signature/fea.provider.ts`
   come MOCK con interfaccia tipata da SPECS 8.3.2. In modalità mock,
   "firma" significa: aggiungere metadati (timestamp, OTP verificato,
   IP cliente, user-agent) al PDF e calcolare un SHA-256.
3. Installa PDFKit nel backend.
4. Crea il service `backend/src/services/pdf.service.ts` con la
   funzione `generaVerbaleRestituzione(contratto_eol_id, decisione_id)`
   che produce un PDF con:
   - Logo NSM (placeholder)
   - Titolo "Verbale di conferma restituzione"
   - Dati cliente (ragione sociale, P.IVA, sede)
   - Dati contratto (numero NSM + Grenke, scadenza)
   - Elenco beni in restituzione
   - Le 5 istruzioni operative (disable Find My/Knox, reset, integrity
     check, packaging, spedizione) — testo statico
   - Indirizzo di spedizione (placeholder configurabile)
   - Termini e condizioni di restituzione conforme
   - Sezione firma: nome, data, IP, OTP verificato, hash SHA-256
5. Crea la pagina `frontend/src/pages/cliente/FlussoRestituzione.tsx`:
   - Step 1: schermata di conferma con istruzioni di restituzione e
     elenco beni
   - Checkbox di accettazione T&C (obbligatorio)
   - Step 2: richiesta OTP (scelta SMS o email)
   - Step 3: inserimento codice OTP (input 6 cifre, autofocus, masked)
   - Step 4: pagina di conferma con download PDF e istruzioni email
6. Implementa rotte backend:
   - POST `/api/cliente/decisione/restituzione/inizia` (richiede OTP)
   - POST `/api/cliente/decisione/restituzione/conferma` (verifica OTP,
     crea Decisione_Cliente, aggiorna stato pratica, genera PDF, invia
     email di conferma)
7. Crea template email `templates/email/conferma_restituzione.html` con
   il PDF in allegato.
8. Aggiorna AreaPratica.tsx: cliccando "Scegli" su Restituzione, naviga
   a FlussoRestituzione.

VINCOLI:
- NON modificare il flusso degli altri 3 (placeholder rimangono per ora)
- L'OTP scaduto deve dare errore chiaro, non crashare
- Il PDF deve essere salvato in `backend/storage/pdfs/` con nome
  univoco (es. verbale_restituzione_<contratto_id>_<timestamp>.pdf)
- Il path del PDF deve essere salvato in Decisione_Cliente.pdf_conferma_path
- Devi calcolare e salvare l'hash SHA-256 del PDF in
  Decisione_Cliente.hash_pdf

OUTPUT ATTESO:
- Dall'area cliente clicco "Restituisci il bene"
- Vedo la schermata di conferma con i beni e le istruzioni
- Accetto T&C, clicco "Procedi"
- Scelgo "Ricevi OTP via Email"
- Vedo il codice OTP nel log del backend O in Mailpit (mock)
- Inserisco "123456" (modalità test) o il codice ricevuto
- Vengo portato alla pagina di conferma
- Posso scaricare il PDF "Verbale di restituzione"
- Mi arriva email con PDF in allegato
- In Prisma Studio: pratica con stato CHIUSA_RESTITUZIONE_CONFERMATA,
  Decisione_Cliente con opzione RESTITUZIONE e PDF path valorizzato

NOTE OPERATIVE:
- PDFKit non gestisce bene Unicode di default: usa la registrazione
  font per supportare accenti italiani
- Per il PDF firma "mock", crea una sezione visibile nel PDF con
  blockquote "Documento firmato elettronicamente in modalità mock.
  Per uso produzione integrare provider FEA certificato eIDAS."
- Committa con: "feat(flussi): flusso restituzione completo con OTP mock e PDF"
```

## Criteri di accettazione

- [ ] Il flusso completo è percorribile dall'area cliente al PDF finale
- [ ] L'OTP "123456" funziona in modalità test
- [ ] Il PDF generato è leggibile, ben formattato e include tutti i dati
- [ ] L'hash SHA-256 del PDF è calcolato e salvato
- [ ] La pratica passa correttamente in CHIUSA_RESTITUZIONE_CONFERMATA
- [ ] L'email di conferma arriva in Mailpit con PDF allegato

---

# MISSIONE 6 — Flusso riacquisto completo (con step "Hai dubbi?" e mock pagamenti)

**Modello consigliato:** Claude Opus 4.6 (flusso complesso con stati e pagamenti)
**Dipendenze:** Missione 5
**Output:** flusso completo di riacquisto con step intermedio, mock Fabrick/Stripe, fattura PDF

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 6.4b (flusso riacquisto), 5.1 (pricing),
8.3.1 (interfaccia provider pagamenti)
@MISSIONS.md missione 6

CONTESTO:
Il flusso restituzione è completato. Ora il flusso più complesso:
il riacquisto del bene. Comprende uno step intermedio "Hai dubbi?"
che permette al cliente di parlare con un agente prima di pagare,
e i pagamenti mockati Fabrick (open banking) e Stripe (carte).

OBIETTIVO:
1. Crea i provider di pagamento MOCK in `backend/src/providers/payment/`:
   - `types.ts` con interfaccia PaymentProvider come da SPECS 8.3.1
   - `fabrick.provider.ts`: mock che simula bonifico istantaneo
   - `stripe.provider.ts`: mock che simula carta di credito
   - In modalità test, entrambi accettano il pagamento con probabilità
     90% (10% errore per testare il caso fallimento)
   - Restituiscono session_id e transaction_id
2. Implementa il service `backend/src/services/payment.service.ts` con:
   - initiatePayment(contratto_eol_id, provider) → crea record Pagamento
     con stato INIZIATO, chiama il provider, ritorna URL di redirect
   - verifyPayment(session_id) → polla il provider, aggiorna lo stato
   - handlePaymentCallback(session_id, esito) → callback chiamato dal
     provider quando il pagamento è completato/fallito
3. Implementa il service per fatturazione `backend/src/services/invoice.service.ts`:
   - generaFatturaAcconto(pagamento_id) → PDF di fattura di acconto
     con numero progressivo, dati cliente, importo netto/IVA/totale,
     riferimento contratto
   - Il numero fattura è progressivo: usa una tabella Counter (year, type, value)
4. Crea la pagina `frontend/src/pages/cliente/FlussoRiacquisto.tsx`
   con i seguenti step (state machine):

   STEP A — Conferma e step "Hai dubbi?":
   - Riepilogo dei beni
   - Prezzo: netto + IVA 22% + totale (calcolati lato server)
   - Sezione "Hai dubbi?" con due bottoni:
     [Sì, contattatemi prima]  [No, procedo con il pagamento]
   - Se "Sì": apre form richiesta ricontatto (riusa logica widget
     Chiamami ma con origine STEP_PRE_PAGAMENTO), poi mostra
     "Ti contatteremo a breve. Riceverai un'email per riprendere il
     pagamento quando vorrai" → pratica entra in stato
     RIACQUISTO_IN_ATTESA_CHIAMATA
   - Se "No": va a STEP B

   STEP B — Accettazione T&C:
   - Mostra termini e condizioni di riacquisto (PDF visualizzabile inline)
   - Checkbox accettazione + OTP FES (riusa otp.service da missione 5)

   STEP C — Scelta metodo pagamento:
   - Due card: "Fabrick (bonifico istantaneo)" e "Stripe (carta)"
   - Cliente sceglie, viene reindirizzato a una pagina mock del provider

   STEP D — Pagina mock pagamento provider:
   - Mostra finta UI di Fabrick o Stripe (form fittizio, niente input reali)
   - Bottone "Simula pagamento riuscito" / "Simula pagamento fallito"
   - Al click, chiama callback backend, redirect a STEP E

   STEP E — Conferma:
   - Successo: messaggio "Pagamento completato", download fattura,
     prossimi passi (cosa succederà alla scadenza)
   - Fallimento: messaggio "Pagamento fallito", bottone "Riprova"

5. Implementa rotte backend:
   - POST `/api/cliente/decisione/riacquisto/inizia` (con choice "contattatemi" o "procedi")
   - POST `/api/cliente/decisione/riacquisto/conferma-tc` (verifica OTP)
   - POST `/api/cliente/decisione/riacquisto/scegli-metodo` (Fabrick o Stripe)
   - GET `/api/cliente/pagamento/:session_id/status` (polling)
   - POST `/api/pagamenti/callback/:provider/:session_id` (callback mock)
6. Implementa nel backoffice una vista "Riacquisti in attesa chiamata"
   con bottone "Sblocca pagamento" che invia email al cliente con link
   per riprendere.
7. Email transazionali:
   - Conferma pagamento + fattura
   - Notifica fallimento pagamento
   - Notifica al cliente per "sblocco pagamento" dopo chiamata agente

VINCOLI:
- Il pagamento avviene PRIMA del passaggio di proprietà (T+11): la
  fattura è di ACCONTO (natura_giuridica = "ACCONTO"). Sarà a SALDO
  alla scadenza del contratto (per ora basta acconto)
- NON implementare ancora la generazione automatica della fattura di
  saldo (sarà parte della missione 10 o lasciata agli sviluppatori)
- Gli stati della pratica devono essere coerenti: RIACQUISTO_IN_ATTESA_CHIAMATA,
  RIACQUISTO_PAGATO, RIACQUISTO_ABBANDONATO
- Implementa idempotenza sui callback di pagamento (chiamate ripetute
  non duplicano fatture)

OUTPUT ATTESO:
- Posso completare il flusso end-to-end in entrambe le varianti
  (con e senza "Hai dubbi?")
- I pagamenti mock funzionano sia in successo che in fallimento
- La fattura PDF si genera correttamente con numero progressivo
- Gli stati della pratica sono coerenti in ogni momento
- Le email di conferma/fallimento arrivano in Mailpit

NOTE OPERATIVE:
- La state machine è il cuore di questa missione: scrivila prima
  come diagramma di stato, poi implementa
- Usa XState (libreria) se vuoi essere fancy, oppure un semplice
  useReducer in React
- Per i timer del polling, usa react-query con refetchInterval
- Committa con: "feat(flussi): flusso riacquisto con step Hai dubbi e mock pagamenti"
```

## Criteri di accettazione

- [ ] Flusso percorribile end-to-end nelle due varianti
- [ ] Step "Hai dubbi?" crea correttamente Richiesta_Contatto e mette in pausa
- [ ] Pagamento Fabrick funziona (mock)
- [ ] Pagamento Stripe funziona (mock)
- [ ] Pagamento fallito gestito correttamente (può ritentare)
- [ ] Fattura PDF generata con numero progressivo unico
- [ ] Stati della pratica coerenti per tutto il flusso
- [ ] Email di conferma con fattura allegata

---

# MISSIONE 7 — Flusso rinnovo + contatto personalizzato

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** Missione 6
**Output:** flussi 4a (rinnovo) e 4c (contatto personalizzato) completi

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 6.4a (flusso rinnovo), 6.4c (flusso contatto),
5.2 (gift card), 5.3 (regole assegnazione)
@MISSIONS.md missione 7

CONTESTO:
Restituzione e riacquisto sono completi. Mancano i due flussi più
"commerciali": rinnovo (l'opzione promossa, che porta a un nuovo
contratto FLEX) e contatto personalizzato (cliente vuole parlare con
un consulente).

OBIETTIVO:

A — FLUSSO RINNOVO:
1. Crea `frontend/src/pages/cliente/FlussoRinnovo.tsx`:
   - Pagina di pre-qualificazione con campi:
     * Tipo device (radio: Apple MacBook / Apple iPad / PC Windows /
       Smartphone / Altro)
     * Numero device desiderati (numeric, default 1)
     * Durata desiderata (radio: 24/36/48 mesi)
     * Budget orientativo mensile (slider o input numerico, opzionale)
     * Note libere (textarea)
   - Banner evidenziato: "🎁 Riceverai una gift card Smartcom Solutions
     di €[VALORE] alla firma del nuovo contratto FLEX!"
   - Bottone "Procedi" che richiede OTP FES
   - Pagina di conferma con messaggio: "La tua richiesta di rinnovo è
     stata ricevuta. Un nostro agente ti contatterà entro 5 giorni
     lavorativi per definire i dettagli del nuovo contratto."
2. Implementa rotte backend:
   - POST `/api/cliente/decisione/rinnovo/inizia`
   - POST `/api/cliente/decisione/rinnovo/conferma` (con OTP)
3. Logica backend:
   - Crea Decisione_Cliente con opzione_scelta = RINNOVO
   - Aggiorna stato pratica a DECISIONE_RINNOVO
   - Applica regole di assegnazione (SPECS 5.3) per determinare
     l'agente che gestirà la trattativa
   - Crea task nel backoffice dell'agente (vedi punto C sotto)
   - Genera PDF "Conferma interesse al rinnovo" con i dati di
     pre-qualificazione
   - Invia email al cliente con PDF
   - Invia email all'agente assegnato con tutti i dati
4. Template email `templates/email/conferma_rinnovo.html` e
   `templates/email/notifica_agente_rinnovo.html`.

B — FLUSSO CONTATTO PERSONALIZZATO:
1. Crea `frontend/src/pages/cliente/FlussoContatto.tsx`:
   - Form con:
     * Disponibilità oraria (radio: mattina / pomeriggio / indifferente)
     * Modalità preferita (radio: telefono / email / videocall)
     * Note libere (textarea)
   - Bottone "Invia richiesta" (NO OTP, perché non è decisione vincolante)
   - Pagina di conferma "Ti contatteremo a breve"
2. Implementa POST `/api/cliente/decisione/contatto`:
   - Crea Decisione_Cliente con opzione_scelta = CONTATTO
   - Crea Richiesta_Contatto con origine = OPZIONE_CONTATTO_PERSONALIZZATO
   - Aggiorna stato pratica a DECISIONE_CONTATTO
   - Applica regole assegnazione 5.3
   - Notifica agente

C — TASK BACKOFFICE PER AGENTI:
1. Crea nel backoffice una pagina `frontend/src/pages/backoffice/MieiTask.tsx`
   accessibile a tutti gli utenti con ruolo AGENTE/JUNIOR_AGENT/CAPO_AREA:
   - Lista task assegnati all'utente loggato
   - Filtri: tipo task (rinnovo / contatto / sblocco pagamento), stato,
     priorità
   - Card per ogni task con: cliente, contratto, tipo, data scadenza,
     bottone "Apri pratica"
2. Implementa autenticazione minima per il backoffice (Passport.js
   local strategy): login con email + password, sessione con cookie
   httpOnly. Per ora seed con password fissa "test1234" per tutti gli
   utenti NSM.
3. Implementa middleware `requireRole(...roles)` per proteggere le
   route del backoffice.

VINCOLI:
- NON implementare ancora la stipula del NUOVO contratto FLEX (è fuori
  scope del template EOL): il flusso si ferma a "richiesta inviata,
  agente contatterà"
- NON erogare ancora la gift card (sarebbe alla firma del nuovo
  contratto, fuori scope): solo comunicarla come incentivo
- L'agente assegnato deve essere determinato all'atto della creazione
  della Decisione/Richiesta, salvato in DB e NON ricalcolato dinamicamente

OUTPUT ATTESO:
- Flusso rinnovo percorribile dall'area cliente con OTP e PDF di conferma
- Flusso contatto percorribile senza OTP, con conferma
- L'agente assegnato corretto (secondo regole 5.3) riceve email + task
  nel backoffice
- Posso loggarmi al backoffice come "agente1@nsm.it / test1234" e
  vedere i miei task

NOTE OPERATIVE:
- Per il login backoffice, riusa shadcn/ui Form + Input
- Le regole di assegnazione vanno in un service riusabile
  `backend/src/services/assignment.service.ts` con funzione
  `assegnaPratica(contratto_eol_id, scope: 'CONTATTO' | 'RINNOVO')`
- Committa con: "feat(flussi): rinnovo e contatto personalizzato + task backoffice"
```

## Criteri di accettazione

- [ ] Flusso rinnovo: pre-qualificazione → OTP → conferma → PDF + email
- [ ] Flusso contatto: form → conferma → notifica agente
- [ ] Regole di assegnazione applicate correttamente:
  - [ ] Se agente originario attivo → assegnato a lui
  - [ ] Se contratto > 5000€ e agente non attivo → Capo Area
  - [ ] Altrimenti → BACKOFFICE_INTERNO
- [ ] Login backoffice funzionante con password seed "test1234"
- [ ] Pagina "Miei Task" mostra i task corretti per l'utente loggato

---

# MISSIONE 8 — Solleciti automatici email + escalation telefonica

**Modello consigliato:** Claude Sonnet 4.6
**Dipendenze:** Missione 7
**Output:** scheduler che invia solleciti email e crea task escalation telefonica

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 6.5.1 (solleciti email), 6.5.2 (escalation
telefonica), 5.6 (silenzio cliente), 9.2 (timeline)
@MISSIONS.md missione 8

CONTESTO:
I quattro flussi cliente sono implementati. Ora serve garantire che il
sistema "insista" sul cliente che non risponde, attraverso solleciti
email automatici e task di chiamata per gli agenti. Questo è il cuore
della prevenzione del silenzio cliente.

OBIETTIVO:
1. Crea il file `config/timeline.json` esattamente come da SPECS 9.2.
2. Installa node-cron nel backend.
3. Crea il service `backend/src/services/scheduler.service.ts` che
   gira ogni notte alle 02:00 ("0 2 * * *"):
   - Carica la timeline da config/timeline.json
   - Per ogni pratica in stato COMUNICAZIONE_INVIATA o IN_ATTESA_DECISIONE,
     calcola giorni_a_scadenza = data_scadenza - oggi
   - Se giorni_a_scadenza ∈ {90, 60, 45, 35}: invia sollecito email
     corrispondente (sollecito_1, _2, _3, _4) e crea record Comunicazione
   - Se giorni_a_scadenza ∈ {50, 40, 35}: crea task di escalation
     telefonica per l'agente assegnato (vedi punto 5)
   - Se giorni_a_scadenza == 30 e la pratica NON ha alcuna decisione:
     marca come SILENZIO_PERDITA_DEFINITIVA, invia notifica al
     BACKOFFICE_INTERNO
4. Crea i 4 template email solleciti in `templates/email/`:
   - sollecito_1.html (T-90, gentile reminder)
   - sollecito_2.html (T-60, evidenzia vantaggio rinnovo)
   - sollecito_3.html (T-45, deadline si avvicina)
   - sollecito_4.html (T-35, ULTIMA CHIAMATA, esplicito su proroga)
   Ogni template ha tono crescente di urgenza ma sempre professionale.
   Riusa le variabili di merge della comunicazione iniziale.
5. Crea entità Task_Escalation nel database (aggiungi al schema Prisma):
   - id, contratto_eol_id, tipo (T_50 / T_40 / T_35), assegnato_a_id,
     stato (DA_CHIAMARE / CHIAMATO / NON_RAGGIUNTO), data_creazione,
     data_completamento, esito (RISPOSTA_POSITIVA / NEGATIVA /
     NON_RAGGIUNTO / RICHIAMARE), note
   - Migra il DB
6. Per ogni task creato, invia email all'agente assegnato con:
   - Dati cliente e contratto
   - Numero telefono cliente
   - Storico comunicazioni email inviate
   - Link al task nel backoffice
   - Allegato: script di chiamata (markdown → PDF)
7. Crea i 3 script di chiamata in `templates/script/`:
   - script_escalation_t50.md
   - script_escalation_t40.md
   - script_escalation_t35.md
   Contenuti: salutare, presentarsi, ricordare scadenza, illustrare
   opzioni, gestire obiezioni comuni, chiusura. Tono cordiale ma fermo.
   IMPORTANTE: gli script devono concentrarsi SOLO sulle 4 opzioni di
   fine contratto, MAI proporre altri servizi (compliance SPECS 11).
8. Implementa nel backoffice la pagina
   `frontend/src/pages/backoffice/TaskEscalation.tsx`:
   - Lista task assegnati all'utente con priorità (T_35 in rosso, T_40
     in giallo, T_50 in verde)
   - Per ogni task: dati cliente, bottone "Chiamato" che apre form
     esito (radio buttons + note)
   - Submit: aggiorna Task_Escalation con esito, crea record
     Comunicazione tipo ESCALATION_TELEFONICA_X
   - Se esito è RISPOSTA_POSITIVA con decisione: l'agente può
     direttamente registrare la decisione del cliente dal backoffice
     (form rapido con le 4 opzioni)
9. Aggiungi nel backoffice una vista "Inserimento manuale decisione"
   per i casi gestiti telefonicamente: form che permette all'agente
   di registrare in nome del cliente la scelta presa al telefono
   (con campo "modalità decisione = TELEFONICA").

VINCOLI:
- Lo scheduler deve essere IDEMPOTENTE: se gira due volte nello stesso
  giorno, non duplica solleciti. Verifica via query (Comunicazione
  esistente con tipo SOLLECITO_X e data > inizio giornata)
- Le pratiche con opt_out_comunicazioni = true non ricevono solleciti
  email automatici (ma le escalation telefoniche sì, perché parte del
  contratto)
- Lo scheduler deve poter essere TRIGGERATO MANUALMENTE da un endpoint
  POST `/api/admin/scheduler/run-now` per testing (solo admin)
- Il task SILENZIO_PERDITA_DEFINITIVA deve essere una transizione
  esplicita di stato, registrata con Audit_Event

OUTPUT ATTESO:
- Posso triggerare manualmente lo scheduler dal backoffice (admin)
- Per le pratiche con scadenza vicina, vedo creati solleciti in Mailpit
- Per le pratiche con scadenza in finestra escalation, vedo Task_Escalation
  creati e notifiche email agli agenti
- Posso completare un task escalation dal backoffice
- Posso registrare una decisione "via telefono" senza dover passare
  dall'area cliente
- Pratiche silenti vengono marcate SILENZIO_PERDITA_DEFINITIVA

NOTE OPERATIVE:
- Per testare lo scheduler in modo deterministico, manipola le
  data_scadenza dei contratti seed in modo che siano esattamente a
  T-90, T-60, T-50, T-45, T-40, T-35, T-30 da oggi
- Aggiungi al package.json uno script `db:seed:timeline` che fa
  questo setup
- Committa con: "feat(scheduler): solleciti email automatici e
  escalation telefonica"
```

## Criteri di accettazione

- [ ] Triggerando lo scheduler manualmente, vengono inviati solleciti corretti
- [ ] Task_Escalation creati nei momenti giusti per gli agenti giusti
- [ ] Esecuzione doppia dello scheduler non duplica record
- [ ] Pratiche con opt_out non ricevono email (ma sì task telefonici)
- [ ] Le pratiche a T-30 senza decisione passano a SILENZIO_PERDITA_DEFINITIVA
- [ ] Vista TaskEscalation nel backoffice funzionante con form esito
- [ ] Agente può registrare decisione cliente "via telefono"

---

# MISSIONE 9 — Backoffice NSM (dashboard + lista pratiche + rischio silenzio + outlier)

**Modello consigliato:** Gemini 3 Pro (forte componente UI)
**Dipendenze:** Missione 8
**Output:** backoffice completo con dashboard KPI, lista pratiche, dettaglio, gestione outlier

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 6.6 (backoffice), 1.4 (KPI), 7.4 (mockup dashboard)
@MISSIONS.md missione 9

CONTESTO:
Tutti i flussi cliente e di servizio sono implementati. È il momento di
costruire l'interfaccia operativa per il team NSM: dashboard, lista
pratiche, dettaglio singola pratica, gestione outlier, reportistica
base.

OBIETTIVO:

A — DASHBOARD GENERALE:
1. Crea `frontend/src/pages/backoffice/Dashboard.tsx` con il layout
   esatto di SPECS 7.4:
   - Sezione "⚠️ Pratiche a rischio silenzio" con 3 card colorate:
     T-50 (verde), T-40 (giallo), T-35 (ROSSO)
     Ognuna mostra il count + link alla lista filtrata
   - Sezione KPI 2026: 5 card con tasso non-silenzio (verde se >85%),
     tasso rinnovo, tasso riacquisto, margine medio, tempo medio decisione
   - Lista pratiche recenti (ultime 20 modificate) con filtri rapidi
2. Implementa rotte backend `/api/backoffice/dashboard/*`:
   - GET `/risk-silence-counts` → conteggi delle 3 categorie
   - GET `/kpi` → calcolo dei 6 KPI dell'anno corrente
   - GET `/pratiche/recent` → ultime 20

B — LISTA PRATICHE COMPLETA:
1. Crea `frontend/src/pages/backoffice/ListaPratiche.tsx`:
   - Tabella sortable e paginata
   - Colonne: Contratto NSM, Contratto Grenke, Cliente, Scadenza, Stato,
     Agente assegnato, Pricing riacquisto, Decisione presa, Azioni
   - Filtri laterali: stato, agente, scadenza (date range), origine,
     decisione, rischio silenzio (checkbox)
   - Bottone "Esporta CSV" che scarica la lista filtrata
2. Rotta GET `/api/backoffice/pratiche` con query params per filtri e
   paginazione (page, pageSize, sortBy, sortOrder, filters...)

C — VISTA SINGOLA PRATICA:
1. Crea `frontend/src/pages/backoffice/PraticaDettaglio.tsx`:
   - Header: cliente + contratto (NSM + Grenke) + stato corrente con
     badge colorato + countdown a scadenza
   - Tab 1 "Panoramica": dati cliente, dati contratto, dati economici
     (pricing Grenke, pricing riacquisto, margine, valore gift card)
   - Tab 2 "Timeline": tutte le Comunicazioni in ordine cronologico
     (email inviate, OTP verificati, decisioni prese, chiamate
     effettuate), con icone per tipo evento
   - Tab 3 "Richieste contatto": lista delle Richieste_Contatto con
     stato e azioni
   - Tab 4 "Audit log": tabella eventi tecnici (per ora vuota,
     popolata in missione 10)
   - Azioni globali (sidebar destra):
     * Reinvia email
     * Cambia assegnazione (dropdown agenti)
     * Modifica deadline (con campo motivazione obbligatorio)
     * Sblocca pagamento (se in RIACQUISTO_IN_ATTESA_CHIAMATA)
     * Inserisci decisione manuale
     * Esporta storico PDF
2. Rotte backend per ogni azione.

D — GESTIONE OUTLIER:
1. Crea `frontend/src/pages/backoffice/GestioneOutlier.tsx`
   (accessibile solo a BACKOFFICE_INTERNO e ADMIN):
   - Lista contratti con stato_riconciliazione = OUTLIER_DA_GESTIRE
   - Per ognuno: dati dall'Excel + suggerimenti di matching basati su
     ragione sociale e P.IVA (fuzzy search con fuse.js)
   - Azioni: Associa esistente / Crea nuovo (con form) / Scarta (con
     motivazione)
2. Endpoint POST `/api/backoffice/outliers/:id/resolve` con payload
   diverso per ogni azione.

E — REPORTISTICA:
1. Crea `frontend/src/pages/backoffice/Reportistica.tsx`:
   - Selezione periodo (mese / trimestre / anno corrente)
   - Report 1: "Sintesi KPI del periodo" (i 6 KPI + grafici Recharts)
   - Report 2: "Perdite da silenzio" — calcola il margine teorico
     perso = somma di margini delle pratiche silenti
   - Report 3: "Performance per agente" — tabella con per ogni agente:
     n. pratiche assegnate, tasso non-silenzio, tasso rinnovo, margine
     generato
   - Esporta tutti i report come PDF o Excel

VINCOLI:
- Tutte le pagine devono essere responsive (anche se ottimizzate per
  desktop, devono essere usabili su tablet)
- Performance: usa server-side pagination per liste con > 50 elementi
- Le azioni che modificano dati devono mostrare conferma modale prima
- Usa shadcn/ui Components ovunque possibile (Table, Tabs, Card,
  Badge, Dialog, Toast)

OUTPUT ATTESO:
- Dashboard mostra correttamente i KPI con dati reali dal DB
- Lista pratiche filtrabile e paginata, con export CSV funzionante
- Vista dettaglio mostra tutti i dati e le azioni
- Gestione outlier permette di risolvere casi non riconciliati
- Reportistica genera dati corretti con grafici e export

NOTE OPERATIVE:
- Per i grafici Recharts: line chart per evoluzione KPI nel tempo,
  bar chart per performance agenti
- Per la fuzzy search degli outlier: fuse.js con threshold 0.3 su
  ragione_sociale + piva
- Considera l'uso di TanStack Query (react-query) per gestire fetching,
  cache e refresh automatico
- Committa con: "feat(backoffice): dashboard, lista pratiche, dettaglio,
  outlier, reportistica"
```

## Criteri di accettazione

- [ ] Dashboard mostra KPI corretti e card pratiche a rischio silenzio
- [ ] Lista pratiche filtrabile, sortable, paginata, esportabile in CSV
- [ ] Vista dettaglio pratica mostra tutti i dati con tab e timeline
- [ ] Tutte le azioni backoffice funzionano (reinvio email, cambio assegnazione, ecc.)
- [ ] Gestione outlier risolve i casi non riconciliati
- [ ] Reportistica genera report corretti con grafici

---

# MISSIONE 10 — Audit log + export lista Grenke + refinement finale

**Modello consigliato:** Claude Opus 4.6 (audit chain crittografica, refinement)
**Dipendenze:** Missione 9
**Output:** sistema completo con audit log a catena di hash, export lista riacquisti Grenke, documentazione finale

## Prompt iniziale per l'agent

```
@SPECS.md sezioni 5.7 (audit chain), 6.6.3 (export lista Grenke),
8 (architettura), 11 (privacy)
@MISSIONS.md missione 10

CONTESTO:
Il template è funzionalmente completo. Ora serve l'ultimo strato:
l'audit log strutturato con catena crittografica per garantire la
tracciabilità legale, l'export della lista riacquisti per Grenke, e
il refinement generale del progetto in vista della consegna agli
sviluppatori finali.

OBIETTIVO:

A — AUDIT LOG STRUTTURATO:
1. Implementa il service `backend/src/services/audit.service.ts`:
   - registraEvento(contratto_eol_id, attore, azione, dati)
   - Calcola hash_corrente come SHA-256(timestamp + attore + azione +
     JSON(dati) + hash_precedente)
   - Il primo evento di una pratica ha hash_precedente = "GENESIS"
   - Salva in Audit_Event
2. Sostituisci TUTTI i console.log "audit-like" sparsi nel codice con
   chiamate al audit.service. Eventi da registrare:
   - PRATICA_CREATA (al momento dell'importazione)
   - COMUNICAZIONE_INVIATA (per ogni email/PEC inviata)
   - LINK_APERTO_DAL_CLIENTE (quando il cliente clicca il link)
   - DECISIONE_PRESA (con dettagli dell'opzione scelta)
   - OTP_VERIFICATO
   - PAGAMENTO_INIZIATO / PAGAMENTO_COMPLETATO / PAGAMENTO_FALLITO
   - RICHIESTA_CONTATTO_CREATA
   - TASK_ESCALATION_COMPLETATO
   - SILENZIO_DEFINITO
   - PRATICA_CHIUSA
   - MODIFICA_BACKOFFICE (qualsiasi modifica manuale da un operatore)
3. Implementa endpoint `/api/admin/audit/verify/:contratto_id` che
   verifica l'integrità della catena per una specifica pratica
   (ricalcola tutti gli hash dal primo evento e confronta).
4. Aggiorna la tab "Audit log" della vista PraticaDettaglio per mostrare
   tutti gli Audit_Event in tabella, con campo "✓ catena verificata" o
   "⚠ catena rotta" calcolato al momento.
5. Implementa export PDF dell'audit log: `generaAuditExport(contratto_id)`
   che produce un PDF con tutti gli eventi, hash chain, e firma SHA-256
   del PDF stesso.

B — EXPORT LISTA RIACQUISTI PER GRENKE:
1. Crea `frontend/src/pages/backoffice/EsportaListaGrenke.tsx`:
   - Selezione periodo (es. "Prossime scadenze del mese di X")
   - Anteprima delle pratiche incluse (in stato RIACQUISTO_PAGATO)
   - Selezione manuale per escludere casi specifici
   - Bottone "Genera file Excel per Grenke"
2. Service `backend/src/services/grenke-export.service.ts`:
   - Estrae pratiche RIACQUISTO_PAGATO con scadenza nel periodo
   - Genera file Excel con formato standardizzato (concordare con Grenke,
     per ora colonne: Numero contratto Grenke, Ragione sociale cliente,
     P.IVA, Data scadenza, Importo riacquisto, Stato pagamento Smartcom,
     Note)
   - Salva file in `backend/storage/grenke-exports/` con nome timestampato
3. Registra evento Audit_Event "LISTA_RIACQUISTI_GENERATA" con elenco
   contratti inclusi.

C — REFINEMENT GENERALE:
1. Review completa del codice:
   - Estrai tutte le costanti magiche in config files
   - Verifica che TUTTE le pagine abbiano gestione errori user-friendly
   - Aggiungi loading states (spinner, skeleton) ovunque ci siano fetch
   - Aggiungi Toast notifications per ogni azione importante (shadcn/ui)
2. Test end-to-end (manuali, non automatici):
   - Crea un file `TEST_SCENARIOS.md` con 10 scenari di test guidati
     che coprono tutti i flussi principali
   - Per ogni scenario: setup, passi, risultato atteso
3. Documentazione finale:
   - Aggiorna README.md con: descrizione progetto, prerequisiti,
     installazione, struttura cartelle, comandi utili, troubleshooting
   - Crea `docs/integration-guide.md` per gli sviluppatori finali:
     come sostituire i mock con i provider reali (Fabrick, Stripe, FEA,
     SMTP produttivo), come migrare da SQLite a PostgreSQL su AWS,
     come implementare SSO
   - Crea `docs/api-reference.md` con elenco di tutte le rotte API
     organizate per area (cliente, backoffice, admin)
   - Crea `DECISIONS.md` con le decisioni di design prese durante lo
     sviluppo (ogni "perché abbiamo fatto X invece di Y")
4. Privacy compliance check:
   - Verifica che TUTTE le email abbiano il link opt-out
   - Verifica che TUTTI i log non contengano dati personali sensibili
     (P.IVA, CF) in chiaro: maschera o ometti dove possibile
   - Verifica che il diritto di cancellazione (art. 17 GDPR) sia
     implementabile: endpoint admin DELETE
     `/api/admin/clienti/:id/forget` che anonimizza tutti i dati
     personali mantenendo i record per audit

VINCOLI:
- NON rompere funzionalità esistenti durante il refactor
- L'audit log non deve mai bloccare un'operazione di business (se il
  save del log fallisce, logga l'errore ma non bloccare): graceful
  degradation
- Il file Excel di export deve seguire un mapping documentato (anche
  se per ora speculativo, da confermare con Grenke)
- Tutta la documentazione in italiano

OUTPUT ATTESO:
- Audit log popolato per tutte le pratiche con catena verificabile
- Posso esportare la lista riacquisti per Grenke con anteprima e
  selezione manuale
- README e documentazione tecnica complete
- TEST_SCENARIOS.md con scenari di test eseguibili manualmente
- Privacy compliance verificata

NOTE OPERATIVE:
- Per la verifica dell'audit chain, calcola gli hash in batch e
  presenta i risultati in modo chiaro
- L'export Grenke usa SheetJS (già installato dalla missione 2)
- Per il refinement, dedica una sessione specifica a passare in
  rassegna ogni pagina e migliorarne UX/spacing/feedback
- Committa con: "feat(finalize): audit log, export Grenke, docs e
  refinement finale"
- Crea un tag git "v1.0.0-template" alla fine
```

## Criteri di accettazione

- [ ] Audit log popolato per ogni evento significativo
- [ ] Verifica integrità catena hash funzionante (e "rotta" se manomesso)
- [ ] Export lista riacquisti Grenke con anteprima e selezione
- [ ] README aggiornato e chiaro
- [ ] Documentazione `docs/integration-guide.md` completa
- [ ] Documentazione `docs/api-reference.md` completa
- [ ] `DECISIONS.md` documenta le scelte architetturali
- [ ] `TEST_SCENARIOS.md` con almeno 10 scenari guidati
- [ ] Tag git v1.0.0-template creato

---

## Note conclusive

### Quando il template è "pronto per la consegna"

Dopo aver completato tutte le 10 missioni e verificato i criteri di accettazione, il template è pronto per essere consegnato al team di sviluppo Smartcom che lo integrerà nella piattaforma AWS app.smartcomsolutions.it.

Cosa consegni concretamente:
1. **Repository Git** completo del template (puoi pubblicarlo come progetto privato su GitHub interno, o esportarlo come ZIP)
2. **README.md** che spiega il progetto
3. **SPECS.md v1.1** (specifica funzionale)
4. **MISSIONS.md** (questo documento, utile come storia dello sviluppo)
5. **DECISIONS.md** (decisioni architetturali)
6. **docs/integration-guide.md** (come integrare in produzione)
7. **docs/api-reference.md** (API reference)
8. **TEST_SCENARIOS.md** (scenari di test)
9. **data-samples/** (file Excel di esempio per test)

### Cosa il team di sviluppo finale dovrà fare

Lavorando sopra il template:

1. Sostituire i provider mock (`backend/src/providers/`) con integrazioni reali:
   - Fabrick API (open banking)
   - Stripe API (carte)
   - Provider FEA certificato eIDAS (Namirial / InfoCert / Aruba)
   - SMTP produttivo (SendGrid / AWS SES / Brevo)
   - PEC certificata (Aruba PEC API)
   - SMS gateway (Skebby / Twilio)
2. Migrare il DB da SQLite a PostgreSQL su AWS RDS
3. Implementare l'autenticazione produttiva (SSO con Active Directory o Auth0)
4. Integrare l'export lista riacquisti con il sistema di file transfer
   concordato con Grenke (SFTP? API?)
5. Implementare la fatturazione di saldo automatica a T0 (oggi solo
   acconto)
6. Implementare l'integrazione con il sistema NSM esistente per il flusso
   di rinnovo (creazione automatica del nuovo contratto FLEX)
7. Deploy su infrastruttura AWS (ECS / Beanstalk / Lambda secondo
   strategia)
8. Test di carico e tuning
9. Conservazione a norma dei documenti firmati (provider tipo Notartel
   / Aruba Conservazione)

### Tempi stimati per il team di sviluppo finale

Sulla base della complessità delle integrazioni:
- **Sostituzione provider mock + setup AWS**: 3-4 settimane
- **Integrazioni esterne (Fabrick, Stripe, FEA, PEC)**: 4-6 settimane
  (variabile in base alla burocrazia con i provider)
- **Test e tuning**: 2-3 settimane
- **Go-live e monitoraggio iniziale**: 1-2 settimane

**Totale stimato:** 10-15 settimane (2,5-4 mesi) dal template alla produzione, in base alla disponibilità del team e dei provider.

---

**Fine documento MISSIONS.md v1.0**

*Buon lavoro con Antigravity! 🚀*
