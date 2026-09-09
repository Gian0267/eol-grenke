/**
 * Bootstrap dell'applicazione.
 *
 * Registra i gestori di errore PRIMA di caricare l'app, così qualsiasi
 * eccezione in fase di import (file mancanti, Prisma, config) viene
 * stampata su stdout — visibile nei log di runtime di Hostinger, che
 * non mostrano stderr.
 */
process.on('uncaughtException', (err) => {
  console.log('[FATAL uncaughtException]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.log('[FATAL unhandledRejection]', reason);
  process.exit(1);
});

// Le variabili d'ambiente vanno caricate PRIMA di qualunque import dell'app:
// lib/db.ts legge process.env.DATABASE_URL al caricamento del modulo, per
// costruire l'adapter pg. Se dotenv girasse dentro app.ts (dove gli import ES
// vengono valutati per primi) l'adapter nascerebbe senza URL e il driver
// ripiegherebbe su localhost:5432 → ECONNREFUSED. In produzione non si nota,
// perche' le variabili arrivano gia' dall'ambiente di hPanel.
const { config } = await import('dotenv');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import('./app.js').catch((err) => {
  console.log('[FATAL import]', err);
  process.exit(1);
});
