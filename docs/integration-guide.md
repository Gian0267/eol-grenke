# Guida all'integrazione in produzione

> **Stato:** placeholder — questo documento verrà completato nella **Missione 10**.
> Contiene già la struttura e le sezioni che verranno popolate.

Questa guida è destinata al **team di sviluppo Smartcom** che integrerà il template nella piattaforma di produzione AWS (`app.smartcomsolutions.it`).

---

## Indice

1. [Panoramica dell'integrazione](#1-panoramica-dellintegrazione)
2. [Sostituzione dei provider mock](#2-sostituzione-dei-provider-mock)
   1. [Pagamenti — Fabrick](#21-pagamenti--fabrick)
   2. [Pagamenti — Stripe](#22-pagamenti--stripe)
   3. [Firma Elettronica Avanzata (FEA)](#23-firma-elettronica-avanzata-fea)
   4. [SMTP produttivo](#24-smtp-produttivo)
   5. [PEC certificata](#25-pec-certificata)
   6. [SMS gateway](#26-sms-gateway)
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

Il template è stato sviluppato seguendo il principio di **separazione delle interfacce**: tutti i punti di integrazione esterni sono mockati dietro interfacce TypeScript ben definite. La sostituzione con provider reali richiede:

1. Implementare le interfacce con le librerie/SDK reali
2. Configurare le variabili d'ambiente con le credenziali reali
3. Aggiornare la configurazione del feature flag `modalita_test = false`

[DA POPOLARE NELLA MISSIONE 10]

---

## 2. Sostituzione dei provider mock

### 2.1 Pagamenti — Fabrick

**Mock attuale:** `backend/src/providers/payment/fabrick.provider.ts`

**SDK ufficiale:** [link da inserire]

**Steps:**
1. Acquisire chiavi API (sandbox + produzione)
2. Configurare webhook endpoint per callback pagamenti
3. Implementare l'interfaccia `PaymentProvider` (vedi `types.ts`)

[DA POPOLARE]

### 2.2 Pagamenti — Stripe

[DA POPOLARE]

### 2.3 Firma Elettronica Avanzata (FEA)

**Provider valutati:**
- Namirial (eIDAS qualificato)
- InfoCert (eIDAS qualificato)
- Aruba (eIDAS qualificato)

**Criterio di scelta:** dipende da contratti commerciali esistenti di Smartcom.

[DA POPOLARE]

### 2.4 SMTP produttivo

**Mock attuale:** Mailpit locale

**Opzioni:**
- SendGrid (più diffuso, buon SLA)
- AWS SES (integrato con stack AWS, costo basso)
- Brevo (ex Sendinblue, già usato da Smartcom per altre comunicazioni)

[DA POPOLARE]

### 2.5 PEC certificata

[DA POPOLARE]

### 2.6 SMS gateway

[DA POPOLARE]

---

## 3. Migrazione database

[DA POPOLARE — note su tipi JSON, casing PostgreSQL, indici da aggiungere, ecc.]

---

## 4. Autenticazione produttiva

[DA POPOLARE — opzioni: Active Directory via SAML, Auth0, soluzione custom]

---

## 5. Integrazione con piattaforma NSM

Punti di integrazione critici:

- Sincronizzazione dei contratti FLEX attivi (per riconciliazione automatica)
- Trigger del flusso di stipula nuovo contratto FLEX (quando cliente sceglie "Rinnova")
- Gestione utenti agenti (SSO + ruoli condivisi)

[DA POPOLARE]

---

## 6. Trasmissione lista riacquisti

A T-20 Smartcom deve trasmettere a Grenke il file Excel con la lista contratti per cui esercita il riacquisto.

**Modalità da concordare con Grenke:**
- SFTP su server Grenke?
- Upload via portale web?
- API REST?

[DA POPOLARE]

---

## 7. Fatturazione elettronica (SDI)

Il template **non genera fatture fiscali**. Il PDF prodotto alla conferma del pagamento e' una **ricevuta di conferma pagamento** con disclaimer esplicito. La fattura elettronica deve essere emessa dall'ERP aziendale tramite SDI.

### 7.1 Architettura dell'integrazione

Quando `handlePaymentCallback` conferma un pagamento con esito positivo (stato `COMPLETATO`), il sistema deve notificare l'ERP per l'emissione automatica della fattura SDI. Il flusso e':

1. Il template aggiorna lo stato del pagamento a `COMPLETATO` e genera la ricevuta di conferma
2. Un **evento** viene pubblicato (webhook, coda messaggi, o chiamata API diretta) verso l'ERP
3. L'ERP genera la fattura elettronica in formato XML FatturaPA
4. L'ERP trasmette la fattura al Sistema di Interscambio (SDI)
5. L'ERP riceve la notifica di esito da SDI e (opzionalmente) aggiorna il template via callback

### 7.2 Punto di integrazione nel codice

Il punto di aggancio si trova in `backend/src/services/payment.service.ts`, funzione `handlePaymentCallback`, subito dopo la chiamata a `generaRicevutaPagamento`:

```typescript
// Dopo la generazione della ricevuta, notificare l'ERP
// await erpService.emettiFatturaSDI({
//   contratto_nsm_id: pagamento.contratto_eol.contratto_nsm_id,
//   contratto_grenke_id: pagamento.contratto_eol.contratto_grenke_id,
//   cliente_piva: pagamento.contratto_eol.cliente.piva,
//   cliente_ragione_sociale: pagamento.contratto_eol.cliente.ragione_sociale,
//   importo_netto: pagamento.importo_netto,
//   importo_iva: pagamento.importo_iva,
//   importo_totale: pagamento.importo_totale,
//   natura: 'ACCONTO',
//   riferimento_pagamento: pagamento.riferimento_transazione,
//   data_pagamento: pagamento.data_completato,
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
| Natura | Art. 6 DPR 633/72 (acconto) |
| DatiBeniServizi | Beni da `contratto.beni_json` |
| CausalePagamento | Riacquisto beni contratto {contratto_nsm_id} |

### 7.4 Opzioni di integrazione

- **API diretta ERP**: chiamata REST/SOAP sincrona dopo il pagamento. Semplice ma accoppiata.
- **Coda messaggi (SQS/RabbitMQ)**: il template pubblica un evento `PAGAMENTO_COMPLETATO`, l'ERP lo consuma. Disaccoppiata e resiliente.
- **Webhook**: il template chiama un endpoint configurabile dell'ERP. Buon compromesso.

### 7.5 Fattura di saldo

La fattura di saldo (al trasferimento di proprieta, T+11 dalla scadenza Grenke) e' interamente gestita dall'ERP. Il template non interviene. L'ERP dovra monitorare le date di scadenza dei contratti con stato `RIACQUISTO_PAGATO` e generare autonomamente la fattura di saldo alla data corretta.

---

## 8. Conservazione a norma

I documenti firmati (verbali di restituzione, conferme di riacquisto, fatture) devono essere conservati per **10 anni minimo** in modalità **conservazione a norma** (DPCM 3/12/2013).

**Provider valutabili:**
- Notartel
- Aruba Conservazione
- InfoCert LegalDoc

[DA POPOLARE]

---

## 9. Deploy su AWS

[DA POPOLARE — opzioni: ECS/Fargate, Elastic Beanstalk, Lambda+API Gateway]

---

## 10. Monitoring e alerting

[DA POPOLARE — CloudWatch, Sentry per error tracking, dashboard KPI in tempo reale]

---

## 11. Checklist go-live

- [ ] Tutti i provider mock sostituiti con quelli reali
- [ ] Database migrato a PostgreSQL su RDS
- [ ] Autenticazione produttiva implementata
- [ ] Backup automatici configurati
- [ ] Monitoring e alerting attivi
- [ ] Test di carico superati (es. 1000 pratiche EOL gestite in parallelo)
- [ ] Audit log integrità verificata
- [ ] Integrazione fatturazione elettronica SDI con ERP aziendale
- [ ] Conservazione a norma attiva
- [ ] DPO interno informato e procedura GDPR validata
- [ ] Documentazione utente per il team operativo NSM
- [ ] Formazione del team operativo completata

---

> **Per ulteriori dettagli implementativi**, vedi `SPECS.md` sezione 8.3 e `MISSIONS.md` missione 10.
