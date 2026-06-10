const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Gian Luca Ciardo — Smartcom Solutions Srl";
pres.title = "NSM EOL Grenke — Workflow Comunicazioni";

// === PALETTE ===
const C = {
  navy: "1A3A52",
  darkBlue: "0F2A3D",
  white: "FFFFFF",
  offWhite: "F8FAFC",
  lightGray: "E2E8F0",
  midGray: "94A3B8",
  textDark: "1E293B",
  textMuted: "64748B",
  green: "16A34A",
  greenBg: "DCFCE7",
  blue: "2563EB",
  blueBg: "DBEAFE",
  yellow: "D97706",
  yellowBg: "FEF3C7",
  red: "DC2626",
  redBg: "FEE2E2",
  orange: "EA580C",
  orangeBg: "FED7AA",
  teal: "0D9488",
  tealBg: "CCFBF1",
};

const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.10 });

// Helper: section header slide
function addSectionSlide(title, subtitle) {
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.darkBlue, transparency: 40 } });
  s.addText(title, { x: 0.8, y: 1.5, w: 8.4, h: 1.5, fontSize: 36, fontFace: "Georgia", color: C.white, bold: true, align: "left", margin: 0 });
  if (subtitle) {
    s.addText(subtitle, { x: 0.8, y: 3.1, w: 8.4, h: 0.8, fontSize: 16, fontFace: "Calibri", color: C.midGray, align: "left", margin: 0 });
  }
  return s;
}

// Helper: content slide
function addContentSlide(title) {
  const s = pres.addSlide();
  s.background = { color: C.offWhite };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.9, fill: { color: C.navy } });
  s.addText(title, { x: 0.6, y: 0.1, w: 8.8, h: 0.7, fontSize: 18, fontFace: "Georgia", color: C.white, bold: true, margin: 0 });
  s.addText("NSM EOL Grenke", { x: 0.6, y: 5.2, w: 4, h: 0.3, fontSize: 9, fontFace: "Calibri", color: C.midGray, margin: 0 });
  return s;
}

// Helper: card with left accent
function addCard(slide, x, y, w, h, accentColor, title, bodyLines) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.white }, shadow: makeShadow() });
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h, fill: { color: accentColor } });
  if (title) {
    slide.addText(title, { x: x + 0.2, y: y + 0.08, w: w - 0.3, h: 0.35, fontSize: 12, fontFace: "Calibri", color: C.textDark, bold: true, margin: 0 });
  }
  if (bodyLines && bodyLines.length) {
    const textArr = bodyLines.map((line, i) => ({
      text: line,
      options: { fontSize: 10, fontFace: "Calibri", color: C.textMuted, bullet: true, ...(i < bodyLines.length - 1 ? { breakLine: true } : {}) }
    }));
    slide.addText(textArr, { x: x + 0.2, y: y + (title ? 0.4 : 0.1), w: w - 0.35, h: h - (title ? 0.5 : 0.2), margin: 0, valign: "top" });
  }
}

// ========================================
// SLIDE 1: TITLE
// ========================================
const s1 = pres.addSlide();
s1.background = { color: C.navy };
s1.addText("Workflow EOL Grenke", { x: 0.8, y: 1.2, w: 8.4, h: 1.4, fontSize: 40, fontFace: "Georgia", color: C.white, bold: true, margin: 0 });
s1.addText("Comunicazioni, Template Email e Escalation Telefoniche", { x: 0.8, y: 2.6, w: 8.4, h: 0.6, fontSize: 18, fontFace: "Calibri", color: C.midGray, margin: 0 });
s1.addText("Smartcom Solutions Srl / Noleggio Su Misura", { x: 0.8, y: 3.6, w: 8.4, h: 0.4, fontSize: 14, fontFace: "Calibri", color: C.teal, margin: 0 });
s1.addText("Maggio 2026", { x: 0.8, y: 4.3, w: 8.4, h: 0.3, fontSize: 12, fontFace: "Calibri", color: C.midGray, margin: 0 });

