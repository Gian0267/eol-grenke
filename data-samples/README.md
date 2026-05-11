# Dati di esempio

Questa cartella contiene dati fittizi per testare il template senza usare dati reali di Grenke o di clienti.

## File attesi (da generare nelle missioni)

| File | Missione | Scopo |
|---|---|---|
| `grenke-lista-esempio.xlsx` | 2 | File Excel con 30 contratti EOL simulati (28 match + 2 outlier) |
| `generate-sample.ts` | 2 | Script che rigenera il file Excel di esempio |

## Dimensionamento del campione

Il file Excel di esempio deve contenere **30 contratti EOL simulati** con questa distribuzione (proporzionale al portafoglio NSM reale):

### Distribuzione durata
- 20 contratti a 36 mesi (67%)
- 6 contratti a 48 mesi (20%)
- 4 contratti a 24 mesi (13%)

### Distribuzione canone mensile
- Range: 40 – 150 €/mese
- Media: 70 €/mese

### Distribuzione scadenza
- Spalmata tra +30 giorni e +180 giorni dalla data corrente
- Almeno 1 contratto per ogni "finestra" temporale critica:
  - 1 a T-30 (deadline imminente)
  - 1 a T-35 (ultima chiamata)
  - 1 a T-40 (escalation 2)
  - 1 a T-45 (sollecito 3)
  - 1 a T-50 (escalation 1)
  - 1 a T-60 (sollecito 2)
  - 1 a T-90 (sollecito 1)
  - Altri sparsi

### Distribuzione brand
- 60% Apple
- 25% Lenovo / Dell
- 15% Samsung / Nothing Tech

### Distribuzione origine
- 70% Smartcom
- 30% IOL

### Match per riconciliazione
- 28 contratti con `contratto_grenke_id` esistente in piattaforma NSM (testano riconciliazione automatica)
- 2 contratti senza match (testano flusso outlier del BACKOFFICE_INTERNO)

## Dati clienti

Tutti **fittizi ma realistici**:

- Ragioni sociali italiane plausibili (es. "Acme Srl", "Tipografia Rossi & Figli", "Studio Bianchi Associati")
- P.IVA formalmente valide (11 cifre, algoritmo di checksum corretto) ma non reali
- Email/PEC su domini fittizi (es. `@acme-test.it`, `@pec-test.it`)
- Indirizzi geograficamente sparsi su tutto il territorio italiano

## Generazione

Il file Excel viene generato programmaticamente da `generate-sample.ts` usando SheetJS, in modo che possa essere rigenerato deterministicamente con un seed fisso per i test.

```bash
# Dalla root del progetto, dopo Missione 2:
npx tsx data-samples/generate-sample.ts
```
