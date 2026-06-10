# NSM EOL Grenke — Specifica Funzionale del Template

**Versione:** 1.1
**Data:** 11 maggio 2026
**Autore:** Gian Luca Ciardo — Smartcom Solutions Srl
**Destinatari:** Sviluppatori della piattaforma app.smartcomsolutions.it

**Changelog v1.1 rispetto a v1.0:**
- Aggiunto campo `contratto_nsm_id` con riconciliazione automatica all'importazione
- Aggiunto ruolo `BACKOFFICE_INTERNO`
- Riscritta sezione "Silenzio cliente": stato terminale di perdita definitiva
- Modificata logica gift card: a carico Smartcom Solutions, valore dinamico arrotondato a taglio standard
- Integrato widget "Chiamami" globale + step intermedio prima del pagamento
- Aggiunta escalation manuale telefonica a T-50/T-40/T-35
- Nuova sezione KPI strategici con tasso di non-silenzio come KPI #1
- Potenziata sezione Privacy con inquadramento normativo comunicazioni contrattuali

---

## 1. Visione e obiettivi

### 1.1 Contesto di business

Smartcom Solutions Srl, attraverso il brand Noleggio Su Misura (NSM), gestisce contratti di locazione operativa FLEX con il partner finanziario Grenke Italia S.p.A. Alla scadenza dei contratti FLEX, Smartcom — in forza dell'Accordo Remarketing sottoscritto con Grenke — è il soggetto autorizzato a gestire la fase di fine contratto con il cliente Conduttore.

Il presente template descrive il workflow operativo digitale che Smartcom utilizzerà per gestire la fase di fine noleggio dei contratti FLEX Grenke, in modo automatizzato, scalabile e tracciabile.

### 1.2 Obiettivi del template

1. **Prevenire il silenzio cliente** — Il silenzio porta alla proroga automatica Grenke di 6 mesi, dopo la quale Smartcom è disintermediata definitivamente. Ogni cliente silente è una perdita irreversibile.
2. **Massimizzare il rinnovo** — Convertire il cliente in fase EOL in cliente di un nuovo contratto FLEX, attraverso un incentivo concreto (gift card Smartcom Solutions).
3. **Self-service del riacquisto** — Permettere al cliente di riacquistare il bene attuale in autonomia, con pagamento integrato in piattaforma.
4. **Tracciabilità completa** — Documentare ogni interazione cliente con valore probatorio sufficiente a sostenere eventuali contestazioni.
5. **Efficienza operativa** — Ridurre al minimo l'intervento manuale del team NSM nella gestione di routine, concentrando l'effort sui casi complessi e a rischio.

### 1.3 Scope del template

**Incluso nello scope:**
- Importazione lista contratti in scadenza da file Excel Grenke con riconciliazione automatica con la piattaforma NSM
- Generazione e invio comunicazioni email personalizzate ai clienti
- Area cliente self-service con 4 opzioni (rinnovo, riacquisto, contatto, restituzione)
- Widget "Chiamami" globale per richiesta di contatto pre-decisione
- Solleciti automatici via email + escalation manuale telefonica nei momenti critici
- Backoffice NSM per monitoraggio pratiche e estrazione lista riacquisti per Grenke
- Audit trail completo di ogni interazione
- Mock dei pagamenti (Fabrick e Stripe) e della firma elettronica avanzata (FEA)

**Escluso dallo scope (da implementare dagli sviluppatori in produzione):**
- Integrazione reale con API Fabrick (open banking)
- Integrazione reale con API Stripe (carte di credito)
- Integrazione reale con provider FEA certificato eIDAS
- Integrazione SMTP/PEC produttiva
- Migrazione su database AWS (PostgreSQL/MySQL)
- Sistema di autenticazione produttivo (SSO, MFA)
- Conservazione a norma documenti firmati

### 1.4 KPI strategici del flusso EOL

Considerato che il silenzio cliente comporta perdita definitiva (vedi sezione 5.6), i KPI del workflow EOL sono ordinati per priorità strategica:

| # | KPI | Definizione | Target |
|---|---|---|---|
| 1 | **Tasso di non-silenzio** | % clienti che prendono almeno una decisione (qualsiasi delle 4 opzioni) entro T-30 | **> 85%** |
| 2 | **Tasso di rinnovo** | % clienti che scelgono "Rinnova con nuovo FLEX" sul totale dei decisori | > 35% |
| 3 | **Tasso di riacquisto** | % clienti che scelgono "Acquista il bene" e completano il pagamento | > 30% |
| 4 | **Margine medio per pratica** | Margine generato (riacquisto) o premio fedeltà erogato (rinnovo) per pratica gestita | da monitorare |
| 5 | **Tempo medio decisione** | Giorni tra invio comunicazione iniziale e prima decisione del cliente | < 60 giorni |
| 6 | **Tasso di intervento manuale** | % pratiche dove è servita escalation telefonica per ottenere una decisione | da monitorare |

Il KPI #1 è il **numero da guardare ogni settimana** in fase di rollout: ogni 1% di silenzio in più è perdita irreversibile.

---

## 2. Glossario

| Termine | Definizione |
|---|---|
| **EOL** | End Of Lease — fase di fine contratto di locazione operativa |
| **Contratto Grenke** | Contratto di locazione operativa stipulato tra Grenke (locatore) e Cliente (conduttore) |
| **Pratica EOL** | Entità interna NSM che traccia la gestione di un singolo contratto Grenke in fase di fine noleggio |
| **Conduttore** | Cliente finale del contratto Grenke |
| **Monte canoni** | Somma dei canoni del contratto Grenke (canone mensile × numero mesi durata) |
| **Pricing riacquisto** | Prezzo a cui Smartcom rivende il bene al Conduttore (8% del monte canoni) |
| **Pricing Grenke** | Prezzo a cui Smartcom acquista il bene da Grenke (5% del monte canoni) |
| **Margine lordo** | Differenza tra pricing riacquisto e pricing Grenke (3% del monte canoni) |
| **Lista riacquisti** | File trasmesso da Smartcom a Grenke a T-20 contenente i contratti per cui Smartcom esercita il riacquisto |
| **FEA** | Firma Elettronica Avanzata ex art. 26 eIDAS |
| **FES** | Firma Elettronica Semplice (es. OTP via SMS) |
| **Silenzio cliente** | Stato in cui il cliente non ha preso alcuna decisione entro T-30 → comporta proroga Grenke 6 mesi e perdita definitiva per NSM |

---

## 3. Timeline operativa del flusso

Il flusso operativo è scandito da date relative alla scadenza del contratto Grenke (T0).

| Evento | Data relativa | Soggetto |
|---|---|---|
| Grenke estrae lista contratti in scadenza nel trimestre | T-150 | Grenke |
| Grenke invia Lettera di scadenza al Conduttore | T-150 | Grenke |
| Grenke trasmette a Smartcom il "Dettaglio posizioni affidate" | T-150 | Grenke → NSM |
| NSM importa la lista in piattaforma (riconciliazione automatica) | T-145 | NSM |
| NSM invia comunicazione al Conduttore con 4 opzioni | T-145 | NSM → Cliente |
| Sollecito automatico email 1 | T-90 | NSM → Cliente |
| Sollecito automatico email 2 | T-60 | NSM → Cliente |
| **Escalation telefonica 1** (task agente assegnato) | T-50 | Agente → Cliente |
| Sollecito automatico email 3 | T-45 | NSM → Cliente |
| **Escalation telefonica 2** (secondo tentativo agente) | T-40 | Agente → Cliente |
| Sollecito automatico email 4 (ultimo) | T-35 | NSM → Cliente |
| **Escalation telefonica 3** (Capo Area per contratti >5.000€) | T-35 | Capo Area → Cliente |
| **Deadline decisione cliente** | **T-30** | Cliente |
| NSM consolida lista riacquisti | T-30 → T-20 | NSM |
| **Invio link pagamento riacquisto** (per chi ha deciso prima) | **T-7** | NSM → Cliente |
| NSM invia lista riacquisti a Grenke | T-20 | NSM → Grenke |
| Scadenza contratto Grenke | T0 | — |
| Termine consegna bene per restituzione (10 gg da scadenza) | T+10 | Cliente |
| Trasferimento automatico proprietà a Smartcom (Art. 5.7) | T+11 | — |
| Termine pagamento Smartcom a Grenke (30 gg da scadenza) | T+30 | NSM → Grenke |

**Nota:** la timeline è configurabile. I valori T-150, T-90, T-60, T-50, T-45, T-40, T-35, T-30, T-20, T-7 sono parametri modificabili tramite il file `config/timeline.json`.

---

## 4. Schema dati

### 4.1 Entità principali

#### Contratto_EOL