// ========================================
// SLIDE 2: OVERVIEW
// ========================================
const s2 = addContentSlide("Overview del progetto");
s2.addText("Gestione End Of Lease dei contratti FLEX Grenke", { x: 0.6, y: 1.1, w: 8.8, h: 0.5, fontSize: 16, fontFace: "Georgia", color: C.textDark, bold: true, margin: 0 });
s2.addText("Smartcom Solutions, tramite il brand Noleggio Su Misura, gestisce la fase di fine contratto dei leasing FLEX Grenke. Il workflow automatizza comunicazioni, decisioni cliente e pagamenti.", { x: 0.6, y: 1.6, w: 8.8, h: 0.7, fontSize: 12, fontFace: "Calibri", color: C.textMuted, margin: 0 });

addCard(s2, 0.6, 2.5, 4.15, 1.2, C.red, "Problema critico", [
  "Silenzio cliente = perdita DEFINITIVA",
  "Proroga Grenke 6 mesi, poi disintermediazione",
  "Ogni 1% di silenzio = margine perso irreversibilmente"
]);
addCard(s2, 5.25, 2.5, 4.15, 1.2, C.green, "Obiettivo", [
  "Tasso di non-silenzio > 85% (KPI #1)",
  "Tasso rinnovo > 35%",
  "Tasso riacquisto > 30%"
]);
addCard(s2, 0.6, 3.9, 8.8, 1.1, C.blue, "Come funziona", [
  "4 solleciti email progressivi + 3 escalation telefoniche manuali",
  "Area self-service con 4 opzioni (rinnovo, riacquisto, contatto, restituzione)",
  "Pagamento riacquisto differito a T-7 (non immediato) per incentivare decisione anticipata"
]);

// ========================================
// SLIDE 3: TIMELINE
// ========================================
const s3 = addContentSlide("Timeline operativa (T-145 / T+30)");

const timelineEvents = [
  { t: "T-150", label: "Grenke invia lettera scadenza al cliente", color: C.midGray },
  { t: "T-145", label: "NSM importa lista + invio comunicazione iniziale", color: C.navy },
  { t: "T-90", label: "Sollecito email 1 (gentile reminder)", color: C.blue },
  { t: "T-60", label: "Sollecito email 2 (enfasi rinnovo)", color: C.blue },
  { t: "T-50", label: "Escalation telefonica 1 (agente)", color: C.orange },
  { t: "T-45", label: "Sollecito email 3 (urgenza)", color: C.yellow },
  { t: "T-40", label: "Escalation telefonica 2 (agente)", color: C.orange },
  { t: "T-35", label: "Sollecito email 4 (ULTIMO) + Escalation tel. 3", color: C.red },
  { t: "T-30", label: "DEADLINE decisione (silenzio = perdita)", color: C.red },
  { t: "T-7", label: "Invio link pagamento riacquisto", color: C.teal },
  { t: "T-20", label: "Lista riacquisti a Grenke", color: C.navy },
  { t: "T0", label: "Scadenza contratto", color: C.textDark },
  { t: "T+11", label: "Trasferimento proprietà a Smartcom", color: C.green },
];

