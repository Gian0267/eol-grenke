import dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
dotenv.config({ path: resolve(process.cwd(), '.env') });
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const dec = await p.decisione_Cliente.findFirst({
  where: { opzione_scelta: { contains: 'RESTITUZIONE' } },
  include: { contratto_eol: true },
});
if (!dec) { console.log('NESSUNA decisione di restituzione nei dati di test — genero con la prima pratica'); }
const contrattoId = dec ? dec.contratto_eol_id : (await p.contratto_EOL.findFirst())!.id;
const decisioneId = dec ? dec.id : (await p.decisione_Cliente.findFirst())?.id;
if (!decisioneId) { console.log('ERRORE: nessuna decisione nel DB, impossibile testare'); process.exit(1); }
const { generaVerbaleRestituzione } = await import('./src/services/pdf.service.js');
const r = await generaVerbaleRestituzione(contrattoId, decisioneId, {
  nome: 'Test Anteprima', ip: '127.0.0.1', userAgent: 'test', otpVerificato: true,
});
writeFileSync('/tmp/verbale_test.pdf', r.buffer);
console.log('PDF GENERATO: /tmp/verbale_test.pdf');
await p.$disconnect();