Rappresenta una pratica di fine noleggio. Ogni contratto Grenke in scadenza genera un Contratto_EOL.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | Chiave primaria |
| contratto_nsm_id | String | Numerazione interna NSM (riconciliata dalla piattaforma NSM al momento dell'importazione) |
| contratto_grenke_id | String | Numero contratto Grenke (importato da Excel) |
| cliente_id | UUID FK | Riferimento al Cliente |
| data_stipula | Date | Data di stipula del contratto Grenke |
| data_scadenza | Date | Data di scadenza del contratto Grenke (T0) |
| canone_mensile | Decimal(10,2) | Canone mensile del contratto |
| numero_mesi | Integer | Durata in mesi (12, 24, 36, 48) |
| monte_canoni | Decimal(10,2) | Calcolato: canone_mensile × numero_mesi |
| valore_originario | Decimal(10,2) | Valore di acquisto Grenke (se diverso dal monte canoni) |
| beni_json | JSON | Array di beni del contratto: `[{descrizione, seriale, marca, modello}]` |
| pricing_riacquisto | Decimal(10,2) | Calcolato: monte_canoni × 0.08 |
| pricing_grenke | Decimal(10,2) | Calcolato: monte_canoni × 0.05 |
| margine_lordo | Decimal(10,2) | Calcolato: pricing_riacquisto - pricing_grenke |
| valore_gift_card | Decimal(10,2) | Valore della gift card per rinnovo (arrotondamento per difetto del margine lordo al taglio standard) |
| stato | Enum | Vedi 4.2 |
| origine | Enum | "Smartcom" \| "IOL" |
| agente_originario_id | UUID FK | Agente che ha originato il contratto |
| agente_assegnato_id | UUID FK | Agente attualmente assegnato alla pratica EOL (default: agente_originario) |
| data_importazione | DateTime | Quando la pratica è stata creata |
| token_accesso_cliente | String | Token JWT per accesso area cliente |
| stato_riconciliazione | Enum | "RICONCILIATO_AUTO" \| "OUTLIER_DA_GESTIRE" \| "RICONCILIATO_MANUALE" |
| created_at | DateTime | |
| updated_at | DateTime | |

#### Cliente

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| ragione_sociale | String | |
| piva | String | P.IVA (formato 11 cifre) |
| codice_fiscale | String | |
| email | String | Email primaria |
| pec | String | PEC (può essere uguale a email) |
| telefono | String | |
| referente_nome | String | Nome del referente operativo |
| referente_email | String | Email del referente (può essere diversa da email aziendale) |
| referente_telefono | String | |
| indirizzo_sede | String | |
| cap | String | |
| citta | String | |
| provincia | String | |
| opt_out_comunicazioni | Boolean | Se true, il cliente ha esercitato il diritto di opposizione (no comunicazioni anche contrattuali oltre il minimo richiesto) |
| created_at | DateTime | |
| updated_at | DateTime | |

#### Decisione_Cliente

Tracciamento della decisione presa dal cliente nell'area self-service.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| contratto_eol_id | UUID FK | |
| opzione_scelta | Enum | "RINNOVO" \| "RIACQUISTO" \| "CONTATTO" \| "RESTITUZIONE" |
| data_decisione | DateTime | |
| ip_address | String | IP da cui è stata presa la decisione |
| user_agent | String | Browser/dispositivo |
| otp_verificato | Boolean | Se è stato verificato OTP |
| otp_metodo | Enum | "SMS" \| "EMAIL" |
| pdf_conferma_path | String | Path del PDF generato come conferma |
| hash_pdf | String | SHA-256 del PDF per verifica integrità |
| note_cliente | Text | Eventuali note inserite dal cliente |
| created_at | DateTime | |

#### Pagamento

Tracciamento dei pagamenti per riacquisti.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| contratto_eol_id | UUID FK | |
| importo_netto | Decimal(10,2) | |
| importo_iva | Decimal(10,2) | |
| importo_totale | Decimal(10,2) | |
| metodo | Enum | "FABRICK" \| "STRIPE" \| "BONIFICO_MANUALE" |
| stato | Enum | "INIZIATO" \| "COMPLETATO" \| "FALLITO" \| "RIMBORSATO" |
| riferimento_transazione | String | ID transazione provider |
| data_iniziato | DateTime | |
| data_completato | DateTime | |
| fattura_numero | String | Numero fattura emessa |
| fattura_path | String | Path PDF fattura |
| natura_giuridica | Enum | "ACCONTO" \| "SALDO" \| "CAPARRA_CONFIRMATORIA" |

#### Comunicazione

Tracciamento di tutte le comunicazioni inviate al cliente.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| contratto_eol_id | UUID FK | |
| tipo | Enum | "COMUNICAZIONE_INIZIALE" \| "SOLLECITO_EMAIL_1" \| "SOLLECITO_EMAIL_2" \| "SOLLECITO_EMAIL_3" \| "SOLLECITO_EMAIL_4" \| "ESCALATION_TELEFONICA_1" \| "ESCALATION_TELEFONICA_2" \| "ESCALATION_TELEFONICA_3" \| "CONFERMA_DECISIONE" \| "ISTRUZIONI_OPERATIVE" |
| canale | Enum | "EMAIL" \| "PEC" \| "SMS" \| "TELEFONO" |
| destinatario | String | Indirizzo effettivo del destinatario |
| oggetto | String | |
| corpo_html | Text | Per comunicazioni email; per telefono: note/script |
| esito_chiamata | Enum | Per canale TELEFONO: "RISPOSTA_POSITIVA" \| "RISPOSTA_NEGATIVA" \| "NON_RAGGIUNTO" \| "RICHIAMARE" |
| allegati_json | JSON | Array di allegati |
| data_invio | DateTime | |
| data_consegna | DateTime | Nullable, per PEC |
| data_apertura | DateTime | Tracking pixel |
| esito_invio | Enum | "INVIATO" \| "RECAPITATO" \| "ERRORE" \| "NON_RECAPITABILE" |
| operatore_id | UUID FK | Per escalation telefoniche: chi ha effettuato la chiamata |
| created_at | DateTime | |

#### Richiesta_Contatto

Richieste di ricontatto generate dal widget "Chiamami" o dalla scelta dell'opzione 3.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| contratto_eol_id | UUID FK | |
| origine | Enum | "WIDGET_CHIAMAMI" \| "STEP_PRE_PAGAMENTO" \| "OPZIONE_CONTATTO_PERSONALIZZATO" |
| nome_referente | String | |
| telefono | String | |
| giorno_preferito | String | |
| fascia_oraria | Enum | "MATTINA" \| "POMERIGGIO" \| "INDIFFERENTE" |
| modalita_preferita | Enum | "TELEFONO" \| "EMAIL" \| "VIDEOCALL" |
| note | Text | |
| agente_assegnato_id | UUID FK | |
| stato | Enum | "DA_RICHIAMARE" \| "RICHIAMATO" \| "NON_RAGGIUNTO" |
| data_richiamato | DateTime | Nullable |
| esito | Text | Sintesi della chiamata |
| pratica_sbloccata | Boolean | Per origine STEP_PRE_PAGAMENTO: se l'agente ha sbloccato il pagamento dopo la chiamata |
| created_at | DateTime | |

#### Audit_Event

Log strutturato per tracciabilità legale con catena di hash.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| contratto_eol_id | UUID FK | |
| timestamp | DateTime | |
| attore_tipo | Enum | "SISTEMA" \| "AGENTE_NSM" \| "CLIENTE" \| "GRENKE" \| "BACKOFFICE_INTERNO" |
| attore_id | String | ID dell'attore (può essere user_id, "system", etc.) |
| azione | String | Es: "PRATICA_CREATA", "EMAIL_INVIATA", "DECISIONE_RIACQUISTO", "PAGAMENTO_COMPLETATO", "RICHIESTA_CONTATTO_CREATA" |
| dati_json | JSON | Dati specifici dell'evento |
| hash_precedente | String | Hash dell'evento precedente nella catena |
| hash_corrente | String | SHA-256(timestamp + attore + azione + dati + hash_precedente) |

#### Utente_NSM

Utenti interni del backoffice.

| Campo | Tipo | Note |
|---|---|---|
| id | UUID | |
| nome | String | |
| cognome | String | |
| email | String | Unique |
| ruolo | Enum | "AGENTE" \| "JUNIOR_AGENT" \| "CAPO_AREA" \| "GROUP_MANAGER" \| "AGENZIA" \| "BACKOFFICE_INTERNO" \| "ADMIN" |
| attivo | Boolean | |
| created_at | DateTime | |

**Descrizione dei ruoli:**
- **AGENTE / JUNIOR_AGENT**: forza commerciale sul territorio, originaria dei contratti
- **CAPO_AREA / GROUP_MANAGER / AGENZIA**: livelli gerarchici della rete commerciale
- **BACKOFFICE_INTERNO**: team che si occupa della gestione amministrativa e operativa delle pratiche EOL (importazione liste, consolidamento lista riacquisti, gestione outlier riconciliazione, gestione casi complessi)
- **ADMIN**: amministratore della piattaforma con accesso completo

### 4.2 Stati della Pratica EOL

```
LISTA_RICEVUTA (importata da Excel, riconciliata)
  ↓
COMUNICAZIONE_INVIATA
  ↓
IN_ATTESA_DECISIONE
  ├→ DECISIONE_RINNOVO
  │    → Pratica assegnata ad agente per nuovo contratto FLEX
  │    → Gift card emessa al momento della firma del nuovo contratto
  │
  ├→ DECISIONE_RIACQUISTO_IN_CORSO (cliente ha scelto ma non ancora pagato)
  │    ├→ RIACQUISTO_PAGATO → IN_LISTA_RIACQUISTI (T-20)
  │    │    → SCADUTA_CONTRATTO (T0)
  │    │    → TRASFERIMENTO_PROPRIETA_AVVENUTO (T+11)
  │    │    → PAGAMENTO_GRENKE_EFFETTUATO (T+30)
  │    │    → CHIUSA_RIACQUISTO_COMPLETATO
  │    └→ RIACQUISTO_ABBANDONATO (cliente non completa pagamento entro deadline)
  │
  ├→ DECISIONE_CONTATTO (cliente ha chiesto contatto personalizzato)
  │    → Pratica assegnata ad agente
  │    → A seguito della chiamata: torna a IN_ATTESA_DECISIONE con esito aggiornato
  │
  └→ DECISIONE_RESTITUZIONE
       → Pratica chiusa con stato CHIUSA_RESTITUZIONE_CONFERMATA
       → Bene torna a Grenke secondo procedura standard

[STATO TERMINALE NEGATIVO]
SILENZIO_PERDITA_DEFINITIVA (T-30 senza decisione)
  → Contratto va in proroga automatica Grenke 6 mesi
  → Dopo 6 mesi il contratto non torna in scadenza
  → Smartcom è disintermediata definitivamente
  → Pratica chiusa, cliente perso
```

---

## 5. Regole di business

### 5.1 Calcolo pricing

```javascript
function calcolaPricing(canone_mensile, numero_mesi) {
  const monte_canoni = canone_mensile * numero_mesi;
  return {
    monte_canoni: round(monte_canoni, 2),
    pricing_grenke: round(monte_canoni * 0.05, 2),
    pricing_riacquisto: round(monte_canoni * 0.08, 2),
    margine_lordo: round(monte_canoni * 0.03, 2)
  };
}
```

### 5.2 Premio fedeltà rinnovo

Il cliente che sceglie "Rinnovo con nuovo contratto FLEX" e firma effettivamente il nuovo contratto riceve una **gift card Smartcom Solutions** spendibile sul catalogo Smartcom Distribution.

**Caratteristiche della gift card:**

- **A carico di:** Smartcom Solutions Srl
- **Valore:** dinamico, calcolato come **arrotondamento per difetto al taglio standard più vicino del margine lordo del vecchio contratto**

**Tagli standard:** 25€, 50€, 75€, 100€, 125€, 150€, 200€, 250€, 300€

**Esempi di calcolo:**

| Monte canoni | Margine lordo | Valore gift card |
|---|---|---|
| 1.500€ | 45,00€ | 25€ |
| 2.000€ | 60,00€ | 50€ |
| 2.520€ | 75,60€ | 75€ |
| 3.500€ | 105,00€ | 100€ |
| 5.000€ | 150,00€ | 150€ |
| 7.000€ | 210,00€ | 200€ |
| 10.000€ | 300,00€ | 300€ |

```javascript
function calcolaValoreGiftCard(margine_lordo) {
  const tagli = [25, 50, 75, 100, 125, 150, 200, 250, 300];
  let valore = 0;
  for (const taglio of tagli) {
    if (taglio <= margine_lordo) {
      valore = taglio;
    } else {
      break;
    }
  }
  return valore;
}
```

**Quando viene erogata:** alla firma del nuovo contratto FLEX (NON al momento della scelta dell'opzione rinnovo, per evitare frodi e tutelare Smartcom in caso di mancata finalizzazione).

**Come viene erogata:** email con codice univoco gift card e link al portale Smartcom Distribution.

**Validità:** 12 mesi dalla data di emissione (configurabile in `config/loyalty_program.json`).

### 5.3 Regole di assegnazione opzione "Contatto personalizzato"

Quando il cliente sceglie l'opzione 3 (contatto personalizzato) oppure usa il widget "Chiamami", la pratica/richiesta di contatto viene assegnata secondo questa logica:

```
1. Se agente_originario.attivo == true:
     assegna a agente_originario
   altrimenti:
     vai al passo 2

2. Se monte_canoni_contratto >= soglia_alto_valore (default: 5000€):
     assegna al Capo Area dell'agente_originario
   altrimenti:
     vai al passo 3

3. Assegna a "team_fine_noleggio" (utente di sistema con ruolo BACKOFFICE_INTERNO)
```

Le soglie e le regole sono configurabili in `config/assignment_rules.json`.

### 5.4 Regole multi-bene per contratto

Conformemente all'Accordo Remarketing Art. 5.1, **l'opzione scelta dal cliente si applica all'intero contratto** e ai beni che ne costituiscono oggetto, senza possibilità di scorporo. Esempio:

- Contratto con 3 MacBook Pro + 1 stampante
- Se cliente sceglie "Riacquisto" → riacquista tutti e 4 i beni al prezzo dell'8% del monte canoni totale
- Non può scegliere "Riacquisto" sui MacBook e "Restituzione" sulla stampante

### 5.5 Generazione del token di accesso area cliente

Per ogni Contratto_EOL viene generato un **token JWT** firmato che identifica univocamente la pratica e consente al cliente di accedere all'area dedicata senza autenticazione tradizionale.

```javascript
const token = jwt.sign(
  {
    contratto_eol_id: pratica.id,
    cliente_id: pratica.cliente_id,
    exp: dataScadenza - 30giorni
  },
  SECRET_KEY
);
```

Il link inviato al cliente avrà la forma:
```
https://eol.noleggiosumisura.it/pratica/{token}
```

### 5.6 Gestione del silenzio cliente — STATO TERMINALE NEGATIVO

**Definizione:** il cliente che, entro la deadline T-30, non ha preso alcuna decisione attraverso l'area self-service e non ha risposto ai tentativi di contatto telefonico, è considerato in "silenzio".

**Conseguenze del silenzio:**

1. La pratica EOL viene automaticamente posta in stato `SILENZIO_PERDITA_DEFINITIVA`
2. Il contratto Grenke prosegue in **proroga automatica per 6 mesi** secondo quanto previsto dalla Lettera di scadenza Grenke
3. Smartcom **non inserisce il contratto** nella lista riacquisti trasmessa a Grenke (a T-20)
4. Dopo i 6 mesi di proroga, il contratto **non torna più in scadenza**: Grenke prosegue ulteriormente nella gestione del contratto direttamente con il cliente
5. **Smartcom è disintermediata definitivamente** su quel cliente per il contratto in questione
6. La pratica EOL viene chiusa con esito negativo permanente

**Implicazione strategica:**

Ogni cliente silente rappresenta una **perdita irreversibile** del valore commerciale potenziale (rinnovo del contratto FLEX, riacquisto del bene, fidelizzazione). Per questo il sistema prevede:

- Solleciti automatici email progressivi (T-90, T-60, T-45, T-35)
- Escalation manuale telefonica nei momenti critici (T-50, T-40, T-35)
- Dashboard di monitoraggio "Pratiche a rischio silenzio" per intervento manuale del backoffice
- Coinvolgimento del Capo Area per contratti di valore elevato negli ultimi giorni utili

L'obiettivo è mantenere il tasso di silenzio **sotto il 15%** (KPI #1 inverso).

### 5.7 Audit log con catena di hash

Ogni evento significativo nel ciclo di vita di una Pratica_EOL viene registrato come **Audit_Event** con catena di hash crittografica per garantire l'integrità della sequenza.

```javascript
function calcolaHashEvento(evento, hashPrecedente) {
  const stringa = `${evento.timestamp}|${evento.attore_id}|${evento.azione}|${JSON.stringify(evento.dati)}|${hashPrecedente}`;
  return sha256(stringa);
}
```

Il primo evento di ogni pratica ha `hash_precedente = "GENESIS"`.

L'integrità della catena può essere verificata in qualsiasi momento ricalcolando gli hash a partire dal primo evento.

---

## 6. Flussi utente

### 6.1 Flusso 1 — Importazione lista Grenke (con riconciliazione automatica)

**Attore:** Operatore NSM (ruolo: BACKOFFICE_INTERNO o ADMIN)

**Premessa importante:** la piattaforma NSM esistente già contiene, per ogni contratto FLEX attivo, sia il `contratto_nsm_id` che il `contratto_grenke_id`. Questo consente una riconciliazione automatica al 100% in fase di importazione.

**Passi:**

1. L'operatore accede al backoffice NSM e seleziona "Importa lista Grenke"
2. Carica il file Excel ricevuto da Grenke (drag-and-drop o file picker)
3. Il sistema valida il file e mostra un'anteprima dei dati estratti
4. Il sistema esegue **riconciliazione automatica** per ogni riga:
   ```
   Per ogni contratto_grenke_id nel file:
     Cerca in DB NSM il contratto_nsm_id corrispondente
     Se trovato:
       Marca come "RICONCILIATO_AUTO" e procedi
     Se non trovato:
       Marca come "OUTLIER_DA_GESTIRE"
   ```
5. Il sistema mostra all'operatore un riepilogo con:
   - Numero contratti riconciliati automaticamente (verde)
   - Numero outlier da gestire manualmente (giallo)
   - Eventuali errori di formato (rosso)
6. Per gli **outlier** l'operatore ha tre opzioni:
   - **Cerca manualmente** il contratto NSM corrispondente (per ragione sociale + P.IVA) e associalo
   - **Crea nuovo cliente/contratto** in piattaforma se non esisteva (caso raro, da indagare)
   - **Scarta** la riga (escludi dall'importazione)
7. Al "Conferma importazione" il sistema:
   - Crea/aggiorna i record `Cliente` per ogni cliente nel file
   - Crea i record `Contratto_EOL` con stato `LISTA_RICEVUTA`
   - Calcola il pricing per ogni contratto (vedi 5.1)
   - Calcola il valore della gift card per ogni contratto (vedi 5.2)
   - Genera il token di accesso cliente
   - Registra eventi `Audit_Event` per ogni pratica creata
8. Il sistema mostra il report finale (n. pratiche create, eventuali errori, riepilogo economico totale)

**Formato file Excel atteso:**
| Colonna | Tipo | Esempio |
|---|---|---|
| Numero Contratto Grenke | String | "G-2024-12345" |
| Data Stipula | Date | 15/01/2024 |
| Data Scadenza | Date | 15/01/2027 |
| Ragione Sociale | String | "Acme SRL" |
| P.IVA | String | "12345678901" |
| Email | String | "info@acme.it" |
| PEC | String | "acme@pec.it" |
| Canone Mensile | Decimal | 70.00 |
| Numero Mesi | Integer | 36 |
| Descrizione Beni | String | "MacBook Pro 14 M3 16GB 512GB" |
| Origine | String | "Smartcom" o "IOL" |

Il mapping colonne è configurabile in `config/excel_mapping.json`.

### 6.2 Flusso 2 — Invio comunicazione al cliente

**Attore:** Sistema (automatico, schedulato)

**Trigger:** subito dopo l'importazione e riconciliazione, o tramite scheduler giornaliero per nuove pratiche

**Passi:**
1. Il sistema seleziona tutte le pratiche in stato `LISTA_RICEVUTA` con `stato_riconciliazione != OUTLIER_DA_GESTIRE`
2. Per ogni pratica:
   - Genera il corpo email personalizzato dal template `templates/email/comunicazione_iniziale.html`
   - Calcola la deadline (T-30)
   - Genera il link univoco con token JWT
   - Invia email al cliente (email + PEC) tramite SMTP
   - Registra `Comunicazione` con stato `INVIATO`
   - Aggiorna stato pratica a `COMUNICAZIONE_INVIATA`
   - Registra `Audit_Event`
3. Schedula i solleciti automatici email a T-90, T-60, T-45, T-35
4. Schedula i task di escalation telefonica a T-50, T-40, T-35

**Template email — variabili merge:**
- `{{ragione_sociale}}`
- `{{numero_contratto_grenke}}`
- `{{numero_contratto_nsm}}`
- `{{data_scadenza}}`
- `{{beni}}` (lista formattata)
- `{{monte_canoni}}`
- `{{pricing_riacquisto}}` (formattato come "€202,00 + IVA")
- `{{valore_gift_card}}` (calcolato dinamicamente)
- `{{link_area_cliente}}`
- `{{deadline_decisione}}`

### 6.3 Flusso 3 — Cliente accede all'area self-service

**Attore:** Cliente Conduttore

**Passi:**
1. Cliente clicca sul link nell'email ricevuta
2. Il sistema verifica il token JWT
3. Se valido: mostra la pagina con i dati della pratica e le 4 opzioni
4. Se scaduto: mostra messaggio "Termine decisione superato" con possibilità di richiedere riattivazione contattando NSM
5. Se non valido: errore generico

**Visualizzazione delle 4 opzioni:**

L'ordine di visualizzazione è studiato per orientare il cliente verso le opzioni più strategiche:

1. **🟢 Rinnova con un nuovo contratto FLEX** (opzione promossa, evidenziata visivamente, con badge "Premio Fedeltà")
2. **🔵 Acquista il bene attuale** (opzione self-service, prezzo visibile)
3. **🟡 Richiedi un contatto personalizzato** (opzione di follow-up)
4. **🔴 Restituisci il bene** (opzione residuale, citata per completezza ma non promossa)

**Widget "Chiamami" sempre visibile:**

In tutte le pagine dell'area cliente è presente un widget fisso in basso a destra:

> 📞 **Hai bisogno di parlare con noi prima di decidere?**
>
> Lasciaci il tuo recapito, ti richiameremo entro 24 ore lavorative.
> [Nome] [Telefono] [Giorno preferito] [Fascia oraria: Mattina / Pomeriggio]
> [→ Invia richiesta]

Quando il cliente compila e invia, il sistema:
- Crea un record `Richiesta_Contatto` con `origine = WIDGET_CHIAMAMI`
- Assegna la richiesta all'agente secondo le regole 5.3
- Notifica l'agente assegnato via email
- Mostra al cliente messaggio di conferma con tempi previsti
- Registra `Audit_Event`

La pratica NON cambia stato (resta in `IN_ATTESA_DECISIONE`), ma viene annotata l'attività di "Richiesta ricontatto in corso".

### 6.4 Flusso 4a — Cliente sceglie "Rinnova con nuovo contratto FLEX"

**Passi:**
1. Cliente clicca su "Rinnova"
2. Pagina di pre-qualificazione:
   - Tipo di device desiderato (Apple MacBook / Apple iPad / PC Windows / Smartphone / Altro)
   - Numero di device desiderati
   - Durata desiderata (24/36/48 mesi)
   - Budget orientativo mensile (opzionale)
   - Note libere
3. Cliente conferma con OTP via SMS o email (FES)
4. Il sistema:
   - Registra `Decisione_Cliente` con `opzione_scelta = RINNOVO`
   - Aggiorna stato pratica a `DECISIONE_RINNOVO`
   - Genera PDF di conferma dell'interesse al rinnovo
   - Invia email al cliente con il PDF e conferma che un agente lo contatterà entro 5 giorni lavorativi
   - Crea task nell'area dell'agente assegnato (vedi regole 5.3)
   - Notifica via email l'agente assegnato
   - Registra `Audit_Event`
5. **Nota importante per il cliente:** la gift card di [valore calcolato dinamicamente] € viene comunicata come parte del processo ("riceverai una gift card Smartcom Solutions di [X]€ alla firma del nuovo contratto FLEX, spendibile sul catalogo Smartcom Distribution")

### 6.4 Flusso 4b — Cliente sceglie "Acquista il bene attuale"

**Step intermedio "Hai dubbi?" prima del pagamento:**

Prima di procedere al pagamento, il sistema mostra uno step intermedio:

> **Hai dubbi? Vuoi chiarire qualcosa prima di pagare?**
>
> Sappiamo che potresti volerci conoscere meglio prima di completare il pagamento.
>
> [ Sì, contattatemi prima ]   [ No, procedo con il pagamento ]

**Se cliente sceglie "Sì, contattatemi prima":**
- Si apre il form di richiesta ricontatto (stesso del widget Chiamami)
- Il sistema crea `Richiesta_Contatto` con `origine = STEP_PRE_PAGAMENTO`
- Il sistema **pone in pausa** il flusso di pagamento (la pratica entra in sub-stato `RIACQUISTO_IN_ATTESA_CHIAMATA`)
- L'agente riceve task prioritario nel backoffice
- Dopo la chiamata, l'agente sblocca manualmente la pratica nel backoffice
- Il cliente riceve email con link per riprendere il flusso pagamento

**Se cliente sceglie "No, procedo con il pagamento":**
Si prosegue con i passi normali.

**Passi normali (cliente vuole pagare subito):**

1. Pagina di conferma con riepilogo:
   - Beni oggetto del riacquisto
   - Prezzo netto: pricing_riacquisto
   - IVA 22%
   - Totale
   - Modalità di pagamento disponibili
   - Termini e condizioni del riacquisto (PDF visualizzabile)
2. Cliente accetta T&C e conferma con FES (OTP)
3. **Pagamento differito o immediato** (in base alla distanza dalla scadenza):
   - Se mancano **più di 7 giorni** alla scadenza (parametro `pagamento_riacquisto` in `config/timeline.json`):
     - La decisione viene registrata, la pratica passa a `DECISIONE_RIACQUISTO_IN_CORSO`
     - Il sistema mostra al cliente una conferma: "Scelta confermata. Riceverai il link per il pagamento il [data T-7]"
     - A **T-7** lo scheduler invia automaticamente un'email con il link per completare il pagamento
     - Il cliente accede al link e procede con il pagamento (passo 4)
   - Se mancano **7 giorni o meno**: il pagamento procede immediatamente (passo 4)
4. Sistema mostra schermata di pagamento con due opzioni:
   - **Fabrick** (open banking, bonifico istantaneo) — placeholder mock
   - **Stripe** (carta di credito/debito) — placeholder mock
5. Cliente sceglie metodo e completa il pagamento (mockato nel template)
6. Al pagamento confermato:
   - Sistema registra `Pagamento` con stato `COMPLETATO`
   - Registra `Decisione_Cliente` con `opzione_scelta = RIACQUISTO`
   - Aggiorna stato pratica a `RIACQUISTO_PAGATO`
   - Genera fattura di acconto (PDF) con natura giuridica "ACCONTO"
   - Alla scadenza del contratto Grenke (T0), genera fattura di saldo
   - Invia email di conferma al cliente con fattura e dettagli
   - Registra `Audit_Event`

**Nota fiscale (per gli sviluppatori):** il pagamento avviene prima del passaggio di proprietà (T+11). Va gestito come acconto/caparra con fattura di acconto, poi fattura di saldo al passaggio di proprietà.

### 6.4 Flusso 4c — Cliente sceglie "Richiedi un contatto personalizzato"

**Passi:**
1. Cliente clicca su "Contatto personalizzato"
2. Form con:
   - Disponibilità oraria (mattina/pomeriggio)
   - Modalità preferita (telefono/email/videocall)
   - Note libere (es. "vorrei valutare un mix di rinnovo e riacquisto")
3. Cliente conferma (no FES richiesta, perché non è una decisione vincolante)
4. Sistema:
   - Registra `Decisione_Cliente` con `opzione_scelta = CONTATTO`
   - Registra `Richiesta_Contatto` con `origine = OPZIONE_CONTATTO_PERSONALIZZATO`
   - Aggiorna stato pratica a `DECISIONE_CONTATTO`
   - Assegna pratica secondo regole 5.3
   - Notifica l'agente assegnato via email
   - Registra `Audit_Event`

### 6.4 Flusso 4d — Cliente sceglie "Restituisci il bene"

**Passi:**
1. Cliente clicca su "Restituisci"
2. Pagina di conferma con:
   - Istruzioni dettagliate sulla procedura di restituzione (5 step: disable Find My/Knox, reset, integrity check, packaging, spedizione)
   - Indirizzo di spedizione (Grenke o Smartcom secondo policy)
   - Condizioni di restituzione conforme (integro, funzionante, accessori)
   - Avvertenze su addebiti in caso di restituzione non conforme
3. Cliente conferma con FES (OTP)
4. Sistema:
   - Registra `Decisione_Cliente` con `opzione_scelta = RESTITUZIONE`
   - Aggiorna stato pratica a `DECISIONE_RESTITUZIONE` → `CHIUSA_RESTITUZIONE_CONFERMATA`
   - Genera PDF "Verbale di conferma restituzione" con tutti i dati
   - Invia email al cliente con PDF e istruzioni operative
   - **Nota:** poiché Smartcom non gestisce magazzino usato, il bene torna direttamente a Grenke secondo procedura standard
   - Registra `Audit_Event`

### 6.5 Flusso 5 — Solleciti automatici email + Escalation telefonica

**Sistema combinato di comunicazione progressiva** per minimizzare il rischio di silenzio cliente.

#### 6.5.1 Solleciti automatici email

**Attore:** Sistema (schedulato giornalmente)

**Logica:**
- A T-90, T-60, T-45, T-35 il sistema invia un sollecito email alle pratiche ancora in stato `COMUNICAZIONE_INVIATA` o `IN_ATTESA_DECISIONE`
- Ogni sollecito ha un template diverso, con tono crescente di urgenza:
  - **T-90**: gentile reminder, riepilogo opzioni
  - **T-60**: reminder con evidenziazione del vantaggio del rinnovo
  - **T-45**: avviso che la deadline si avvicina
  - **T-35**: ultima chiamata, con avviso esplicito che il silenzio porta alla proroga automatica
- Templates configurabili in `templates/email/sollecito_X.html`

#### 6.5.2 Escalation telefonica manuale

**Attore:** Agente NSM assegnato alla pratica (o Capo Area in casi specifici)

**Logica:**

| Momento | Azione | Responsabile | Trigger |
|---|---|---|---|
| **T-50** | Primo tentativo di contatto telefonico | Agente assegnato | Pratica ancora in `IN_ATTESA_DECISIONE` |
| **T-40** | Secondo tentativo telefonico | Agente assegnato | Pratica ancora in `IN_ATTESA_DECISIONE` dopo T-50 |
| **T-35** | Terzo tentativo (Capo Area per contratti >5.000€, altrimenti agente) | Capo Area / Agente | Pratica ancora in `IN_ATTESA_DECISIONE` dopo T-40 |

**Modalità operativa:**

1. Il sistema crea automaticamente un **task** nel backoffice dell'agente assegnato con:
   - Dati della pratica
   - Numero di telefono del cliente
   - Storico comunicazioni inviate
   - Suggerimenti script di chiamata
   - Form per registrare l'esito della chiamata
2. L'agente effettua la chiamata e registra l'esito:
   - **RISPOSTA_POSITIVA**: il cliente prende una decisione → l'agente la registra nella pratica
   - **RISPOSTA_NEGATIVA**: il cliente conferma di non voler decidere → la pratica può procedere verso `SILENZIO_PERDITA_DEFINITIVA`
   - **NON_RAGGIUNTO**: nessuna risposta → il sistema schedula il prossimo tentativo
   - **RICHIAMARE**: il cliente chiede di essere richiamato in un altro momento
3. Il sistema registra una `Comunicazione` di tipo `ESCALATION_TELEFONICA_X` con esito
4. Registra `Audit_Event`

**Script di chiamata standardizzato:**

Lo script di chiamata (fornito nel task all'agente) si concentra **esclusivamente** sulla gestione delle opzioni di fine contratto, senza derive commerciali su altri prodotti, in coerenza con il quadro normativo delle comunicazioni contrattuali (vedi sezione 11).

### 6.6 Flusso 6 — Backoffice NSM

**Attore:** Utente NSM (vari ruoli)

#### 6.6.1 Dashboard generale (priorità: monitoraggio silenzio)

**Sezione "Pratiche a rischio silenzio"** — vista prioritaria nella dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️  PRATICHE A RISCHIO SILENZIO                                │
│                                                                  │
│ Pratiche oltre T-50 senza decisione (richiede chiamata urgente):│
│ [12]  → vai alla lista                                          │
│                                                                  │
│ Pratiche oltre T-40 senza decisione (secondo tentativo):        │
│ [8]   → vai alla lista                                          │
│                                                                  │
│ Pratiche oltre T-35 senza decisione (ULTIMO TENTATIVO):         │
│ [3]   → vai alla lista (priorità ROSSA)                         │
└─────────────────────────────────────────────────────────────────┘
```

**KPI dell'anno corrente** (vedi sezione 1.4):
- Tasso di non-silenzio (KPI #1)
- Tasso di rinnovo
- Tasso di riacquisto
- Margine medio per pratica
- Tempo medio decisione
- Tasso di intervento manuale

**Lista pratiche con filtri:**
- Stato
- Scadenza (range date)
- Agente assegnato
- Origine (Smartcom / IOL)
- Tipologia decisione presa
- Rischio silenzio (sì/no)

#### 6.6.2 Vista singola pratica

- Dati del cliente
- Dati del contratto Grenke (numero NSM + numero Grenke, scadenza, beni, monte canoni)
- Calcolo economico (pricing Grenke, pricing riacquisto, margine, valore gift card potenziale)
- Timeline completa delle comunicazioni e eventi (incluse chiamate effettuate)
- Lista richieste di contatto pendenti
- Audit log esportabile in PDF firmato
- Azioni manuali disponibili:
  - Re-invio email
  - Cambio assegnazione
  - Modifica deadline (con motivazione)
  - Sblocco pagamento (post chiamata "Hai dubbi?")
  - Inserimento manuale decisione (per casi gestiti via telefono)
  - Esportazione audit trail

#### 6.6.3 Generazione lista riacquisti per Grenke

- A T-20 (o su richiesta manuale dell'operatore) il sistema estrae tutte le pratiche con stato:
  - `RIACQUISTO_PAGATO` (cliente ha confermato e pagato)
  - `DECISIONE_RESTITUZIONE` (escluse — vanno gestite da Grenke direttamente)
- Genera file Excel con il formato richiesto da Grenke
- L'operatore BACKOFFICE_INTERNO valida e invia il file a Grenke (manualmente o via integrazione futura)

#### 6.6.4 Gestione assegnazioni

- Visualizzazione delle pratiche assegnate a ciascun agente
- Riassegnazione manuale (es. agente in ferie)
- Notifiche email/in-app per nuove assegnazioni
- Cruscotto specifico per BACKOFFICE_INTERNO con task in coda (es. outlier riconciliazione, richieste contatto da gestire centralmente)

#### 6.6.5 Gestione outlier riconciliazione

Sezione dedicata all'utente BACKOFFICE_INTERNO per gestire i contratti del file Excel Grenke che non hanno trovato match automatico in DB NSM:

- Lista outlier con suggerimenti di matching basati su ragione sociale + P.IVA
- Possibilità di associazione manuale
- Possibilità di creazione nuovo contratto (con motivazione obbligatoria)
- Possibilità di scarto (con motivazione obbligatoria)

#### 6.6.6 Reportistica

- Export Excel/CSV con filtri custom
- Report mensile/trimestrale di sintesi con focus sui KPI
- **Report "Perdite da silenzio"**: quantificazione del margine teorico perso a causa del silenzio cliente
- Confronto con periodi precedenti
- Analisi per agente / Capo Area / origine contratto

---

## 7. Mockup interfacce principali

### 7.1 Email comunicazione iniziale al cliente

```
Oggetto: Il tuo contratto Noleggio Su Misura n. [NUMERO_NSM] è in scadenza

Gentile [RAGIONE_SOCIALE],

come già anticipato da Grenke Italia (nostro partner finanziario),
il tuo contratto di locazione operativa n. [NUMERO_GRENKE] / [NUMERO_NSM]
giungerà a scadenza il [DATA_SCADENZA].

In qualità di partner autorizzato Grenke per la gestione della
fase di fine contratto, ti scriviamo per presentarti le opzioni
disponibili.

I BENI OGGETTO DEL CONTRATTO:
[ELENCO_BENI]

LE TUE OPZIONI:

🟢 OPZIONE 1 — RINNOVA E RICEVI UN PREMIO FEDELTÀ
   Stipula un nuovo contratto FLEX su device aggiornato e ricevi
   una GIFT CARD SMARTCOM SOLUTIONS DA [VALORE_GIFT_CARD]€ alla
   firma del nuovo contratto, spendibile sul catalogo Smartcom
   Distribution. [SCELTA CONSIGLIATA]

🔵 OPZIONE 2 — ACQUISTA IL BENE ATTUALE
   Prezzo: €[PRICING_RIACQUISTO] + IVA
   Pagamento online sicuro tramite bonifico istantaneo o carta.

🟡 OPZIONE 3 — RICHIEDI UN CONTATTO PERSONALIZZATO
   Un nostro consulente ti contatterà per valutare insieme la
   soluzione migliore.

🔴 OPZIONE 4 — RESTITUISCI IL BENE
   Riconsegna il bene secondo le istruzioni che ti forniremo.

[BOTTONE GRANDE: SCEGLI LA TUA OPZIONE]
Link: https://eol.noleggiosumisura.it/pratica/[TOKEN]

⏰ Termine per la scelta: [DEADLINE_DECISIONE]

⚠️  IMPORTANTE: in assenza di scelta entro la deadline, il contratto
proseguirà in proroga con canoni invariati per 6 mesi, dopo i quali
non sarà più possibile esercitare le opzioni qui presentate.

Cordiali saluti,
Il Team Noleggio Su Misura
011 4557949 | info@noleggiosumisura.it
```

### 7.2 Area cliente — Schermata principale

```
┌──────────────────────────────────────────────────────────────┐
│ [LOGO NSM]              Area Cliente — Fine Contratto       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Ciao [RAGIONE_SOCIALE]                                      │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Contratto NSM n. [NUMERO_NSM]                          │ │
│ │ (Rif. Grenke: [NUMERO_GRENKE])                         │ │
│ │ Scadenza: [DATA_SCADENZA]                              │ │
│ │ Beni: [BENI]                                           │ │
│ │ Monte canoni: €[MONTE_CANONI]                          │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ Scegli la tua opzione preferita:                            │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 🟢 RINNOVA E RICEVI [VALORE]€ DI GIFT CARD          │   │
│ │ Stipula un nuovo contratto FLEX su device           │   │
│ │ aggiornato. Ricevi una gift card Smartcom           │   │
│ │ Solutions alla firma.                                │   │
│ │                                       [SCEGLI →]    │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 🔵 ACQUISTA IL BENE — €[PRICING] + IVA              │   │
│ │ Mantieni il dispositivo che già conosci.            │   │
│ │ Pagamento online sicuro.                             │   │
│ │                                       [SCEGLI →]    │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 🟡 CONTATTO PERSONALIZZATO                          │   │
│ │ Parla con un consulente per valutare opzioni        │   │
│ │ combinate.                            [SCEGLI →]    │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 🔴 Restituisci il bene                              │   │
│ │ Procedura di riconsegna entro 10 giorni dalla       │   │
│ │ scadenza.                              [Scegli →]   │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ⏱  Termine per la scelta: [DEADLINE_DECISIONE]              │
│                                                              │
│                                              ┌────────────┐│
│                                              │ 📞 Chiamami││ ← Widget fisso
│                                              └────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Step intermedio "Hai dubbi?" prima del pagamento

```
┌──────────────────────────────────────────────────────────────┐
│ Riacquisto del bene — Conferma                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Stai per acquistare:                                         │
│ • [BENI]                                                     │
│                                                              │
│ Prezzo: €[NETTO] + IVA 22% = €[TOTALE]                       │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │                                                        │ │
│ │ 💬 Hai dubbi? Vuoi chiarire qualcosa prima            │ │
│ │ di pagare?                                             │ │
│ │                                                        │ │
│ │ Sappiamo che potresti volerci conoscere meglio        │ │
│ │ prima di completare il pagamento.                      │ │
│ │                                                        │ │
│ │ [ Sì, contattatemi prima ]                            │ │
│ │ [ No, procedo con il pagamento ]                      │ │
│ │                                                        │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.4 Backoffice NSM — Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ NSM Backoffice — EOL Grenke              [Utente] [Logout]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ⚠️  PRATICHE A RISCHIO SILENZIO                                │
│ ┌─────────────────┬─────────────────┬─────────────────┐       │
│ │ T-50 (12)       │ T-40 (8)        │ T-35 (3) 🔴     │       │
│ │ Chiamata 1ª     │ Chiamata 2ª     │ ULTIMA CHANCE   │       │
│ └─────────────────┴─────────────────┴─────────────────┘       │
│                                                                 │
│ KPI 2026                                                        │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│ │ Pratiche │Non-silen │ Rinnovi  │Riacquisti│ Margine  │      │
│ │ Totali   │ %        │   %      │   %      │   (€)    │      │
│ │   40     │  85% ✓   │  35%     │   45%    │ €1.520   │      │
│ └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                 │
│ Filtri: [Stato ▼] [Agente ▼] [Scadenza ▼] [Origine ▼] [Cerca] │
│                                                                 │
│ ┌──────────┬──────────┬─────────────┬──────────┬───────────┐  │
│ │ Contr.NSM│Contr.Grek│ Cliente     │ Scadenza │ Stato     │  │
│ ├──────────┼──────────┼─────────────┼──────────┼───────────┤  │
│ │ NSM-101  │ G-2024-1 │ Acme SRL    │ 15/03/26 │ Pagato    │  │
│ │ NSM-102  │ G-2024-2 │ Beta SpA    │ 20/03/26 │ Attesa    │  │
│ │ NSM-103  │ G-2024-3 │ Gamma SRL   │ 25/03/26 │ Rinnovo   │  │
│ └──────────┴──────────┴─────────────┴──────────┴───────────┘  │
│                                                                 │
│ [+ Importa lista Grenke]  [Esporta lista riacquisti per Grenke]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Architettura tecnica

### 8.1 Stack tecnologico

| Componente | Tecnologia | Note |
|---|---|---|
| Backend | Node.js + Express | API REST |
| Database | SQLite (prototipo) → PostgreSQL (produzione) | Schema gestito con Prisma ORM |
| ORM | Prisma | Migrazioni automatiche |
| Frontend | React + Vite + TypeScript | SPA |
| Styling | Tailwind CSS + shadcn/ui | Coerente con altri progetti NSM |
| Email (mock) | Mailpit (server SMTP locale) | UI web per visualizzare le email inviate |
| SMS OTP (mock) | Generatore locale + console.log | In produzione: Skebby o Twilio |
| Excel parsing | SheetJS (xlsx) | Importazione file Grenke |
| PDF generation | PDFKit | Generazione conferme e fatture |
| JWT | jsonwebtoken | Token area cliente |
| Crittografia | crypto (Node native) | SHA-256 per audit chain |
| Scheduler | node-cron | Solleciti automatici + creazione task escalation |
| Autenticazione backoffice | Passport.js (local strategy per prototipo) | In produzione: SSO/Auth0 |

### 8.2 Struttura del progetto

```
nsm-eol-grenke-template/
├── README.md
├── SPECS.md (questo documento)
├── MISSIONS.md (lista missioni per Antigravity)
├── DECISIONS.md (decisioni di design)
├── package.json
├── .env.example
├── .gitignore
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts (entry point Express)
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── pratiche.routes.ts
│   │   │   ├── cliente.routes.ts (area cliente)
│   │   │   ├── backoffice.routes.ts
│   │   │   ├── import.routes.ts
│   │   │   └── richieste-contatto.routes.ts
│   │   ├── services/
│   │   │   ├── pricing.service.ts
│   │   │   ├── giftcard.service.ts
│   │   │   ├── email.service.ts
│   │   │   ├── pdf.service.ts
│   │   │   ├── audit.service.ts
│   │   │   ├── otp.service.ts (mock)
│   │   │   ├── reconciliation.service.ts
│   │   │   ├── escalation.service.ts
│   │   │   └── scheduler.service.ts
│   │   ├── providers/ (interfacce mockate)
│   │   │   ├── payment/
│   │   │   │   ├── fabrick.provider.ts (mock)
│   │   │   │   ├── stripe.provider.ts (mock)
│   │   │   │   └── types.ts
│   │   │   ├── signature/
│   │   │   │   ├── fea.provider.ts (mock)
│   │   │   │   └── types.ts
│   │   │   └── notification/
│   │   │       ├── email.provider.ts
│   │   │       ├── sms.provider.ts (mock)
│   │   │       └── types.ts
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── types/
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── cliente/
│   │   │   │   ├── AreaPratica.tsx
│   │   │   │   ├── FlussoRinnovo.tsx
│   │   │   │   ├── FlussoRiacquisto.tsx
│   │   │   │   ├── StepPrePagamento.tsx
│   │   │   │   ├── FlussoContatto.tsx
│   │   │   │   └── FlussoRestituzione.tsx
│   │   │   └── backoffice/
│   │   │       ├── Dashboard.tsx
│   │   │       ├── ListaPratiche.tsx
│   │   │       ├── PraticaDettaglio.tsx
│   │   │       ├── ImportLista.tsx
│   │   │       ├── GestioneOutlier.tsx
│   │   │       ├── RichiesteContatto.tsx
│   │   │       ├── TaskEscalation.tsx
│   │   │       └── EsportaListaGrenke.tsx
│   │   ├── components/
│   │   │   ├── WidgetChiamami.tsx (componente globale)
│   │   │   └── ... (altri componenti)
│   │   ├── hooks/
│   │   ├── services/ (chiamate API)
│   │   └── types/
│   └── public/
│
├── config/
│   ├── pricing_rules.json
│   ├── timeline.json
│   ├── assignment_rules.json
│   ├── loyalty_program.json
│   ├── excel_mapping.json
│   └── feature_flags.json
│
├── templates/
│   ├── email/
│   │   ├── comunicazione_iniziale.html
│   │   ├── sollecito_1.html
│   │   ├── sollecito_2.html
│   │   ├── sollecito_3.html
│   │   ├── sollecito_4.html
│   │   ├── conferma_rinnovo.html
│   │   ├── conferma_riacquisto.html
│   │   ├── conferma_contatto.html
│   │   └── conferma_restituzione.html
│   ├── pdf/
│   │   ├── verbale_restituzione.template.ts
│   │   ├── conferma_riacquisto.template.ts
│   │   ├── fattura_acconto.template.ts
│   │   └── audit_export.template.ts
│   └── script/
│       ├── script_escalation_t50.md
│       ├── script_escalation_t40.md
│       └── script_escalation_t35.md
│
├── data-samples/
│   ├── grenke-lista-esempio.xlsx (file di test)
│   └── README.md (descrizione dei dati di esempio)
│
└── docs/
    ├── integration-guide.md (guida per gli sviluppatori finali)
    ├── api-reference.md
    └── data-flow-diagrams/
```

### 8.3 Punti di integrazione per gli sviluppatori finali

I seguenti moduli del template sono **mockati** e dovranno essere sostituiti con integrazioni reali in produzione.

#### 8.3.1 Pagamenti — `backend/src/providers/payment/`

Interfaccia comune:
```typescript
interface PaymentProvider {
  initiatePayment(amount: number, currency: string, metadata: PaymentMetadata): Promise<PaymentSession>;
  verifyPayment(sessionId: string): Promise<PaymentStatus>;
  refundPayment(transactionId: string, amount: number): Promise<RefundResult>;
}
```

Gli sviluppatori dovranno:
- Sostituire `fabrick.provider.ts` con integrazione API Fabrick (open banking PSD2)
- Sostituire `stripe.provider.ts` con integrazione API Stripe (carte)
- Mantenere l'interfaccia per minimizzare l'impatto sul codice che chiama il provider

#### 8.3.2 Firma elettronica — `backend/src/providers/signature/`

Interfaccia comune:
```typescript
interface SignatureProvider {
  requestSignature(documentPath: string, signer: SignerInfo): Promise<SignatureSession>;
  verifySignature(sessionId: string): Promise<SignatureStatus>;
  getSignedDocument(sessionId: string): Promise<Buffer>;
}
```

Gli sviluppatori dovranno integrare un provider FEA certificato eIDAS (es. Namirial, InfoCert, Aruba) per i flussi di riacquisto e restituzione.

#### 8.3.3 Notifiche — `backend/src/providers/notification/`

- Email: sostituire SMTP locale (Mailpit) con servizio transazionale (es. SendGrid, AWS SES, Brevo)
- SMS: sostituire mock con servizio (es. Skebby, Twilio)
- PEC: integrare con provider PEC certificato (es. Aruba PEC API)

---

## 9. Configurazione e parametrizzazione

Per garantire massima flessibilità nei test e nelle simulazioni, tutte le regole di business e i parametri operativi sono esternalizzati in file di configurazione JSON.

### 9.1 `config/pricing_rules.json`

```json
{
  "version": "1.0",
  "pricing_grenke_percentuale": 0.05,
  "pricing_riacquisto_percentuale": 0.08,
  "margine_lordo_percentuale": 0.03,
  "iva_percentuale": 0.22,
  "valuta": "EUR"
}
```

### 9.2 `config/timeline.json`

```json
{
  "version": "1.0",
  "giorni_pre_scadenza": {
    "comunicazione_iniziale": 145,
    "sollecito_email_1": 90,
    "sollecito_email_2": 60,
    "escalation_telefonica_1": 50,
    "sollecito_email_3": 45,
    "escalation_telefonica_2": 40,
    "sollecito_email_4": 35,
    "escalation_telefonica_3": 35,
    "deadline_decisione": 30,
    "consolidamento_lista": 20,
    "pagamento_riacquisto": 7
  },
  "giorni_post_scadenza": {
    "termine_consegna_bene": 10,
    "trasferimento_proprieta": 11,
    "pagamento_grenke": 30
  }
}
```

### 9.3 `config/assignment_rules.json`

```json
{
  "version": "1.0",
  "regole_assegnazione_contatto": {
    "priorita_1": {
      "condizione": "agente_originario.attivo == true",
      "assegna_a": "agente_originario"
    },
    "priorita_2": {
      "condizione": "monte_canoni >= 5000",
      "assegna_a": "capo_area_di_agente_originario"
    },
    "priorita_3": {
      "condizione": "default",
      "assegna_a": "team_fine_noleggio (BACKOFFICE_INTERNO)"
    }
  },
  "soglia_alto_valore": 5000,
  "regole_escalation_telefonica": {
    "t_50": "agente_assegnato",
    "t_40": "agente_assegnato",
    "t_35_alto_valore": "capo_area_di_agente_assegnato",
    "t_35_basso_valore": "agente_assegnato"
  }
}
```

### 9.4 `config/loyalty_program.json`

```json
{
  "version": "1.0",
  "gift_card": {
    "abilitato": true,
    "calcolo_dinamico": true,
    "a_carico_di": "Smartcom Solutions",
    "spendibile_su": "Smartcom Distribution",
    "tagli_standard": [25, 50, 75, 100, 125, 150, 200, 250, 300],
    "metodo_arrotondamento": "per_difetto",
    "validita_mesi": 12,
    "messaggio_marketing": "Rinnova il tuo contratto FLEX e ricevi una gift card Smartcom Solutions di {{valore}}€ spendibile su accessori e periferiche del catalogo Smartcom Distribution."
  }
}
```

### 9.5 `config/excel_mapping.json`

```json
{
  "version": "1.0",
  "formato_grenke_standard": {
    "Numero Contratto Grenke": "contratto_grenke_id",
    "Data Stipula": "data_stipula",
    "Data Scadenza": "data_scadenza",
    "Ragione Sociale": "cliente.ragione_sociale",
    "P.IVA": "cliente.piva",
    "Email": "cliente.email",
    "PEC": "cliente.pec",
    "Canone Mensile": "canone_mensile",
    "Numero Mesi": "numero_mesi",
    "Descrizione Beni": "beni_descrizione",
    "Origine": "origine"
  }
}
```

### 9.6 `config/feature_flags.json`

```json
{
  "version": "1.0",
  "abilita_fea_riacquisto": true,
  "abilita_fes_restituzione": true,
  "abilita_pagamento_fabrick": true,
  "abilita_pagamento_stripe": true,
  "abilita_solleciti_email_automatici": true,
  "abilita_escalation_telefonica": true,
  "abilita_widget_chiamami": true,
  "abilita_step_pre_pagamento": true,
  "abilita_gift_card": true,
  "abilita_riconciliazione_automatica": true,
  "modalita_test": true
}
```

---

## 10. Dati di esempio per testing

Il template include un file Excel di esempio (`data-samples/grenke-lista-esempio.xlsx`) con **30 contratti EOL simulati**, dimensionati come segue:

- **Distribuzione durata:** 20 contratti a 36 mesi, 6 a 48 mesi, 4 a 24 mesi (proporzionale al portafoglio reale NSM)
- **Distribuzione canoni:** range 40-150€/mese, media 70€/mese
- **Distribuzione scadenze:** sparse tra +30 giorni e +180 giorni dalla data corrente (per testare tutti gli stati della timeline)
- **Distribuzione brand:** 60% Apple, 25% Lenovo/Dell, 15% Samsung/Nothing
- **Distribuzione origine:** 70% Smartcom, 30% IOL
- **Dati clienti:** ragioni sociali fittizie ma realistiche italiane, P.IVA finte ma formalmente valide, email/PEC fittizie

Inoltre il sistema include nel seed del database (`backend/prisma/seed.ts`):
- 28 contratti già presenti in piattaforma NSM con relativo `contratto_nsm_id` e `contratto_grenke_id` allineato → testano la riconciliazione automatica
- 2 contratti senza match → testano il flusso "outlier" del BACKOFFICE_INTERNO

---

## 11. Sicurezza, privacy e compliance

### 11.1 Inquadramento normativo delle comunicazioni

Tutte le comunicazioni inviate dal sistema (email, PEC, SMS, chiamate telefoniche, sia automatiche che manuali) sono classificate come **comunicazioni contrattuali**, rientranti nella base giuridica dell'art. 6.1.b GDPR ("esecuzione di un contratto di cui l'interessato è parte").

**Quadro normativo di riferimento:**

- L'attività di gestione del fine contratto è parte integrante dell'esecuzione del contratto di locazione operativa Grenke-Cliente
- Smartcom è formalmente designata dalla Lettera di scadenza Grenke come "partner autorizzato" alla gestione del fine contratto: il cliente è quindi preavvisato e consapevole del coinvolgimento di Smartcom
- La proposta di rinnovo con nuovo contratto FLEX è considerata parte della gestione del fine contratto in essere (orientamento prevalente del Garante Privacy per servizi continuativi)
- Le comunicazioni non richiedono pertanto consenso specifico di marketing

**Limiti operativi da rispettare:**

Il sistema NON deve essere utilizzato per:
- Promozione di prodotti/servizi diversi dal rinnovo del contratto in scadenza
- Newsletter periodiche o campagne marketing generiche
- Promozione di Smartcom Distribution come prodotto a sé stante (è ammessa solo la menzione della gift card come incentivo accessorio al rinnovo)
- Riutilizzo della lista clienti EOL per altre finalità commerciali

### 11.2 Privacy by design — buone pratiche tecniche

Il template implementa le seguenti misure tecniche di privacy:

1. **Oggetto chiaro nelle comunicazioni** — ogni email/PEC contiene nell'oggetto il riferimento alla natura contrattuale (es. "Comunicazione relativa al Suo contratto di locazione operativa n. XXX in scadenza")

2. **Tracciamento del consenso eventuale** — se il cliente esprime consensi specifici durante il flusso (T&C, accettazione termini riacquisto, etc.), il sistema li archivia con timestamp e li espone nell'audit log

3. **Diritto di opposizione (opt-out)** — ogni comunicazione include un link per richiedere l'interruzione delle comunicazioni. Il flag `opt_out_comunicazioni` nel record Cliente blocca i solleciti automatici (le comunicazioni minime obbligatorie restano possibili)

4. **Data minimization** — le pratiche EOL chiuse vengono archiviate; i dati personali ridotti al minimo dopo 24 mesi dalla chiusura della pratica

5. **Audit log degli accessi** — tutti gli accessi degli utenti NSM al backoffice e ai dati cliente sono loggati con timestamp, IP, azione

6. **Script di chiamata standardizzato** — per l'escalation telefonica, l'agente segue uno script che si concentra esclusivamente sulle opzioni di fine contratto; nessuna proposta commerciale su altri prodotti

### 11.3 Protezione dati personali (GDPR)

- Cifratura at-rest del database
- Cifratura in-transit (HTTPS obbligatorio in produzione)
- Token JWT con scadenza
- Log accessi backoffice
- Procedura di cancellazione dati su richiesta dell'interessato (diritto all'oblio)
- Esposizione dei dati personali limitata in base al ruolo dell'utente NSM

### 11.4 Conservazione documenti

- PDF firmati conservati per 10 anni minimo (durata prescrizione contratti)
- Audit log conservato per 10 anni minimo
- Backup giornaliero del database

### 11.5 Notifica violazioni (data breach)

In coerenza con la Nomina a Responsabile esterno del trattamento sottoscritta con Grenke (Allegato 02 dell'Accordo Remarketing), il sistema deve supportare la procedura di notifica violazioni a Grenke entro le tempistiche concordate (alert preliminare 24h, notifica strutturata 72h).

Il template prevede un modulo dedicato `backend/src/services/breach-notification.service.ts` con interfaccia per attivare manualmente o automaticamente la notifica.

---

## 12. Roadmap di sviluppo del template

Lo sviluppo del template è organizzato in **10 fasi incrementali**, ognuna verificabile e funzionante prima di passare alla successiva. Per il dettaglio delle missioni e dell'assegnazione agli agent Antigravity, vedere il documento `MISSIONS.md`.

| Fase | Obiettivo | Output verificabile |
|---|---|---|
| 1 | Setup progetto + schema database | Database creato, seed di test funzionante |
| 2 | Modulo importazione Excel + riconciliazione | File caricato → pratiche EOL nel DB con pricing e gift card calcolati, gestione outlier |
| 3 | Generazione email + invio mock | Email visibile in Mailpit con link area cliente |
| 4 | Area cliente — schermata principale + widget Chiamami | Cliente accede al link, vede dati e 4 opzioni, widget funzionante |
| 5 | Flusso restituzione completo | Cliente sceglie, conferma OTP, riceve PDF di conferma |
| 6 | Flusso riacquisto completo (con step "Hai dubbi?" e mock pagamenti) | Cliente sceglie, valuta contatto, paga (mock), riceve fattura |
| 7 | Flusso rinnovo + contatto personalizzato | Cliente sceglie, agente riceve task assegnato |
| 8 | Solleciti automatici email + escalation telefonica (task agenti) | Sistema genera email programmate e task chiamate per agenti |
| 9 | Backoffice NSM (dashboard + lista pratiche + rischio silenzio + outlier) | Operatore vede tutto e può intervenire |
| 10 | Audit log + export lista Grenke + refinement | Sistema pronto per consegna sviluppatori |

---

## 13. Domande aperte da chiarire

Le seguenti decisioni sono ancora aperte e richiedono input prima dell'avvio dello sviluppo o durante lo stesso.

### 13.1 Decisioni interne Smartcom

1. **Modalità di consegna gift card Smartcom Solutions**: codice univoco via email? Buono spendibile online con QR code?
2. **Catalogo Smartcom Distribution per gift card**: restrizioni di categoria o spendibile su tutto?
3. **Email mittente per le comunicazioni NSM**: quale indirizzo? Va creato un alias dedicato (es. `finecontratti@noleggiosumisura.it`)?
4. **Numero dedicato fine-noleggio**: usare il numero principale 011 4557949 o un secondo numero?
5. **Branding visivo della comunicazione**: logo NSM principale o brand dedicato "EOL"?
6. **Script di chiamata per escalation telefonica**: chi prepara i testi degli script T-50/T-40/T-35?

### 13.2 Decisioni da chiarire con Grenke

1. Sorte del vecchio bene in caso di rinnovo cliente (cfr. Tornata 1 lettera)
2. Formato esatto del file Excel "Dettaglio posizioni affidate" (cfr. Tornata 1 punto B.2)
3. Coordinamento operativo per contratti origine IOL (cfr. Tornata 1 punto B.6)

### 13.3 Decisioni tecniche da rinviare agli sviluppatori finali

1. Scelta provider FEA per produzione (Namirial vs InfoCert vs Aruba)
2. Scelta provider email transazionale (SendGrid vs AWS SES vs Brevo)
3. Architettura di hosting su AWS (EC2 vs ECS vs Lambda vs Beanstalk)
4. Strategia di backup e disaster recovery
5. Sistema di autenticazione produttivo (SSO con Active Directory? Auth0? Custom?)

---

## 14. Riferimenti normativi e contrattuali

- **Accordo Remarketing** sottoscritto tra Smartcom Solutions Srl e Grenke Italia S.p.A. (data: [data firma]) e relativi Allegati 01 (Tabella pricing) e 02 (Nomina a Responsabile esterno del trattamento)
- **Rinuncia IOL** alla facoltà di riacquisto e designazione di Smartcom (data: [data firma])
- **Lettera di scadenza al Conduttore** — modello concordato con Grenke
- **Regolamento UE 2016/679 (GDPR)** — protezione dati personali
- **Regolamento UE 910/2014 (eIDAS)** — firma elettronica
- **D.Lgs. 82/2005 (CAD)** — Codice dell'Amministrazione Digitale
- **Codice Civile** — artt. 1385 (caparra), 1498 (vendita), 2702 (scrittura privata), 2712 (riproduzioni meccaniche), 948 (rivendicazione)

---

**Fine documento SPECS.md v1.1**

*Documento vivo e aggiornabile in corso d'opera. Ogni modifica deve essere annotata con data, autore e descrizione della variazione.*