const startY = 1.15;
const rowH = 0.32;
timelineEvents.forEach((ev, i) => {
  const y = startY + i * rowH;
  s3.addShape(pres.shapes.RECTANGLE, { x: 0.6, y, w: 1.0, h: 0.26, fill: { color: ev.color } });
  s3.addText(ev.t, { x: 0.6, y, w: 1.0, h: 0.26, fontSize: 9, fontFace: "Calibri", color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
  s3.addText(ev.label, { x: 1.8, y, w: 7.5, h: 0.26, fontSize: 10, fontFace: "Calibri", color: C.textDark, valign: "middle", margin: 0 });
});

// ========================================
// SLIDE 4: I 4 FLUSSI PRINCIPALI
// ========================================
const s4 = addContentSlide("Le 4 opzioni del cliente");

const options = [
  { icon: "1", title: "Rinnova con nuovo FLEX", desc: "Nuovo contratto su device aggiornato.\nGift card Smartcom proporzionale al margine.\nAgente contatta entro 5 gg lavorativi.", color: C.green, badge: "Consigliata" },
  { icon: "2", title: "Acquista il bene (riacquisto)", desc: "Prezzo: 8% del monte canoni + IVA.\nPagamento differito a T-7 (non immediato).\nFattura di acconto + saldo a T+11.", color: C.blue, badge: "Self-service" },
  { icon: "3", title: "Contatto personalizzato", desc: "Il cliente chiede di essere richiamato.\nAssegnazione automatica ad agente.\nNon vincolante (no OTP).", color: C.yellow, badge: "Follow-up" },
  { icon: "4", title: "Restituisci il bene", desc: "Reso a Grenke con 5 step obbligatori:\nDisattiva Find My, reset, check, imballo, spedizione.", color: C.red, badge: "Residuale" },
];

options.forEach((opt, i) => {
  const x = 0.6 + i * 2.3;
  const y = 1.15;
  pres.addSlide; // just spacing ref
  s4.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.1, h: 4.0, fill: { color: C.white }, shadow: makeShadow() });
  s4.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.1, h: 0.55, fill: { color: opt.color } });
  s4.addText(`Opzione ${opt.icon}`, { x, y: y + 0.02, w: 2.1, h: 0.28, fontSize: 10, fontFace: "Calibri", color: C.white, align: "center", margin: 0 });
  s4.addText(opt.badge, { x, y: y + 0.28, w: 2.1, h: 0.22, fontSize: 8, fontFace: "Calibri", color: C.white, align: "center", margin: 0, bold: true });
  s4.addText(opt.title, { x: x + 0.12, y: y + 0.65, w: 1.86, h: 0.55, fontSize: 12, fontFace: "Georgia", color: C.textDark, bold: true, margin: 0, valign: "top" });
  s4.addText(opt.desc, { x: x + 0.12, y: y + 1.2, w: 1.86, h: 2.6, fontSize: 10, fontFace: "Calibri", color: C.textMuted, margin: 0, valign: "top" });
});

// ========================================
// SLIDE 5: FLUSSO RIACQUISTO DIFFERITO
// ========================================
const s5 = addContentSlide("Flusso riacquisto — Pagamento differito T-7");

s5.addText("Il pagamento NON avviene al momento della decisione ma 7 giorni prima della scadenza", { x: 0.6, y: 1.1, w: 8.8, h: 0.45, fontSize: 13, fontFace: "Calibri", color: C.textDark, bold: true, margin: 0 });

const steps = [
  { n: "1", label: "Cliente conferma\nriacquisto (T&C + OTP)", sub: "In qualsiasi momento", color: C.blue },
  { n: "2", label: "Stato:\nIN_CORSO", sub: "Pagamento non richiesto", color: C.yellow },
  { n: "3", label: "T-7: Email invito\npagamento", sub: "Scheduler automatico", color: C.orange },
  { n: "4", label: "Cliente paga\n(Fabrick / Stripe)", sub: "Fattura di acconto", color: C.green },
  { n: "5", label: "T+11: Trasferimento\nproprietà", sub: "Fattura di saldo", color: C.teal },
];

steps.forEach((step, i) => {
  const x = 0.4 + i * 1.9;
  const y = 1.8;
  s5.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.7, h: 2.0, fill: { color: C.white }, shadow: makeShadow() });
  s5.addShape(pres.shapes.OVAL, { x: x + 0.6, y: y - 0.2, w: 0.5, h: 0.5, fill: { color: step.color } });
  s5.addText(step.n, { x: x + 0.6, y: y - 0.2, w: 0.5, h: 0.5, fontSize: 16, fontFace: "Calibri", color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
  s5.addText(step.label, { x: x + 0.08, y: y + 0.4, w: 1.54, h: 0.8, fontSize: 11, fontFace: "Calibri", color: C.textDark, bold: true, align: "center", valign: "top", margin: 0 });
  s5.addText(step.sub, { x: x + 0.08, y: y + 1.3, w: 1.54, h: 0.5, fontSize: 9, fontFace: "Calibri", color: C.textMuted, align: "center", valign: "top", margin: 0 });
  if (i < steps.length - 1) {
    s5.addShape(pres.shapes.LINE, { x: x + 1.75, y: y + 0.9, w: 0.15, h: 0, line: { color: C.midGray, width: 1.5 } });
  }
});

