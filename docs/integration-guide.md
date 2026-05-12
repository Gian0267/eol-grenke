# Guida all'integrazione in produzione

Questa guida è destinata al **team di sviluppo Smartcom** che integrerà il template nella piattaforma di produzione AWS (`app.smartcomsolutions.it`).

---

## Indice

1. [Panoramica dell'integrazione](#1-panoramica-dellintegrazione)
2. [Sostituzione dei provider mock](#2-sostituzione-dei-provider-mock)
3. [Migrazione database SQLite → PostgreSQL](#3-migrazione-database)
4. [Autenticazione produttiva](#4-autenticazione-produttiva)
5. [Integrazione con piattaforma NSM esistente](#5-integrazione-con-piattaforma-nsm)
6. [Trasmissione lista riacquisti a Grenke](#6-trasmissione-lista-riacquisti)
7. [Fatturazione elettronica (SDI)](#7-fatturazione-elettronica-sdi)
8. [Conservazione a norma dei documenti](#8-conservazione-a-norma)
9. [Deploy su AWS](#9-deploy-su-aws)
10. [Monitoring e alerting](#10-monitoring-e-alerting)
11. [Checklist go-live](#11-checklist-go-live)

---

## 1. Panoramica dell'integrazione

Il template segue il principio di **separazione delle interfacce**: tutti i punti di integrazione esterni sono mockati dietro interfacce TypeScript ben definite. La sostituzione con provider reali richiede tre passi per ciascun componente:

1. Implementare l'interfaccia con le librerie/SDK reali
2. Configurare le variabili d'ambiente con le credenziali di produzione
3. Aggiornare `config/feature_flags.json` (`modalita_test = false`)

### Architettura dei provider

```
backend/src/providers/
├── payment/
│   ├── fabrick.provider.ts    ← Mock open banking (Fabrick PIS)
│   └── stripe.provider.ts     ← Mock carte di credito (Stripe Checkout)
├── signature/
│   └── fea.provider.ts        ← Mock Firma Elettronica Avanzata
└── notification/
    └── email.provider.ts      ← SMTP reale (Mailpit in dev, qualsiasi SMTP in prod)
```

Ogni provider implementa un'interfaccia TypeScript comune. Per sostituire un mock basta creare una nuova classe che implementi la stessa interfaccia e iniettarla al posto del mock.

---

## 2. Sostituzione dei provider mock

### 2.1 Pagamenti — Fabrick

**Mock attuale:** `backend/src/providers/payment/fabrick.provider.ts`
Simula il flusso PIS (Payment Initiation Service) open banking con callback automatica dopo 3 secondi.

**Integrazione reale:**

1. Acquisire chiavi API sandbox e produzione dal portale Fabrick
2. Installare SDK: `npm install @fabrick/pis-sdk` (o usare REST diretto)
3. Implementare `FabrickProvider` con la stessa interfaccia:
   - `initiatePayment(amount, reference, callbackUrl)` → chiama `POST /pis/payments`
   - La callback arriva su `POST /api/pagamenti/callback/fabrick/:session_id`
4. Configurare variabili d'ambiente:
   ```
   FABRICK_API_KEY=<key>
   FABRICK_API_SECRET=<secret>
   FABRICK_ENVIRONMENT=production
   FABRICK_CALLBACK_URL=https://app.smartcomsolutions.it/api/pagamenti/callback/fabrick
   ```
5. Verificare la firma HMAC sulla callback per autenticare le notifiche

### 2.2 Pagamenti — Stripe

**Mock attuale:** `backend/src/providers/payment/stripe.provider.ts`
Simula Stripe Checkout con session ID e callback automatica.

**Integrazione reale:**

1. Installare SDK: `npm install stripe`
2. Creare Checkout Session con `stripe.checkout.sessions.create()`
3. Configurare webhook endpoint su Dashboard Stripe puntando a `/api/pagamenti/callback/stripe/:session_id`
4. Variabili d'ambiente:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUCCESS_URL=https://app.smartcomsolutions.it/pratica/{token}/riacquisto?esito=ok
   STRIPE_CANCEL_URL=https://app.smartcomsolutions.it/pratica/{token}/riacquisto?esito=annullato
   ```

### 2.3 Firma Elettronica Avanzata (FEA)

**Mock attuale:** `backend/src/providers/signature/fea.provider.ts`
Aggiunge metadati FEA al PDF senza firma crittografica reale.

**Provider valutati (eIDAS qualificati):**

| Provider | Pro | Contro |
|---|---|---|
| Namirial | API REST moderne, buona doc | Costi per volume |
| InfoCert | Leader italiano, molto usato in PA | Integrazione piu complessa |
| Aruba | Economico, diffuso | API meno moderne |

**Passi:**
1. Scegliere provider in base a contratti esistenti Smartcom
2. Implementare interfaccia `FeaProvider`:
   - `requestSignature(pdfPath, signerData)` → invia PDF al provider, riceve PDF firmato PAdES
   - `verifySignature(pdfPath)` → verifica validita firma
3. Il punto di integrazione e in `cliente.routes.ts`, funzione `restituzione/conferma` e `rinnovo/conferma`

### 2.4 SMTP produttivo

**Stato attuale:** `SmtpEmailProvider` in `backend/src/providers/notification/email.provider.ts` usa gia SMTP reale via Nodemailer. In dev punta a Mailpit (`localhost:1025`).

**Per produzione** basta cambiare le variabili d'ambiente:

```
SMTP_HOST=smtp.sendgrid.net        # oppure email-smtp.eu-west-1.amazonaws.com (SES)
SMTP_PORT=587
SMTP_USER=apikey                   # SendGrid: 'apikey', SES: access key
SMTP_PASS=<api_key_or_password>
SMTP_FROM=noreply@noleggiosumisura.it
```

**Opzioni consigliate:**
- **AWS SES**: integrato con stack AWS, costo ~$0.10/1000 email, richiede domain verification
- **SendGrid**: affidabile, dashboard analytics, buon SLA
- **Brevo** (ex Sendinblue): gia usato da Smartcom per marketing

### 2.5 PEC certificata

Il template prevede l'invio di comunicazioni PEC per le notifiche formali (solleciti, conferme restituzione). In dev queste passano via SMTP normale.

**Integrazione PEC:**
1. Configurare casella PEC dedicata (es. `eol@pec.smartcomsolutions.it`)
2. Il provider PEC usa lo stesso `SmtpEmailProvider` con credenziali PEC:
   ```
   PEC_SMTP_HOST=smtps.pec.aruba.it
   PEC_SMTP_PORT=465
   PEC_SMTP_USER=eol@pec.smartcomsolutions.it
   PEC_SMTP_PASS=<password>
   ```
3. Nel servizio email, il canale PEC viene selezionato in base al tipo di comunicazione

### 2.6 SMS gateway

Il template prevede l'invio di OTP via SMS. In dev viene loggato in console.

**Opzioni:**
- **AWS SNS**: integrato con stack AWS, copertura globale
- **Twilio**: API semplice, ottimo per OTP, servizio Verify dedicato
- **Vonage**: alternativa europea, buona copertura Italia

**Implementazione:** creare `SmsProvider` con metodo `sendSms(to, message)` e configurare:
```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_FROM_NUMBER=+39...
```

---

## 3. Migrazione database

**Da:** SQLite (file locale, usato per prototipo)
**A:** PostgreSQL su AWS RDS

### 3.1 Modifiche allo schema Prisma

In `backend/prisma/schema.prisma`, cambiare il provider:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3.2 Tipi da adattare

| Campo | SQLite | PostgreSQL |
|---|---|---|
| `Decimal` | Stringa | `@db.Decimal(12,2)` nativo |
| `DateTime` | Stringa ISO | `@db.Timestamptz` |
| JSON fields (`beni_json`, `dati_json`) | String | `@db.JsonB` (consigliato) |
| Boolean | Integer 0/1 | Boolean nativo |

### 3.3 Indici da aggiungere

```prisma
@@index([stato, data_scadenza])           // su Contratto_EOL — query principali
@@index([contratto_eol_id, timestamp])     // su Audit_Event — query catena
@@index([contratto_eol_id, stato])         // su Pagamento
@@index([assegnato_a_id, stato])           // su Task_Escalation
@@index([piva])                            // su Cliente — riconciliazione
```

### 3.4 Procedura di migrazione

1. `DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/nsm_eol`
2. `npx prisma migrate dev --name pg-migration`
3. Verificare che tutte le query Prisma funzionino (i tipi Decimal e DateTime si comportano diversamente)
4. Importare dati di test con `npm run db:seed`

---

## 4. Autenticazione produttiva

**Stato attuale:** passport-local con bcrypt su tabella `Utente_NSM`. Token JWT per area cliente.

### Opzioni per produzione

**Opzione A — SSO con Active Directory (SAML/OIDC)**
- Gli operatori NSM si autenticano via AD aziendale
- Installare `passport-saml` o `passport-openidconnect`
- Mappare i gruppi AD ai ruoli NSM (ADMIN, BACKOFFICE_INTERNO, AGENTE, ecc.)

**Opzione B — Auth0 / AWS Cognito**
- Delegare autenticazione a servizio gestito
- Auth0: piu flessibile, supporta MFA out-of-the-box
- Cognito: integrato con stack AWS, costo inferiore

**Opzione C — Mantenere passport-local con hardening**
- Aggiungere rate limiting su login (`express-rate-limit`)
- Aggiungere MFA via TOTP (`speakeasy` + `qrcode`)
- Forzare rotazione password ogni 90 giorni
- Aggiungere audit log per tentativi di accesso

**Raccomandazione:** Opzione A se Smartcom ha gia AD, altrimenti Opzione B con Cognito.

---

## 5. Integrazione con piattaforma NSM

Punti di integrazione critici con la piattaforma NSM esistente (`app.smartcomsolutions.it`):

### 5.1 Sincronizzazione contratti FLEX attivi

L'importazione Excel avviene manualmente. In produzione si puo automatizzare:
- **Cron job** che interroga il DB NSM per contratti FLEX con scadenza nei prossimi 150 giorni
- **Webhook** dal gestionale NSM quando un contratto FLEX si avvicina alla scadenza
- Il servizio di riconciliazione (`reconciliation.service.ts`) gestisce gia il matching automatico

### 5.2 Trigger rinnovo su piattaforma NSM

Quando il cliente sceglie "Rinnova", la decisione viene registrata nel template. L'agente assegnato deve poi avviare la stipula del nuovo contratto FLEX sulla piattaforma NSM. L'integrazione puo essere:
- Notifica email all'agente (gia implementata)
- API call verso NSM per pre-compilare la proposta di rinnovo
- Link diretto alla piattaforma NSM con parametri precompilati

### 5.3 Gestione utenti agenti

La tabella `Utente_NSM` contiene gli operatori. In produzione va sincronizzata con il sistema utenti NSM esistente, idealmente via SSO (vedi sezione 4).

---

## 6. Trasmissione lista riacquisti

A T-20 (20 giorni prima della scadenza), Smartcom deve trasmettere a Grenke la lista dei contratti per cui esercita il riacquisto.

**Funzionalita implementata:** la pagina "Export Grenke" del backoffice genera un file Excel con le pratiche `RIACQUISTO_PAGATO` nel periodo selezionato. Il file viene salvato in `backend/storage/grenke-exports/`.

**Modalita di trasmissione (da concordare con Grenke):**

| Modalita | Pro | Contro |
|---|---|---|
| SFTP su server Grenke | Standard B2B, automatizzabile | Richiede credenziali e VPN |
| Upload via portale web Grenke | Semplice, nessuna infrastruttura | Manuale, non automatizzabile |
| API REST Grenke | Completamente automatico | Dipende da disponibilita API |
| Email con allegato | Semplice, tracciabile via PEC | Non strutturato |

**Automazione consigliata:** cron job settimanale che genera il file Excel e lo invia via SFTP al server Grenke, con notifica email all'operatore di conferma.

---

## 7. Fatturazione elettronica (SDI)

Il template **non genera fatture fiscali**. Il PDF prodotto alla conferma del pagamento e una **ricevuta di conferma pagamento** con disclaimer esplicito. La fattura elettronica deve essere emessa dall'ERP aziendale tramite SDI.

### 7.1 Architettura dell'integrazione

Quando `handlePaymentCallback` conferma un pagamento con esito positivo (stato `COMPLETATO`), il sistema deve notificare l'ERP per l'emissione automatica della fattura SDI:

1. Il template aggiorna lo stato del pagamento a `COMPLETATO` e genera la ricevuta
2. Un **evento** viene pubblicato verso l'ERP (webhook, coda messaggi, o API diretta)
3. L'ERP genera la fattura elettronica in formato XML FatturaPA
4. L'ERP trasmette la fattura al Sistema di Interscambio (SDI)
5. L'ERP riceve la notifica di esito e opzionalmente aggiorna il template via callback

### 7.2 Punto di integrazione nel codice

Il punto di aggancio si trova in `backend/src/services/payment.service.ts`, funzione `handlePaymentCallback`, subito dopo la chiamata a `generaRicevutaPagamento`:

```typescript
// Dopo la generazione della ricevuta, notificare l'ERP
// await erpService.emettiFatturaSDI({
//   contratto_nsm_id: pagamento.contratto_eol.contratto_nsm_id,
//   contratto_grenke_id: pagamento.contratto_eol.contratto_grenke_id,
//   cliente_piva: pagamento.contratto_eol.cliente.piva,
//   importo_netto: pagamento.importo_netto,
//   importo_iva: pagamento.importo_iva,
//   importo_totale: pagamento.importo_totale,
//   riferimento_pagamento: pagamento.riferimento_transazione,
// });
```

### 7.3 Dati necessari per la fattura SDI

| Campo FatturaPA | Sorgente nel template |
|---|---|
| CedentePrestatore | Dati Smartcom (fissi in configurazione) |
| CessionarioCommittente | `cliente.ragione_sociale`, `cliente.piva`, `cliente.indirizzo_sede` |
| ImportoTotaleDocumento | `pagamento.importo_totale` |
| ImponibileImporto | `pagamento.importo_netto` |
| Imposta | `pagamento.importo_iva` |
| AliquotaIVA | 22.00 |
| DatiBeniServizi | Beni da `contratto.beni_json` |
| CausalePagamento | Riacquisto beni contratto {contratto_nsm_id} |

### 7.4 Opzioni di integrazione

- **API diretta ERP**: REST/SOAP sincrona dopo il pagamento. Semplice ma accoppiata.
- **Coda messaggi (SQS/RabbitMQ)**: pubblica evento `PAGAMENTO_COMPLETATO`, l'ERP lo consuma. Disaccoppiata.
- **Webhook**: endpoint configurabile dell'ERP. Buon compromesso.

### 7.5 Fattura di saldo

La fattura di saldo (al trasferimento di proprieta, T+11 dalla scadenza Grenke) e interamente gestita dall'ERP. Il template non interviene.

---

## 8. Conservazione a norma

I documenti firmati (verbali di restituzione, conferme di riacquisto, ricevute di pagamento) devono essere conservati per **10 anni minimo** in modalita **conservazione a norma** (DPCM 3/12/2013).

### Documenti da conservare

| Documento | Generato da | Path storage |
|---|---|---|
| Verbale restituzione (PDF firmato FEA) | `pdf.service.ts` | `storage/pdf/verbale_*.pdf` |
| Conferma rinnovo (PDF) | `pdf.service.ts` | `storage/pdf/conferma_rinnovo_*.pdf` |
| Ricevuta pagamento (PDF) | `pdf.service.ts` | `storage/pdf/ricevuta_*.pdf` |
| Audit log export (PDF) | `pdf.service.ts` | `storage/pdf/audit_*.pdf` |
| Export lista Grenke (Excel) | `grenke-export.service.ts` | `storage/grenke-exports/*.xlsx` |

### Provider valutabili

| Provider | Certificazione | Note |
|---|---|---|
| Notartel | AgID accreditato | Standard per notai, costi elevati |
| Aruba Conservazione | AgID accreditato | Economico, API REST disponibili |
| InfoCert LegalDoc | AgID accreditato | Leader di mercato, buona integrazione |

### Implementazione

1. Dopo la generazione di ogni documento, inviarlo al servizio di conservazione via API
2. Salvare il riferimento (ID conservazione, hash, timestamp) nel database
3. Implementare un job periodico per verificare lo stato di conservazione

---

## 9. Deploy su AWS

### Architettura consigliata

```
                        ┌─────────────────┐
                        │   CloudFront    │
                        │   (CDN + SSL)   │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────┴─────┐           ┌───────┴───────┐
              │  S3 bucket │           │  ALB          │
              │  (frontend)│           │  (backend)    │
              └───────────┘           └───────┬───────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │  ECS Fargate      │
                                    │  (Node.js backend)│
                                    └─────────┬─────────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │  RDS PostgreSQL   │
                                    │  (Multi-AZ)       │
                                    └───────────────────┘
```

### Opzioni compute

| Opzione | Pro | Contro |
|---|---|---|
| **ECS Fargate** (consigliato) | Serverless containers, auto-scaling, no server management | Costi piu alti di EC2 |
| Elastic Beanstalk | Deploy semplice, managed | Meno controllo, lock-in |
| EC2 + PM2 | Controllo totale, economico | Gestione manuale server |

### Passi di deploy

1. **Frontend:** `npm run build --workspace=frontend` → upload `dist/` su S3 → serve via CloudFront
2. **Backend:** Dockerfile → push su ECR → deploy su ECS Fargate
3. **Database:** RDS PostgreSQL Multi-AZ con backup automatici
4. **Storage PDF:** S3 bucket dedicato (non piu filesystem locale)
5. **Variabili d'ambiente:** AWS Secrets Manager o SSM Parameter Store
6. **HTTPS:** certificato ACM su CloudFront e ALB

### Variabili d'ambiente produzione

```
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/nsm_eol
JWT_SECRET=<secret-da-Secrets-Manager>
SESSION_SECRET=<secret-da-Secrets-Manager>
FRONTEND_URL=https://eol.smartcomsolutions.it
NODE_ENV=production
```

---

## 10. Monitoring e alerting

### CloudWatch

- **Metriche custom:** tasso non-silenzio giornaliero, pratiche in attesa > 7 giorni, pagamenti falliti
- **Log groups:** `/ecs/nsm-eol-backend` per log applicativi
- **Alarms:** CPU > 80%, errori 5xx > 10/min, coda scheduler non processata

### Error tracking

- **Sentry** (consigliato): integrazione Node.js + React, source maps, alerting Slack
- Alternativa: AWS X-Ray per tracing distribuito

### Dashboard KPI

La pagina Reportistica del backoffice fornisce gia i KPI principali. Per monitoring real-time:
- Grafana + CloudWatch Metrics come datasource
- Dashboard con: tasso non-silenzio, pratiche per stato, pagamenti giornalieri, tempo medio decisione

### Alerting

| Evento | Canale | Soglia |
|---|---|---|
| Scheduler fallito | Email + Slack | Qualsiasi errore |
| Pagamento fallito | Email operatore | Ogni occorrenza |
| Catena audit corrotta | Email admin | `verificaCatena.integra === false` |
| Pratiche silenzio imminente | Email giornaliera | T-35 senza decisione |

---

## 11. Checklist go-live

- [ ] Tutti i provider mock sostituiti con quelli reali (Fabrick, Stripe, FEA, SMS)
- [ ] SMTP configurato per produzione (SES o SendGrid)
- [ ] PEC configurata per comunicazioni formali
- [ ] Database migrato a PostgreSQL su RDS
- [ ] Indici di performance aggiunti
- [ ] Autenticazione produttiva implementata (SSO/Cognito)
- [ ] Storage PDF migrato da filesystem a S3
- [ ] Backup automatici RDS configurati (retention 30 giorni)
- [ ] Monitoring e alerting attivi (Sentry + CloudWatch)
- [ ] Test di carico superati (1000 pratiche EOL in parallelo)
- [ ] Audit log: integrita catena verificata
- [ ] Integrazione fatturazione elettronica SDI con ERP aziendale
- [ ] Conservazione a norma attiva (Aruba/InfoCert)
- [ ] DPO informato e procedura GDPR validata
- [ ] Documentazione utente per team operativo NSM
- [ ] Formazione del team operativo completata
- [ ] DNS configurato (`eol.smartcomsolutions.it`)
- [ ] Certificato SSL attivo
- [ ] Variabili d'ambiente in Secrets Manager

---

> **Per dettagli implementativi**, vedi `SPECS.md` sezione 8 e `docs/api-reference.md`.
