# Decisioni architetturali — NSM EOL Grenke

> Documento "vivo" da popolare **durante lo sviluppo** con le decisioni di design prese e le relative motivazioni. Ogni decisione segue il formato ADR semplificato (Architecture Decision Record).
>
> **Quando aggiornare:** ogni volta che si prende una decisione architetturale non banale o si sceglie tra alternative significative.

---

## Indice

1. [Stack tecnologico](#1-stack-tecnologico)
2. [Schema database](#2-schema-database)
3. [Riconciliazione automatica](#3-riconciliazione-automatica)
4. [Audit log con catena di hash](#4-audit-log-con-catena-di-hash)
5. [Token JWT per area cliente](#5-token-jwt-per-area-cliente)
6. [Gestione del silenzio cliente](#6-gestione-del-silenzio-cliente)
7. [Calcolo gift card](#7-calcolo-gift-card)
8. [Inquadramento privacy](#8-inquadramento-privacy)
9. [Note di hardening pre-consegna](#9-note-di-hardening-pre-consegna-review-security)

> Aggiungi nuove voci numerate progressivamente. Le voci qui sotto sono pre-popolate con le decisioni prese durante la stesura di SPECS.md v1.1.

---

## 1. Stack tecnologico

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Backend Node.js + Express + Prisma + TypeScript. Frontend React + Vite + TypeScript + Tailwind + shadcn/ui. Database SQLite per prototipo, PostgreSQL per produzione.

### Contesto

Il template deve essere consegnato a un team di sviluppo che lavorerà su AWS. Deve essere facilmente leggibile, basato su tecnologie diffuse, e con pochi punti di frizione tra prototipo e produzione.

### Alternative considerate

- **Backend Python (FastAPI/Django)**: rifiutato perché il team Smartcom lavora prevalentemente su stack JavaScript
- **Database PostgreSQL anche in prototipo**: rifiutato per ridurre la complessità del setup locale; Prisma gestisce la migrazione tra SQLite e PostgreSQL in modo quasi trasparente
- **Next.js**: rifiutato per separare nettamente backend e frontend (più chiaro per il team finale)

### Conseguenze

- ✅ Setup locale rapido (no docker per il DB)
- ✅ Tipizzazione end-to-end con TypeScript
- ✅ Stack mainstream e ben documentato
- ⚠️ Migrazione SQLite → PostgreSQL richiede attenzione a alcuni tipi (es. JSON, casing)

---

## 2. Schema database

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Schema relazionale normalizzato con 8 entità principali (Contratto_EOL, Cliente, Decisione_Cliente, Pagamento, Comunicazione, Richiesta_Contatto, Audit_Event, Utente_NSM). Vedi SPECS.md sezione 4.

### Contesto

Servono entità che rispecchino il workflow EOL Grenke. Ogni Contratto_EOL ha sia un `contratto_nsm_id` (numerazione interna NSM, già esistente in piattaforma) sia un `contratto_grenke_id` (numero contratto Grenke).

### Conseguenze

- ✅ Riconciliazione automatica al 100% in fase di importazione (vedi decisione 3)
- ✅ Schema chiaro e facilmente comprensibile
- ⚠️ JSON in `beni_json` non è completamente queryable in SQLite: per query strutturate in produzione, valutare una tabella `Bene` separata

---

## 3. Riconciliazione automatica

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Riconciliazione automatica al 100% del file Excel Grenke usando il `contratto_grenke_id` come chiave di lookup nel DB NSM. Gli outlier (contratti non trovati) vengono gestiti manualmente dal team BACKOFFICE_INTERNO.

### Contesto

La piattaforma NSM esistente già contiene per ogni contratto FLEX attivo sia il `contratto_nsm_id` che il `contratto_grenke_id`. Questo rende il matching automatico banale.

### Alternative considerate

- **Matching fuzzy su ragione sociale + P.IVA**: tenuto come fallback per gli outlier
- **Richiesta manuale di matching per ogni contratto**: troppo oneroso operativamente

### Conseguenze

- ✅ Importazione completamente automatizzata per il caso comune
- ✅ Pochi outlier da gestire manualmente (casi rari di disallineamento DB)
- ⚠️ Richiede che il `contratto_grenke_id` sia sempre presente e corretto in piattaforma NSM

---

## 4. Audit log con catena di hash

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Ogni evento significativo è registrato in `Audit_Event` con `hash_corrente = SHA-256(timestamp + attore + azione + JSON(dati) + hash_precedente)`. Il primo evento di una pratica ha `hash_precedente = "GENESIS"`.

### Contesto

Per dimostrare l'integrità della sequenza degli eventi in eventuali contestazioni legali, è necessario un meccanismo crittografico di tamper-evidence. Un blockchain completo sarebbe sproporzionato; una catena di hash locale è sufficiente.

### Conseguenze

- ✅ Verifica integrità calcolabile in qualsiasi momento (ricalcolando gli hash)
- ✅ Manomissione di un evento "rompe" la catena dagli eventi successivi in poi
- ⚠️ Non protegge da manomissione completa del DB (per quello serve external timestamping o conservazione a norma)

### Note implementative

Il salvataggio dell'audit event NON deve mai bloccare un'operazione di business: graceful degradation con log a parte se la scrittura fallisce.

---

## 5. Token JWT per area cliente

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Il cliente accede all'area self-service tramite un **link univoco con token JWT** firmato. Nessuna autenticazione tradizionale (no username/password).

### Contesto

I clienti Conduttori sono utenti occasionali (1-2 accessi nell'arco di mesi). Imporre la creazione di un account ridurrebbe drasticamente il tasso di conversione (KPI #1 = tasso di non-silenzio).

### Conseguenze

- ✅ UX semplificata: link in email → click → si entra
- ✅ Conversione massimizzata
- ⚠️ Se il cliente inoltra il link a qualcun altro, quella persona può accedere: mitigato dal fatto che il token è valido solo per quella specifica pratica e contiene comunque OTP per le decisioni vincolanti

### Note implementative

- Token scade automaticamente 30 giorni prima della data_scadenza del contratto
- Le decisioni vincolanti (riacquisto, restituzione, rinnovo) richiedono comunque **OTP FES** come secondo fattore

---

## 6. Gestione del silenzio cliente

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Il silenzio cliente a T-30 è uno **stato terminale negativo** (`SILENZIO_PERDITA_DEFINITIVA`): il contratto va in proroga Grenke 6 mesi e Smartcom è disintermediata definitivamente. Per ridurre il rischio, escalation telefonica manuale a T-50, T-40, T-35.

### Contesto

Per come è strutturato l'Accordo Remarketing Grenke-Smartcom, dopo la proroga di 6 mesi il contratto **non torna in scadenza**: Smartcom perde definitivamente l'opportunità commerciale. Questo rende il KPI #1 (tasso di non-silenzio) la metrica strategica principale.

### Conseguenze

- ✅ Sistema di prevenzione robusto: 4 solleciti email + 3 escalation telefoniche
- ✅ KPI chiaro su cui ottimizzare
- ⚠️ Costo operativo non trascurabile (tempo agenti per chiamate)

### Note implementative

- Solleciti email automatici a T-90, T-60, T-45, T-35
- Task escalation telefonica creato automaticamente a T-50, T-40, T-35
- Capo Area coinvolto a T-35 solo per contratti con monte_canoni ≥ 5.000 €

---

## 7. Calcolo gift card

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Gift card Smartcom Solutions di valore **dinamico**, calcolato come arrotondamento per difetto al taglio standard più vicino del margine lordo del vecchio contratto. Tagli: 25, 50, 75, 100, 125, 150, 200, 250, 300 €.

### Contesto

Una gift card a valore fisso (es. sempre 50€) sarebbe semplice ma poco efficiente: penalizzerebbe i clienti grandi (che hanno margine alto) e renderebbe insostenibili quelli piccoli. Un calcolo dinamico al margine lordo è equo e sostenibile.

### Alternative considerate

- **Gift card a valore fisso 50€**: rifiutata (vedi sopra)
- **Gift card pari al 100% del margine lordo**: rifiutata, azzera il margine
- **Gift card pari al 50% del margine lordo**: rifiutata, complica la comunicazione (valori "strani" come 37,80€)

### Conseguenze

- ✅ Comunicazione semplice: tagli standard arrotondati per difetto
- ✅ Sostenibilità garantita: la gift card è sempre ≤ margine lordo
- ✅ Incentivo proporzionale al valore del contratto

---

## 8. Inquadramento privacy

**Data decisione:** maggio 2026
**Stato:** ✅ Approvata

### Decisione

Tutte le comunicazioni del flusso EOL (email, PEC, SMS, chiamate) sono classificate come **comunicazioni contrattuali** ai sensi dell'art. 6.1.b GDPR. Non serve consenso marketing.

### Contesto

L'esercizio di Grenke nella Lettera di scadenza presenta Smartcom come "partner autorizzato": il cliente è preavvisato e consapevole. La gestione del fine contratto è parte integrante dell'esecuzione contrattuale.

### Conseguenze

- ✅ Sistema utilizzabile per tutti i clienti EOL senza opt-in marketing preventivo
- ⚠️ **Limiti rigidi**: il sistema NON può essere usato per promuovere prodotti diversi dal rinnovo del contratto in scadenza
- ⚠️ Lo script di chiamata escalation deve concentrarsi **esclusivamente** sulle opzioni di fine contratto

### Misure di sicurezza implementate

- Diritto di opt-out in ogni email
- Data minimization dopo 24 mesi dalla chiusura pratica
- Audit log degli accessi degli operatori NSM
- Script telefonici standardizzati (no derive commerciali)

---

## 9. Note di hardening pre-consegna (review security)

**Data decisione:** maggio 2026
**Stato:** ✅ Documentata

### Decisione

Elenco degli item segnalati in review ma non fixati ora perché dipendono da contesto di produzione o volumi reali.

### Item da risolvere in produzione

**C1 — CORS whitelist**: in `index.ts` CORS è configurato con `origin: true` (qualsiasi origine). In produzione va sostituito con una whitelist esplicita contenente l'URL del frontend di produzione. Non fixato ora perché l'URL di produzione non è ancora noto.

**M4 — Tipizzazione `req.user`**: diversi file usano `(req.user as any)` per accedere ai campi utente. Da sistemare quando il team tipizza correttamente `req.user` con il proprio sistema di autenticazione (dichiarazione dei tipi Express/Passport).

**M7 — Query N+1 in batch**: l'invio comunicazioni batch (`invia-comunicazione-batch`) e altre operazioni iterative eseguono query sequenziali. Da ottimizzare con `Promise.all()` in produzione quando i volumi lo richiedono.

**M8 — `findMany` senza limiti**: diverse query `findMany` (lista pratiche, agenti, outlier) non hanno `take`/`skip`. Da aggiungere paginazione DB-side quando i volumi lo richiedono.

**M9 — GDPR Art. 17 (diritto alla cancellazione)**: la cancellazione selettiva dei dati personali è incompatibile con la catena hash dell'audit log (decisione §4). La soluzione in produzione è **anonimizzare** i dati personali mantenendo gli hash intatti: sostituire nome, email, P.IVA con placeholder tipo `[CANCELLATO]` senza rompere la catena di hash.

---

## Template per nuove decisioni

Quando aggiungi una nuova decisione, usa questo template:

```markdown
## N. [Titolo della decisione]

**Data decisione:** [data]
**Stato:** [Proposta | Approvata | Sostituita da #X | Deprecated]

### Decisione

[Cosa è stato deciso, in 1-2 frasi]

### Contesto

[Perché serviva prendere questa decisione, quale problema risolve]

### Alternative considerate

- **[Alternativa A]**: [perché scartata]
- **[Alternativa B]**: [perché scartata]

### Conseguenze

- ✅ [Conseguenza positiva]
- ⚠️ [Trade-off o rischio]

### Note implementative

[Eventuali dettagli tecnici utili]
```