s5.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 4.2, w: 8.8, h: 0.7, fill: { color: C.tealBg } });
s5.addText("Se mancano meno di 7 giorni alla scadenza, il pagamento procede immediatamente come prima. Parametro configurabile in config/timeline.json.", { x: 0.8, y: 4.25, w: 8.4, h: 0.6, fontSize: 10, fontFace: "Calibri", color: C.teal, margin: 0 });

// ========================================
// SECTION: COMUNICAZIONI AL CLIENTE
// ========================================
addSectionSlide("Comunicazioni al Cliente", "11 template email inviati al Conduttore nelle varie fasi del workflow");

// ========================================
// SLIDE 6: COMUNICAZIONE INIZIALE
// ========================================
const s6 = addContentSlide("1. Comunicazione iniziale (T-145)");
s6.addText("Prima email al cliente dopo importazione lista Grenke", { x: 0.6, y: 1.05, w: 8.8, h: 0.35, fontSize: 12, fontFace: "Calibri", color: C.textMuted, margin: 0 });

addCard(s6, 0.6, 1.5, 4.3, 3.5, C.navy, "Contenuto email", [
  "Oggetto: Il tuo contratto NSM n. [NUM] in scadenza",
  "Presenta le 4 opzioni con colori (verde/blu/giallo/rosso)",
  "Elenco beni del contratto",
  "Prezzo riacquisto e valore gift card rinnovo",
  "CTA: bottone \"SCEGLI LA TUA OPZIONE\" (link JWT)",
  "Warning arancione: senza scelta = proroga 6 mesi",
  "Link opt-out in footer"
]);

addCard(s6, 5.1, 1.5, 4.3, 3.5, C.textMuted, "Variabili merge (Handlebars)", [
  "{{ragione_sociale}} — nome azienda",
  "{{numero_contratto_grenke}} / {{numero_contratto_nsm}}",
  "{{data_scadenza}} — scadenza contratto",
  "{{beni}} — elenco beni con marca/modello",
  "{{valore_gift_card}} — calcolata sul margine",
  "{{pricing_riacquisto}} — 8% del monte canoni",
  "{{deadline_decisione}} — T-30",
  "{{{link_area_cliente}}} / {{{link_opt_out}}}"
]);

// ========================================
// SLIDE 7: I 4 SOLLECITI
// ========================================
const s7 = addContentSlide("2-5. Solleciti progressivi (T-90 / T-60 / T-45 / T-35)");

const solleciti = [
  { n: "T-90", title: "Sollecito 1", tone: "Gentile reminder", detail: "Tono neutro. Riepilogo delle 4 opzioni. CTA blu.", color: C.blue },
  { n: "T-60", title: "Sollecito 2", tone: "Enfasi rinnovo", detail: "Box verde per il rinnovo con gift card. CTA verde. Le altre opzioni in secondo piano.", color: C.green },
  { n: "T-45", title: "Sollecito 3", tone: "Urgenza", detail: "Warning arancione deadline. Elenco opzioni conciso. CTA arancione.", color: C.orange },
  { n: "T-35", title: "Sollecito 4 (ULTIMO)", tone: "Ultima possibilita'", detail: "Header ROSSO. Box critico proroga 6 mesi. CTA rossa \"SCEGLI ORA\". Deadline in rosso grassetto.", color: C.red },
];

solleciti.forEach((sol, i) => {
  const x = 0.6 + i * 2.3;
  s7.addShape(pres.shapes.RECTANGLE, { x, y: 1.15, w: 2.1, h: 3.8, fill: { color: C.white }, shadow: makeShadow() });
  s7.addShape(pres.shapes.RECTANGLE, { x, y: 1.15, w: 2.1, h: 0.5, fill: { color: sol.color } });
  s7.addText(sol.n, { x, y: 1.15, w: 2.1, h: 0.25, fontSize: 10, fontFace: "Calibri", color: C.white, bold: true, align: "center", margin: 0 });
  s7.addText(sol.title, { x, y: 1.38, w: 2.1, h: 0.25, fontSize: 9, fontFace: "Calibri", color: C.white, align: "center", margin: 0 });
  s7.addText(sol.tone, { x: x + 0.1, y: 1.75, w: 1.9, h: 0.35, fontSize: 12, fontFace: "Georgia", color: C.textDark, bold: true, margin: 0 });
  s7.addText(sol.detail, { x: x + 0.1, y: 2.2, w: 1.9, h: 2.5, fontSize: 10, fontFace: "Calibri", color: C.textMuted, margin: 0, valign: "top" });
});

