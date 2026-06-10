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

import('./app.js').catch((err) => {
  console.log('[FATAL import]', err);
  process.exit(1);
});
