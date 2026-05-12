import cron from 'node-cron';
import Handlebars from 'handlebars';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SmtpEmailProvider } from '../providers/notification/email.provider.js';
import { registraEvento } from './audit.service.js';
import { prisma } from '../lib/db.js';
import * as configService from './config.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const emailProvider = new SmtpEmailProvider();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = `http://localhost:${process.env.PORT || 3001}`;

async function loadTemplateFromDb(chiaveEmail: string): Promise<HandlebarsTemplateDelegate> {
  const html = await configService.getHtml(chiaveEmail);
  if (html) return Handlebars.compile(html);
  const name = chiaveEmail.replace('email.', '');
  const templatePath = resolve(__dirname, `../../../templates/email/${name}.html`);
  return Handlebars.compile(readFileSync(templatePath, 'utf-8'));
}

async function loadScriptFromDb(chiaveScript: string): Promise<string> {
  const text = await configService.getTesto(chiaveScript);
  if (text) return text;
  const name = chiaveScript.replace('script.', 'script_escalation_');
  const scriptPath = resolve(__dirname, `../../../templates/script/${name}.md`);
  return readFileSync(scriptPath, 'utf-8');
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function diffDays(scadenza: Date, oggi: Date): number {
  const diffMs = startOfDay(scadenza).getTime() - startOfDay(oggi).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

interface SollecitoEntry { tipo: string; emailKey: string; timelineKey: string; numero: number }
interface EscalationEntry { tipo: string; scriptKey: string; timelineKey: string }

const SOLLECITO_DEFS: SollecitoEntry[] = [
  { tipo: 'SOLLECITO_1', emailKey: 'email.sollecito_1', timelineKey: 'timeline.sollecito_email_1', numero: 1 },
  { tipo: 'SOLLECITO_2', emailKey: 'email.sollecito_2', timelineKey: 'timeline.sollecito_email_2', numero: 2 },
  { tipo: 'SOLLECITO_3', emailKey: 'email.sollecito_3', timelineKey: 'timeline.sollecito_email_3', numero: 3 },
  { tipo: 'SOLLECITO_4', emailKey: 'email.sollecito_4', timelineKey: 'timeline.sollecito_email_4', numero: 4 },
];

const ESCALATION_DEFS: EscalationEntry[] = [
  { tipo: 'T_50', scriptKey: 'script.t50', timelineKey: 'timeline.escalation_telefonica_1' },
  { tipo: 'T_40', scriptKey: 'script.t40', timelineKey: 'timeline.escalation_telefonica_2' },
  { tipo: 'T_35', scriptKey: 'script.t35', timelineKey: 'timeline.escalation_telefonica_3' },
];

export interface SchedulerReport {
  data_esecuzione: string;
  pratiche_analizzate: number;
  solleciti_inviati: number;
  solleciti_skippati: number;
  escalation_creati: number;
  escalation_skippati: number;
  silenzio_marcati: number;
  errori: string[];
}

export async function runScheduler(referenceDate?: Date): Promise<SchedulerReport> {
  const oggi = referenceDate || new Date();
  const inizioGiornata = startOfDay(oggi);

  const report: SchedulerReport = {
    data_esecuzione: oggi.toISOString(),
    pratiche_analizzate: 0,
    solleciti_inviati: 0,
    solleciti_skippati: 0,
    escalation_creati: 0,
    escalation_skippati: 0,
    silenzio_marcati: 0,
    errori: [],
  };

  const SOLLECITO_MAP = new Map<number, SollecitoEntry & { compiledTemplate: HandlebarsTemplateDelegate }>();
  const ESCALATION_MAP = new Map<number, EscalationEntry & { scriptText: string }>();
  let notificaAgenteTemplate: HandlebarsTemplateDelegate;
  let deadlineGiorni: number;

  try {
    for (const def of SOLLECITO_DEFS) {
      const giorni = await configService.getNumero(def.timelineKey);
      const tpl = await loadTemplateFromDb(def.emailKey);
      SOLLECITO_MAP.set(giorni, { ...def, compiledTemplate: tpl });
    }
    notificaAgenteTemplate = await loadTemplateFromDb('email.notifica_agente_escalation');
    for (const def of ESCALATION_DEFS) {
      const giorni = await configService.getNumero(def.timelineKey);
      const scriptText = await loadScriptFromDb(def.scriptKey);
      ESCALATION_MAP.set(giorni, { ...def, scriptText });
    }
    deadlineGiorni = await configService.getNumero('timeline.deadline_decisione', 30);
  } catch (err) {
    const msg = `Errore caricamento template: ${err instanceof Error ? err.message : String(err)}`;
    report.errori.push(msg);
    console.error(`[Scheduler] ${msg}`);
    return report;
  }

  const pratiche = await prisma.contratto_EOL.findMany({
    where: {
      stato: { in: ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE'] },
    },
    include: {
      cliente: true,
      agente_assegnato: true,
      decisioni: true,
      comunicazioni: { orderBy: { data_invio: 'desc' } },
    },
  });

  report.pratiche_analizzate = pratiche.length;
  console.log(`[Scheduler] ${pratiche.length} pratiche da analizzare (data di riferimento: ${formatDate(oggi)})`);

  for (const pratica of pratiche) {
    const giorni = diffDays(pratica.data_scadenza, oggi);
    console.log(`[Scheduler] Pratica ${pratica.contratto_nsm_id}: ${giorni} giorni a scadenza`);

    // --- SOLLECITI EMAIL ---
    const sollecitoCfg = SOLLECITO_MAP.get(giorni);
    if (sollecitoCfg) {
      if (pratica.cliente.opt_out_comunicazioni) {
        console.log(`[Scheduler] Skip sollecito ${sollecitoCfg.tipo} per ${pratica.contratto_nsm_id}: opt-out`);
        report.solleciti_skippati++;
      } else {
        const giàInviato = await prisma.comunicazione.findFirst({
          where: {
            contratto_eol_id: pratica.id,
            tipo: sollecitoCfg.tipo,
            data_invio: { gte: inizioGiornata },
          },
        });

        if (giàInviato) {
          console.log(`[Scheduler] Skip sollecito ${sollecitoCfg.tipo} per ${pratica.contratto_nsm_id}: già inviato oggi`);
          report.solleciti_skippati++;
        } else {
          try {
            await inviaSollecito(pratica, { tipo: sollecitoCfg.tipo, template: sollecitoCfg.emailKey, numero: sollecitoCfg.numero }, sollecitoCfg.compiledTemplate);
            report.solleciti_inviati++;
          } catch (err) {
            const msg = `Errore sollecito ${sollecitoCfg.tipo} per ${pratica.contratto_nsm_id}: ${err instanceof Error ? err.message : String(err)}`;
            report.errori.push(msg);
            console.error(`[Scheduler] ${msg}`);
          }
        }
      }
    }

    // --- ESCALATION TELEFONICA ---
    const escalationCfg = ESCALATION_MAP.get(giorni);
    if (escalationCfg) {
      const giàCreato = await prisma.task_Escalation.findFirst({
        where: {
          contratto_eol_id: pratica.id,
          tipo: escalationCfg.tipo,
        },
      });

      if (giàCreato) {
        console.log(`[Scheduler] Skip escalation ${escalationCfg.tipo} per ${pratica.contratto_nsm_id}: già esistente`);
        report.escalation_skippati++;
      } else {
        try {
          await creaEscalation(
            pratica,
            { tipo: escalationCfg.tipo, script: escalationCfg.scriptKey },
            escalationCfg.scriptText,
            notificaAgenteTemplate!,
          );
          report.escalation_creati++;
        } catch (err) {
          const msg = `Errore escalation ${escalationCfg.tipo} per ${pratica.contratto_nsm_id}: ${err instanceof Error ? err.message : String(err)}`;
          report.errori.push(msg);
          console.error(`[Scheduler] ${msg}`);
        }
      }
    }

    // --- DEADLINE SILENZIO ---
    if (giorni <= deadlineGiorni) {
      if (pratica.decisioni.length === 0) {
        const giàMarcato = pratica.stato === 'SILENZIO_PERDITA_DEFINITIVA';
        if (!giàMarcato) {
          try {
            await marcaSilenzio(pratica);
            report.silenzio_marcati++;
          } catch (err) {
            const msg = `Errore silenzio per ${pratica.contratto_nsm_id}: ${err instanceof Error ? err.message : String(err)}`;
            report.errori.push(msg);
            console.error(`[Scheduler] ${msg}`);
          }
        }
      }
    }
  }

  console.log(`[Scheduler] Completato: ${report.solleciti_inviati} solleciti, ${report.escalation_creati} escalation, ${report.silenzio_marcati} silenzio, ${report.errori.length} errori`);
  return report;
}

async function inviaSollecito(
  pratica: any,
  cfg: { tipo: string; template: string; numero: number },
  template: HandlebarsTemplateDelegate,
): Promise<void> {
  const dataScadenza = new Date(pratica.data_scadenza);
  const deadlineMs = dataScadenza.getTime() - JWT_EXPIRES_OFFSET_DAYS * 24 * 60 * 60 * 1000;
  const deadline = new Date(deadlineMs);

  const optOutToken = jwt.sign(
    { cliente_id: pratica.cliente_id, action: 'opt-out' },
    JWT_SECRET,
    { expiresIn: '365d' },
  );

  const beni = pratica.beni_json ? JSON.parse(pratica.beni_json) : [];
  const beniFormatted = beni.map((b: { descrizione?: string }) => b.descrizione || 'N/D').join(', ');

  const linkAreaCliente = pratica.token_accesso_cliente
    ? `${FRONTEND_URL}/pratica/${pratica.token_accesso_cliente}`
    : FRONTEND_URL;

  const templateVars = {
    ragione_sociale: pratica.cliente.ragione_sociale,
    numero_contratto_nsm: pratica.contratto_nsm_id,
    numero_contratto_grenke: pratica.contratto_grenke_id,
    data_scadenza: formatDate(dataScadenza),
    beni: beniFormatted || 'Beni come da contratto',
    monte_canoni: formatEur(Number(pratica.monte_canoni)),
    pricing_riacquisto: formatEur(Number(pratica.pricing_riacquisto)),
    valore_gift_card: formatEur(Number(pratica.valore_gift_card)),
    link_area_cliente: linkAreaCliente,
    deadline_decisione: formatDate(deadline),
    link_opt_out: `${BACKEND_URL}/api/clienti/opt-out?token=${optOutToken}`,
  };

  const html = template(templateVars);
  const oggetto = `Promemoria: contratto n. ${pratica.contratto_nsm_id} in scadenza il ${formatDate(dataScadenza)}`;

  const sendResult = await emailProvider.send(pratica.cliente.email, oggetto, html);

  await prisma.comunicazione.create({
    data: {
      contratto_eol_id: pratica.id,
      tipo: cfg.tipo,
      canale: 'EMAIL',
      destinatario: pratica.cliente.email,
      oggetto,
      corpo_html: html,
      data_invio: new Date(),
      esito_invio: sendResult.success ? 'INVIATO' : 'ERRORE',
    },
  });

  await registraEvento(pratica.id, 'SISTEMA', 'SCHEDULER', 'COMUNICAZIONE_INVIATA', {
    tipo: cfg.tipo,
    canale: 'EMAIL',
    destinatario: pratica.cliente.email,
    esito: sendResult.success ? 'INVIATO' : 'ERRORE',
  });

  if (sendResult.success) {
    console.log(`[Scheduler] Sollecito ${cfg.tipo} inviato a ${pratica.cliente.email} per ${pratica.contratto_nsm_id}`);
  } else {
    console.warn(`[Scheduler] Sollecito ${cfg.tipo} ERRORE SMTP per ${pratica.contratto_nsm_id}: ${sendResult.error}`);
  }
}

async function creaEscalation(
  pratica: any,
  cfg: { tipo: string; script: string },
  scriptText: string,
  notificaTemplate: HandlebarsTemplateDelegate,
): Promise<void> {
  const monteCanoni = Number(pratica.monte_canoni);
  let assegnatoAId: string;
  let nomeAgente: string;
  let emailAgente: string;

  if (cfg.tipo === 'T_35' && monteCanoni >= 5000) {
    const capoArea = await prisma.utente_NSM.findFirst({
      where: { ruolo: 'CAPO_AREA', attivo: true },
    });
    if (capoArea) {
      assegnatoAId = capoArea.id;
      nomeAgente = `${capoArea.nome} ${capoArea.cognome}`;
      emailAgente = capoArea.email;
    } else {
      assegnatoAId = pratica.agente_assegnato_id || '';
      nomeAgente = pratica.agente_assegnato ? `${pratica.agente_assegnato.nome} ${pratica.agente_assegnato.cognome}` : 'N/D';
      emailAgente = pratica.agente_assegnato?.email || '';
    }
  } else {
    assegnatoAId = pratica.agente_assegnato_id || '';
    nomeAgente = pratica.agente_assegnato ? `${pratica.agente_assegnato.nome} ${pratica.agente_assegnato.cognome}` : 'N/D';
    emailAgente = pratica.agente_assegnato?.email || '';
  }

  if (!assegnatoAId) {
    throw new Error(`Nessun agente assegnato per pratica ${pratica.contratto_nsm_id}`);
  }

  const task = await prisma.task_Escalation.create({
    data: {
      contratto_eol_id: pratica.id,
      tipo: cfg.tipo,
      assegnato_a_id: assegnatoAId,
      stato: 'DA_CHIAMARE',
    },
  });

  await registraEvento(pratica.id, 'SISTEMA', 'SCHEDULER', 'TASK_ESCALATION_CREATO', {
    tipo: cfg.tipo,
    task_id: task.id,
    assegnato_a: nomeAgente,
  });

  console.log(`[Scheduler] Task_Escalation ${cfg.tipo} creato per ${pratica.contratto_nsm_id}, assegnato a ${nomeAgente}`);

  if (pratica.stato === 'COMUNICAZIONE_INVIATA') {
    await prisma.contratto_EOL.update({
      where: { id: pratica.id },
      data: { stato: 'IN_ATTESA_DECISIONE' },
    });
  }

  const colorMap: Record<string, { bg: string; fg: string; label: string }> = {
    T_50: { bg: '#f0fdf4', fg: '#16a34a', label: 'PRIORITÀ NORMALE' },
    T_40: { bg: '#fefce8', fg: '#ca8a04', label: 'PRIORITÀ MEDIA' },
    T_35: { bg: '#fef2f2', fg: '#dc2626', label: 'PRIORITÀ ALTA' },
  };
  const color = colorMap[cfg.tipo] ?? colorMap['T_50']!;

  const beni = pratica.beni_json ? JSON.parse(pratica.beni_json) : [];
  const beniFormatted = beni.map((b: { descrizione?: string }) => b.descrizione || 'N/D').join(', ');

  const storico = pratica.comunicazioni.map((c: any) => ({
    data: formatDate(new Date(c.data_invio)),
    tipo: c.tipo,
    esito: c.esito_invio,
  }));

  const scriptInline = scriptText
    .replace(/\[NOME AGENTE\]/g, nomeAgente)
    .replace(/\[NOME\]/g, nomeAgente)
    .replace(/\[CONTRATTO_NSM\]/g, pratica.contratto_nsm_id)
    .replace(/\[BENI\]/g, beniFormatted)
    .replace(/\[DATA_SCADENZA\]/g, formatDate(new Date(pratica.data_scadenza)))
    .replace(/\[DEADLINE\]/g, formatDate(new Date(new Date(pratica.data_scadenza).getTime() - JWT_EXPIRES_OFFSET_DAYS * 86400000)))
    .replace(/\[VALORE_GIFT_CARD\]/g, formatEur(Number(pratica.valore_gift_card)))
    .replace(/\[PRICING_RIACQUISTO\]/g, formatEur(Number(pratica.pricing_riacquisto)))
    .replace(/\[EMAIL\]/g, pratica.cliente.email)
    .replace(/\[CANONE_MENSILE\]/g, formatEur(Number(pratica.canone_mensile)))
    .replace(/\[CANONE_6_MESI\]/g, formatEur(Number(pratica.canone_mensile) * 6))
    .replace(/^# .+$/gm, '')
    .replace(/^## /gm, '')
    .replace(/\*\*/g, '')
    .replace(/^- /gm, '• ')
    .trim();

  const templateVars = {
    nome_agente: nomeAgente,
    ragione_sociale: pratica.cliente.ragione_sociale,
    referente_nome: pratica.cliente.referente_nome || pratica.cliente.ragione_sociale,
    telefono: pratica.cliente.telefono || 'N/D',
    email_cliente: pratica.cliente.email,
    numero_contratto_nsm: pratica.contratto_nsm_id,
    numero_contratto_grenke: pratica.contratto_grenke_id,
    data_scadenza: formatDate(new Date(pratica.data_scadenza)),
    monte_canoni: formatEur(monteCanoni),
    beni: beniFormatted || 'Beni come da contratto',
    storico_comunicazioni: storico,
    tipo_escalation: `Tentativo ${cfg.tipo.replace('T_', 'T-')}`,
    colore_priorita: color.fg,
    colore_priorita_bg: color.bg,
    etichetta_priorita: color.label,
    script_chiamata: scriptInline,
    link_task: `${FRONTEND_URL}/backoffice/task-escalation`,
  };

  const html = notificaTemplate(templateVars);
  const oggetto = `[${color.label}] Escalation telefonica ${cfg.tipo.replace('T_', 'T-')} — ${pratica.cliente.ragione_sociale} (${pratica.contratto_nsm_id})`;

  const sendResult = await emailProvider.send(emailAgente, oggetto, html);

  if (sendResult.success) {
    console.log(`[Scheduler] Notifica escalation inviata a ${emailAgente}`);
  } else {
    console.warn(`[Scheduler] Errore invio notifica escalation a ${emailAgente}: ${sendResult.error}`);
  }
}

async function marcaSilenzio(pratica: any): Promise<void> {
  await prisma.contratto_EOL.update({
    where: { id: pratica.id },
    data: { stato: 'SILENZIO_PERDITA_DEFINITIVA' },
  });

  await registraEvento(pratica.id, 'SISTEMA', 'SCHEDULER', 'SILENZIO_DEFINITO', {
    stato_precedente: pratica.stato,
    stato_nuovo: 'SILENZIO_PERDITA_DEFINITIVA',
    motivo: 'Nessuna decisione cliente entro deadline T-30',
  });

  const backofficeUsers = await prisma.utente_NSM.findMany({
    where: { ruolo: { in: ['BACKOFFICE_INTERNO', 'ADMIN'] }, attivo: true },
  });

  for (const user of backofficeUsers) {
    const html = `
      <h2>Pratica marcata come SILENZIO — Perdita definitiva</h2>
      <p><strong>Contratto:</strong> ${pratica.contratto_nsm_id} (${pratica.contratto_grenke_id})</p>
      <p><strong>Cliente:</strong> ${pratica.cliente.ragione_sociale} (P.IVA ${pratica.cliente.piva})</p>
      <p><strong>Scadenza:</strong> ${formatDate(new Date(pratica.data_scadenza))}</p>
      <p><strong>Monte canoni:</strong> €${formatEur(Number(pratica.monte_canoni))}</p>
      <p>Il cliente non ha comunicato alcuna decisione entro la deadline. Il contratto proseguirà in proroga automatica Grenke.</p>
    `;
    await emailProvider.send(
      user.email,
      `[SILENZIO] Pratica ${pratica.contratto_nsm_id} — Perdita definitiva`,
      html,
    );
  }

  console.log(`[Scheduler] Pratica ${pratica.contratto_nsm_id} marcata SILENZIO_PERDITA_DEFINITIVA`);
}

export function startSchedulerCron(): void {
  cron.schedule('0 2 * * *', async () => {
    console.log(`[Scheduler] Esecuzione programmata alle ${new Date().toISOString()}`);
    try {
      await runScheduler();
    } catch (err) {
      console.error('[Scheduler] Errore esecuzione programmata:', err);
    }
  });
  console.log('[Scheduler] Cron job registrato: 0 2 * * * (ogni giorno alle 02:00)');
}