// ========================================
// SLIDE 8: CONFERME (rinnovo, riacquisto, restituzione)
// ========================================
const s8 = addContentSlide("6-7-11. Email di conferma decisione");

addCard(s8, 0.6, 1.15, 2.8, 3.8, C.green, "Conferma Rinnovo", [
  "Heading: Richiesta di rinnovo ricevuta",
  "Tabella pre-qualificazione: tipo device, quantita', durata, budget",
  "Banner verde con valore gift card",
  "Prossimi passi: agente contatta entro 5 gg lav.",
  "PDF conferma in allegato"
]);

addCard(s8, 3.6, 1.15, 2.8, 3.8, C.blue, "Conferma Riacquisto", [
  "Heading: Pagamento completato con successo",
  "Tabella: netto, IVA 22%, totale, metodo, n. fattura",
  "Box prossimi passi: fattura SDI + trasferimento T+11",
  "PDF ricevuta in allegato"
]);

addCard(s8, 6.6, 1.15, 2.8, 3.8, C.red, "Conferma Restituzione", [
  "Heading: Conferma restituzione beni",
  "Tabella riepilogo contratto e beni",
  "5 step obbligatori:",
  "  1. Disattiva Find My / Knox",
  "  2. Factory reset",
  "  3. Integrity check",
  "  4. Imballo originale",
  "  5. Spedizione a Smartcom",
  "Warning: addebiti se reso non conforme"
]);

// ========================================
// SLIDE 9: TEMPLATE PAGAMENTO
// ========================================
const s9 = addContentSlide("8-9-10. Email ciclo pagamento");

addCard(s9, 0.6, 1.15, 2.8, 3.8, C.teal, "Invito Pagamento (T-7)", [
  "Heading: Completa il riacquisto del bene",
  "Inviata dallo scheduler a T-7",
  "Tabella: prezzo netto, IVA 22%, totale",
  "Elenco beni del contratto",
  "CTA: Procedi con il pagamento (bottone blu)",
  "Link diretto alla pagina di pagamento"
]);

addCard(s9, 3.6, 1.15, 2.8, 3.8, C.blue, "Sblocco Pagamento", [
  "Heading: Pagamento sbloccato",
  "Inviata dopo chiamata con consulente",
  "Per clienti che avevano scelto \"contattatemi prima\"",
  "Messaggio breve e diretto",
  "CTA: Procedi con il pagamento (bottone blu)",
  "Link alla pagina di pagamento"
]);

addCard(s9, 6.6, 1.15, 2.8, 3.8, C.red, "Fallimento Pagamento", [
  "Heading: Pagamento non riuscito (rosso)",
  "Box rosso con importo e metodo falliti",
  "Conferma: nessun addebito effettuato",
  "CTA: Riprova il pagamento (bottone blu)",
  "Link per ritentare"
]);

// ========================================
// SECTION: NOTIFICHE INTERNE
// ========================================
addSectionSlide("Notifiche interne (Agenti / Backoffice)", "4 template email per agenti NSM e backoffice operativo");

// ========================================
// SLIDE 10: NOTIFICHE AGENTE
// ========================================
const s10 = addContentSlide("12-14. Notifiche agente");

addCard(s10, 0.6, 1.15, 2.8, 3.5, C.yellow, "Richiesta contatto (widget)", [
  "Notifica interna quando cliente usa il widget \"Chiamami\"",
  "Tabella: ragione sociale, contratto, referente, telefono, giorno/fascia oraria",
  "Monte canoni visibile",
  "SLA: richiamare entro 24h lavorative"
]);

addCard(s10, 3.6, 1.15, 2.8, 3.5, C.green, "Notifica rinnovo", [
  "Notifica quando cliente sceglie \"Rinnova\"",
  "Banner: Da contattare entro 5 gg lavorativi",
  "Dati cliente + pre-qualificazione (device, quantita', durata, budget)",
  "Valore gift card evidenziato",
  "Motivo assegnazione"
]);

