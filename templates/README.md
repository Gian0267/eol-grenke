# Templates

Template di comunicazione del flusso EOL.

## Struttura

```
templates/
├── email/      → Template HTML per email/PEC (handlebars)
├── pdf/        → Template per generazione PDF (PDFKit)
└── script/     → Script telefonici per escalation T-50/T-40/T-35 (markdown)
```

## Template attesi (da generare nelle missioni)

### Email (Missioni 3, 5, 6, 7, 8)

| File | Missione | Scopo |
|---|---|---|
| `email/comunicazione_iniziale.html` | 3 | Comunicazione iniziale al cliente a T-145 |
| `email/sollecito_1.html` | 8 | Sollecito a T-90 (gentile reminder) |
| `email/sollecito_2.html` | 8 | Sollecito a T-60 (evidenzia rinnovo) |
| `email/sollecito_3.html` | 8 | Sollecito a T-45 (deadline si avvicina) |
| `email/sollecito_4.html` | 8 | Sollecito a T-35 (ULTIMA CHIAMATA) |
| `email/conferma_restituzione.html` | 5 | Conferma restituzione con verbale PDF allegato |
| `email/conferma_riacquisto.html` | 6 | Conferma pagamento riacquisto con fattura PDF |
| `email/fallimento_pagamento.html` | 6 | Notifica fallimento pagamento + link retry |
| `email/sblocco_pagamento.html` | 6 | Link per riprendere pagamento dopo chiamata agente |
| `email/conferma_rinnovo.html` | 7 | Conferma interesse al rinnovo con PDF allegato |
| `email/conferma_contatto.html` | 7 | Conferma ricezione richiesta contatto |
| `email/notifica_agente_richiesta_contatto.html` | 4 | Email all'agente assegnato (widget Chiamami) |
| `email/notifica_agente_rinnovo.html` | 7 | Email all'agente per nuova richiesta rinnovo |
| `email/notifica_agente_task_escalation.html` | 8 | Email all'agente per task T-50/T-40/T-35 |

### PDF (Missioni 5, 6, 10)

| File | Missione | Scopo |
|---|---|---|
| `pdf/verbale_restituzione.template.ts` | 5 | Verbale conferma restituzione (con FES) |
| `pdf/conferma_riacquisto.template.ts` | 6 | T&C di riacquisto (visualizzabili nel flusso) |
| `pdf/fattura_acconto.template.ts` | 6 | Fattura di acconto per pagamento riacquisto |
| `pdf/conferma_rinnovo.template.ts` | 7 | Conferma interesse al rinnovo |
| `pdf/audit_export.template.ts` | 10 | Export audit log con catena hash verificata |

### Script telefonici (Missione 8)

| File | Scopo |
|---|---|
| `script/script_escalation_t50.md` | Script primo tentativo telefonico a T-50 |
| `script/script_escalation_t40.md` | Script secondo tentativo telefonico a T-40 |
| `script/script_escalation_t35.md` | Script terzo tentativo (Capo Area) a T-35 |

## Convenzioni

### Email

- Lingua: **italiano**
- Formato: HTML con **inline CSS** (per massima compatibilità client email)
- Template engine: **Handlebars**
- Branding: colori NSM (primary #1a3a52, accent verde #16a34a per rinnovo)
- Footer obbligatorio con:
  - Indirizzo Smartcom Solutions
  - Recapiti (tel + email)
  - Link opt-out (diritto di opposizione GDPR)
  - Disclaimer privacy

### Variabili merge standard (handlebars)

```
{{ragione_sociale}}
{{numero_contratto_grenke}}
{{numero_contratto_nsm}}
{{data_scadenza}}
{{beni}}
{{monte_canoni}}
{{pricing_riacquisto}}
{{valore_gift_card}}
{{link_area_cliente}}
{{deadline_decisione}}
```

### PDF

- Font: Roboto o Helvetica (deve supportare accenti italiani)
- Formato: A4 portrait
- Header: logo NSM (placeholder) + titolo documento
- Footer: numero pagina, data generazione, hash SHA-256 (per documenti firmati)

### Script telefonici

- Lingua: **italiano**
- Tono: cordiale ma fermo
- **Vincolo di compliance:** lo script DEVE concentrarsi **esclusivamente** sulle 4 opzioni di fine contratto. NESSUNA proposta commerciale su altri prodotti (Smartcom Distribution, nuovi servizi, ecc.) — vedi SPECS.md sezione 11.
