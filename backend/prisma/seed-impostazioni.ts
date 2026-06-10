import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '../../config');
const templatesDir = resolve(__dirname, '../../templates');

function readTemplate(subdir: string, filename: string): string {
  const path = resolve(templatesDir, subdir, filename);
  if (existsSync(path)) return readFileSync(path, 'utf-8');
  return '';
}

function readConfig(filename: string): Record<string, unknown> {
  const path = resolve(configDir, filename);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  return {};
}

interface ImpostazioneSeed {
  chiave: string;
  valore: string;
  tipo: 'NUMERO' | 'TESTO' | 'BOOLEANO' | 'JSON' | 'HTML';
  categoria: 'TIMELINE' | 'PRICING' | 'EMAIL' | 'AREA_CLIENTE' | 'RECAPITI' | 'FEATURE_FLAGS' | 'SCRIPT_TELEFONICI';
  label: string;
  descrizione: string;
}

export async function seedImpostazioni(prisma: PrismaClient) {
  console.log('⚙️  Seeding impostazioni...');

  const timeline = readConfig('timeline.json') as { giorni_pre_scadenza: Record<string, number> };
  const pre = timeline.giorni_pre_scadenza || {};

  const impostazioni: ImpostazioneSeed[] = [
    // ─── TIMELINE ─────────────────────────────────────────────────────
    { chiave: 'timeline.comunicazione_iniziale', valore: String(pre.comunicazione_iniziale ?? 145), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Comunicazione iniziale', descrizione: 'Giorni prima della scadenza per l\'invio della comunicazione iniziale' },
    { chiave: 'timeline.sollecito_email_1', valore: String(pre.sollecito_email_1 ?? 90), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Sollecito email 1', descrizione: 'Giorni prima della scadenza per il primo sollecito email' },
    { chiave: 'timeline.sollecito_email_2', valore: String(pre.sollecito_email_2 ?? 60), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Sollecito email 2', descrizione: 'Giorni prima della scadenza per il secondo sollecito email' },
    { chiave: 'timeline.escalation_telefonica_1', valore: String(pre.escalation_telefonica_1 ?? 50), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Escalation telefonica 1', descrizione: 'Giorni prima della scadenza per la prima chiamata di escalation' },
    { chiave: 'timeline.sollecito_email_3', valore: String(pre.sollecito_email_3 ?? 45), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Sollecito email 3', descrizione: 'Giorni prima della scadenza per il terzo sollecito email' },
    { chiave: 'timeline.escalation_telefonica_2', valore: String(pre.escalation_telefonica_2 ?? 40), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Escalation telefonica 2', descrizione: 'Giorni prima della scadenza per la seconda chiamata di escalation' },
    { chiave: 'timeline.sollecito_email_4', valore: String(pre.sollecito_email_4 ?? 35), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Sollecito email 4', descrizione: 'Giorni prima della scadenza per il quarto sollecito email' },
    { chiave: 'timeline.escalation_telefonica_3', valore: String(pre.escalation_telefonica_3 ?? 35), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Escalation telefonica 3', descrizione: 'Giorni prima della scadenza per la terza chiamata (Capo Area per contratti > soglia)' },
    { chiave: 'timeline.deadline_decisione', valore: String(pre.deadline_decisione ?? 30), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Deadline decisione', descrizione: 'Giorni prima della scadenza entro cui il cliente deve decidere' },
    { chiave: 'timeline.consolidamento_lista', valore: String(pre.consolidamento_lista_riacquisti ?? 20), tipo: 'NUMERO', categoria: 'TIMELINE', label: 'Consolidamento lista riacquisti', descrizione: 'Giorni prima della scadenza per consolidare la lista riacquisti per Grenke' },

    // ─── PRICING ──────────────────────────────────────────────────────
    { chiave: 'pricing.grenke_percentuale', valore: '5', tipo: 'NUMERO', categoria: 'PRICING', label: 'Percentuale acquisto Grenke', descrizione: 'Percentuale del monte canoni per il prezzo di acquisto da Grenke' },
    { chiave: 'pricing.riacquisto_percentuale', valore: '8', tipo: 'NUMERO', categoria: 'PRICING', label: 'Percentuale riacquisto cliente', descrizione: 'Percentuale del monte canoni per il prezzo di rivendita al cliente' },
    { chiave: 'pricing.iva_percentuale', valore: '22', tipo: 'NUMERO', categoria: 'PRICING', label: 'IVA', descrizione: 'Aliquota IVA applicata al riacquisto' },
    { chiave: 'pricing.soglia_alto_valore', valore: '5000', tipo: 'NUMERO', categoria: 'PRICING', label: 'Soglia alto valore', descrizione: 'Soglia in euro oltre la quale la pratica viene assegnata al Capo Area' },
    { chiave: 'pricing.gift_card_validita_mesi', valore: '12', tipo: 'NUMERO', categoria: 'PRICING', label: 'Validita gift card (mesi)', descrizione: 'Mesi di validita della gift card Smartcom Solutions' },
    { chiave: 'pricing.gift_card_tagli', valore: JSON.stringify([25, 50, 75, 100, 125, 150, 200, 250, 300]), tipo: 'JSON', categoria: 'PRICING', label: 'Tagli gift card', descrizione: 'Tagli standard della gift card in euro' },

    // ─── FEATURE FLAGS ────────────────────────────────────────────────
    { chiave: 'flags.abilita_gift_card', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita gift card', descrizione: 'Se attivo, il sistema mostra il badge gift card nell\'area cliente per i rinnovi' },
    { chiave: 'flags.abilita_escalation_telefonica', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita escalation telefonica', descrizione: 'Se attivo, il sistema crea task di escalation telefonica per gli agenti a T-50/T-40/T-35' },
    { chiave: 'flags.abilita_widget_chiamami', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita widget Chiamami', descrizione: 'Se attivo, il widget "Chiamami" e visibile nell\'area cliente' },
    { chiave: 'flags.abilita_step_pre_pagamento', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita step pre-pagamento', descrizione: 'Se attivo, mostra lo step "Hai dubbi?" prima del pagamento nel flusso riacquisto' },
    { chiave: 'flags.abilita_solleciti_automatici', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita solleciti automatici', descrizione: 'Se attivo, lo scheduler invia automaticamente i solleciti email secondo la timeline' },
    { chiave: 'flags.abilita_riconciliazione_automatica', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Abilita riconciliazione automatica', descrizione: 'Se attivo, l\'importazione Excel riconcilia automaticamente i contratti con la piattaforma NSM' },

    // ─── RECAPITI ─────────────────────────────────────────────────────
    { chiave: 'recapiti.nome_azienda', valore: 'Noleggio Su Misura', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Nome azienda (brand)', descrizione: 'Nome commerciale visualizzato nelle comunicazioni' },
    { chiave: 'recapiti.ragione_sociale', valore: 'Smartcom Solutions Srl', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Ragione sociale', descrizione: 'Ragione sociale completa per fatture e documenti ufficiali' },
    { chiave: 'recapiti.indirizzo', valore: 'Via Tunisia 5, 10093 Collegno (TO)', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Indirizzo sede', descrizione: 'Indirizzo della sede legale' },
    { chiave: 'recapiti.piva', valore: '12711040019', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Partita IVA', descrizione: 'P.IVA aziendale per documenti fiscali' },
    { chiave: 'recapiti.telefono', valore: '011 4557949', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Telefono', descrizione: 'Numero di telefono principale' },
    { chiave: 'recapiti.email', valore: 'info@noleggiosumisura.it', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Email info', descrizione: 'Email di contatto generale' },
    { chiave: 'recapiti.email_mittente', valore: 'noreply@noleggiosumisura.it', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Email mittente', descrizione: 'Indirizzo mittente per le email automatiche' },
    { chiave: 'recapiti.nome_mittente', valore: 'Noleggio Su Misura', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Nome mittente', descrizione: 'Nome visualizzato come mittente nelle email' },

    // ─── EMAIL (HTML) ─────────────────────────────────────────────────
    { chiave: 'email.comunicazione_iniziale', valore: readTemplate('email', 'comunicazione_iniziale.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Comunicazione iniziale', descrizione: 'Template email della prima comunicazione al cliente con le 4 opzioni di fine contratto' },
    { chiave: 'email.sollecito_1', valore: readTemplate('email', 'sollecito_1.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Sollecito 1 (T-90)', descrizione: 'Template primo sollecito email' },
    { chiave: 'email.sollecito_2', valore: readTemplate('email', 'sollecito_2.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Sollecito 2 (T-60)', descrizione: 'Template secondo sollecito email' },
    { chiave: 'email.sollecito_3', valore: readTemplate('email', 'sollecito_3.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Sollecito 3 (T-45)', descrizione: 'Template terzo sollecito email' },
    { chiave: 'email.sollecito_4', valore: readTemplate('email', 'sollecito_4.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Sollecito 4 (T-35)', descrizione: 'Template quarto e ultimo sollecito email' },
    { chiave: 'email.conferma_restituzione', valore: readTemplate('email', 'conferma_restituzione.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Conferma restituzione', descrizione: 'Template email di conferma scelta restituzione beni' },
    { chiave: 'email.conferma_rinnovo', valore: readTemplate('email', 'conferma_rinnovo.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Conferma rinnovo', descrizione: 'Template email di conferma scelta rinnovo contratto' },
    { chiave: 'email.conferma_contatto', valore: readTemplate('email', 'notifica_richiesta_contatto.html'), tipo: 'HTML', categoria: 'EMAIL', label: 'Conferma contatto', descrizione: 'Template email di conferma richiesta di contatto personalizzato' },

    // ─── AREA CLIENTE ─────────────────────────────────────────────────
    { chiave: 'cliente.titolo_opzione_rinnovo', valore: 'Rinnova il contratto', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Titolo opzione rinnovo', descrizione: 'Titolo della card rinnovo nell\'area cliente' },
    { chiave: 'cliente.desc_opzione_rinnovo', valore: 'Prosegui con un nuovo contratto FLEX scegliendo dispositivi, quantita e durata in base alle tue esigenze, e ricevi un premio fedelta.', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Descrizione opzione rinnovo', descrizione: 'Testo descrittivo della card rinnovo' },
    { chiave: 'cliente.titolo_opzione_riacquisto', valore: 'Prenota l\'acquisto del bene', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Titolo opzione riacquisto', descrizione: 'Titolo della card riacquisto nell\'area cliente' },
    { chiave: 'cliente.desc_opzione_riacquisto', valore: 'Prenota l\'acquisto dei beni in locazione al prezzo di acquisto indicato. NON paghi ora! Il pagamento ti sarà richiesto 7 giorni prima della scadenza del contratto.', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Descrizione opzione riacquisto', descrizione: 'Testo descrittivo della card riacquisto' },
    { chiave: 'cliente.titolo_opzione_contatto', valore: 'Contatto personalizzato', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Titolo opzione contatto', descrizione: 'Titolo della card contatto nell\'area cliente' },
    { chiave: 'cliente.desc_opzione_contatto', valore: 'Hai dubbi o esigenze particolari? Un nostro consulente ti ricontattera.', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Descrizione opzione contatto', descrizione: 'Testo descrittivo della card contatto' },
    { chiave: 'cliente.titolo_opzione_restituzione', valore: 'Restituisci i beni', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Titolo opzione restituzione', descrizione: 'Titolo della card restituzione nell\'area cliente' },
    { chiave: 'cliente.desc_opzione_restituzione', valore: 'Concludi il contratto e restituisci i beni alla societa di leasing.', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Descrizione opzione restituzione', descrizione: 'Testo descrittivo della card restituzione' },
    { chiave: 'cliente.testo_widget_chiamami', valore: 'Hai bisogno di parlare con noi prima di decidere?', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Testo widget Chiamami', descrizione: 'Testo introduttivo del widget di richiesta contatto telefonico' },
    { chiave: 'cliente.testo_avviso_proroga', valore: 'In assenza di scelta entro la deadline, il contratto proseguira in proroga con canoni invariati per 6 mesi.', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Avviso proroga', descrizione: 'Testo dell\'avviso che informa il cliente della proroga automatica' },
    { chiave: 'cliente.testo_countdown_urgente', valore: 'Agisci ora — mancano solo [X] giorni!', tipo: 'TESTO', categoria: 'AREA_CLIENTE', label: 'Testo countdown urgente', descrizione: 'Testo visualizzato quando la deadline e vicina. [X] viene sostituito con il numero di giorni rimanenti' },

    // ─── SCRIPT TELEFONICI ────────────────────────────────────────────
    { chiave: 'script.t50', valore: readTemplate('script', 'script_escalation_t50.md'), tipo: 'TESTO', categoria: 'SCRIPT_TELEFONICI', label: 'Script T-50', descrizione: 'Script per la prima chiamata di escalation telefonica (T-50 giorni dalla scadenza)' },
    { chiave: 'script.t40', valore: readTemplate('script', 'script_escalation_t40.md'), tipo: 'TESTO', categoria: 'SCRIPT_TELEFONICI', label: 'Script T-40', descrizione: 'Script per la seconda chiamata di escalation telefonica (T-40 giorni dalla scadenza)' },
    { chiave: 'script.t35', valore: readTemplate('script', 'script_escalation_t35.md'), tipo: 'TESTO', categoria: 'SCRIPT_TELEFONICI', label: 'Script T-35', descrizione: 'Script per la terza chiamata di escalation, gestita dal Capo Area per contratti di alto valore (T-35)' },
  ];

  for (const imp of impostazioni) {
    await prisma.impostazione.upsert({
      where: { chiave: imp.chiave },
      update: {},
      create: {
        chiave: imp.chiave,
        valore: imp.valore,
        tipo: imp.tipo,
        categoria: imp.categoria,
        label: imp.label,
        descrizione: imp.descrizione,
        valore_default: imp.valore,
      },
    });
  }

  console.log(`✅ ${impostazioni.length} impostazioni create/aggiornate`);
}