addCard(s10, 6.6, 1.15, 2.8, 3.5, C.yellow, "Contatto personalizzato", [
  "Notifica quando cliente sceglie Opzione 3",
  "Dati cliente + preferenze di contatto",
  "Fascia oraria e modalita' preferita",
  "Note libere del cliente",
  "Motivo assegnazione"
]);

// ========================================
// SLIDE 11: ESCALATION TELEFONICA
// ========================================
addSectionSlide("Escalation telefoniche", "3 livelli di escalation per contrastare il silenzio cliente");

const s11 = addContentSlide("15. Template escalation telefonica");

addCard(s11, 0.6, 1.15, 4.3, 1.6, C.orange, "Struttura della notifica agente", [
  "Badge priorita' dinamico (colore basato su urgenza)",
  "Dati cliente: ragione sociale, referente, telefono cliccabile, email",
  "Dati contratto: numeri NSM/Grenke, scadenza, monte canoni, beni",
  "Storico comunicazioni (loop Handlebars con data, tipo, esito)"
]);

addCard(s11, 5.1, 1.15, 4.3, 1.6, C.navy, "Script di chiamata integrato", [
  "Script standardizzato nel box blu",
  "Focus SOLO su opzioni fine contratto (no derive commerciali)",
  "Coerente con inquadramento GDPR art. 6.1.b",
  "CTA: \"APRI IL TASK NEL BACKOFFICE\" + link diretto"
]);

// Escalation table
const escRows = [
  [
    { text: "Momento", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, fontFace: "Calibri" } },
    { text: "Responsabile", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, fontFace: "Calibri" } },
    { text: "Trigger", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, fontFace: "Calibri" } },
    { text: "Esiti possibili", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10, fontFace: "Calibri" } },
  ],
  [
    { text: "T-50", options: { fontSize: 10, fontFace: "Calibri", bold: true } },
    { text: "Agente assegnato", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Pratica in IN_ATTESA_DECISIONE", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Risposta positiva / negativa / non raggiunto / richiamare", options: { fontSize: 10, fontFace: "Calibri" } },
  ],
  [
    { text: "T-40", options: { fontSize: 10, fontFace: "Calibri", bold: true } },
    { text: "Agente assegnato", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Ancora in attesa dopo T-50", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Idem", options: { fontSize: 10, fontFace: "Calibri" } },
  ],
  [
    { text: "T-35", options: { fontSize: 10, fontFace: "Calibri", bold: true, color: C.red } },
    { text: "Capo Area (>5.000 EUR)\no Agente", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Ancora in attesa dopo T-40\nULTIMO tentativo", options: { fontSize: 10, fontFace: "Calibri" } },
    { text: "Idem + se negativa/silenzio:\nSILENZIO_PERDITA_DEFINITIVA a T-30", options: { fontSize: 10, fontFace: "Calibri" } },
  ],
];

s11.addTable(escRows, {
  x: 0.6, y: 3.0, w: 8.8,
  colW: [1.2, 2.0, 2.8, 2.8],
  border: { pt: 0.5, color: C.lightGray },
  rowH: [0.35, 0.4, 0.4, 0.55],
});

// ========================================
// SLIDE 12: MAPPA COMPLETA COMUNICAZIONI
// ========================================
const s12 = addContentSlide("Mappa completa: 15 comunicazioni nel workflow");

