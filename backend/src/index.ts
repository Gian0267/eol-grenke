/**
 * Bootstrap dell'applicazione.
 *
 * Registra i gestori di errore PRIMA di caricare l'app, così qualsiasi
 * eccezione in fase di import (file mancanti, Prisma, config) viene
 * stampata su stdout — visibile nei log di runtime di Hostinger, che
 * non mostrano stderr.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
//
// IMPORTANTE: import statici, MAI `await import(...)`. Un await a livello di
// modulo rende index.js asincrono: con `node` puro funziona, ma sotto il
// wrapper di LiteSpeed l'app non completa l'inizializzazione, non si mette in
// ascolto e Hostinger risponde 503 su tutto, log muti. Tre ore di fermo il
// 09/09/2026. L'app continua a caricarsi con l'import dinamico piu' sotto,
// che e' dentro una catch e non blocca l'avvio.
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import('./app.js').catch((err) => {
  console.log('[FATAL import]', err);
  process.exit(1);
});
