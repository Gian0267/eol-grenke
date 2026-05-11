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
7. [Conservazione a norma dei documenti](#7-conservazione-a-norma)
8. [Deploy su AWS](#8-deploy-su-aws)
9. [Monitoring e alerting](#9-monitoring-e-alerting)
10. [Checklist go-live](#10-checklist-go-live)

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

## 7. Conservazione a norma

I documenti firmati (verbali di restituzione, conferme di riacquisto, fatture) devono essere conservati per **10 anni minimo** in modalità **conservazione a norma** (DPCM 3/12/2013).

**Provider valutabili:**
- Notartel
- Aruba Conservazione
- InfoCert LegalDoc

[DA POPOLARE]

---

## 8. Deploy su AWS

[DA POPOLARE — opzioni: ECS/Fargate, Elastic Beanstalk, Lambda+API Gateway]

---

## 9. Monitoring e alerting

[DA POPOLARE — CloudWatch, Sentry per error tracking, dashboard KPI in tempo reale]

---

## 10. Checklist go-live

- [ ] Tutti i provider mock sostituiti con quelli reali
- [ ] Database migrato a PostgreSQL su RDS
- [ ] Autenticazione produttiva implementata
- [ ] Backup automatici configurati
- [ ] Monitoring e alerting attivi
- [ ] Test di carico superati (es. 1000 pratiche EOL gestite in parallelo)
- [ ] Audit log integrità verificata
- [ ] Conservazione a norma attiva
- [ ] DPO interno informato e procedura GDPR validata
- [ ] Documentazione utente per il team operativo NSM
- [ ] Formazione del team operativo completata

---

> **Per ulteriori dettagli implementativi**, vedi `SPECS.md` sezione 8.3 e `MISSIONS.md` missione 10.