const comms = [
  { n: "1", name: "Comunicazione iniziale", when: "T-145", to: "Cliente", color: C.navy },
  { n: "2", name: "Sollecito 1", when: "T-90", to: "Cliente", color: C.blue },
  { n: "3", name: "Sollecito 2", when: "T-60", to: "Cliente", color: C.blue },
  { n: "4", name: "Sollecito 3", when: "T-45", to: "Cliente", color: C.yellow },
  { n: "5", name: "Sollecito 4 (ULTIMO)", when: "T-35", to: "Cliente", color: C.red },
  { n: "6", name: "Conferma rinnovo", when: "Post-scelta", to: "Cliente", color: C.green },
  { n: "7", name: "Conferma riacquisto", when: "Post-pagamento", to: "Cliente", color: C.green },
  { n: "8", name: "Invito pagamento", when: "T-7", to: "Cliente", color: C.teal },
  { n: "9", name: "Sblocco pagamento", when: "Post-chiamata", to: "Cliente", color: C.blue },
  { n: "10", name: "Fallimento pagamento", when: "Errore pay", to: "Cliente", color: C.red },
  { n: "11", name: "Conferma restituzione", when: "Post-scelta", to: "Cliente", color: C.green },
  { n: "12", name: "Notifica richiesta contatto", when: "Widget/Opz.3", to: "Agente", color: C.yellow },
  { n: "13", name: "Notifica agente rinnovo", when: "Post-scelta", to: "Agente", color: C.yellow },
  { n: "14", name: "Notifica agente contatto", when: "Post-scelta", to: "Agente", color: C.yellow },
  { n: "15", name: "Notifica escalation tel.", when: "T-50/40/35", to: "Agente", color: C.orange },
];

const tableRows = [
  [
    { text: "#", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 9, fontFace: "Calibri" } },
    { text: "Template", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 9, fontFace: "Calibri" } },
    { text: "Quando", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 9, fontFace: "Calibri" } },
    { text: "A chi", options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 9, fontFace: "Calibri" } },
  ],
];

comms.forEach((c) => {
  tableRows.push([
    { text: c.n, options: { fontSize: 9, fontFace: "Calibri", bold: true, color: c.color } },
    { text: c.name, options: { fontSize: 9, fontFace: "Calibri", color: C.textDark } },
    { text: c.when, options: { fontSize: 9, fontFace: "Calibri", color: C.textMuted } },
    { text: c.to, options: { fontSize: 9, fontFace: "Calibri", color: c.to === "Agente" ? C.yellow : C.blue, bold: true } },
  ]);
});

s12.addTable(tableRows, {
  x: 0.6, y: 1.1, w: 8.8,
  colW: [0.5, 4.0, 2.2, 2.1],
  border: { pt: 0.5, color: C.lightGray },
  rowH: Array(16).fill(0.27),
});

// ========================================
// SLIDE 13: CLOSING
// ========================================
const sEnd = pres.addSlide();
sEnd.background = { color: C.navy };
sEnd.addText("Riepilogo", { x: 0.8, y: 0.8, w: 8.4, h: 0.8, fontSize: 32, fontFace: "Georgia", color: C.white, bold: true, margin: 0 });

const bullets = [
  { text: "15 comunicazioni totali (11 al cliente + 4 interne)", options: { bullet: true, breakLine: true, fontSize: 14, fontFace: "Calibri", color: C.white } },
  { text: "4 solleciti email con escalation visiva progressiva (blu > verde > arancio > rosso)", options: { bullet: true, breakLine: true, fontSize: 14, fontFace: "Calibri", color: C.white } },
  { text: "3 escalation telefoniche manuali (T-50, T-40, T-35) con script standardizzato", options: { bullet: true, breakLine: true, fontSize: 14, fontFace: "Calibri", color: C.white } },
  { text: "Pagamento riacquisto differito a T-7 per incentivare decisione anticipata", options: { bullet: true, breakLine: true, fontSize: 14, fontFace: "Calibri", color: C.white } },
  { text: "KPI #1: tasso di non-silenzio > 85%", options: { bullet: true, fontSize: 14, fontFace: "Calibri", color: C.teal, bold: true } },
];
sEnd.addText(bullets, { x: 0.8, y: 1.8, w: 8.4, h: 3.0, margin: 0 });

sEnd.addText("Smartcom Solutions Srl / Noleggio Su Misura — Maggio 2026", { x: 0.8, y: 4.8, w: 8.4, h: 0.4, fontSize: 11, fontFace: "Calibri", color: C.midGray, margin: 0 });

// ========================================
// WRITE FILE
// ========================================
const outputPath = "/Users/gianlucaciardo/Desktop/Borsa/EOL Grenke/NSM_EOL_Grenke_Workflow_Comunicazioni.pptx";
pres.writeFile({ fileName: outputPath }).then(() => {
  console.log("Presentazione generata: " + outputPath);
}).catch(err => {
  console.error("Errore:", err);
});
