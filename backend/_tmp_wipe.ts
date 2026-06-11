import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env') });
const { resetTestData } = await import('./src/services/test-data.service.js');
const r = await resetTestData();
console.log('RESET OK — contratti ricreati:', r.contratti_creati);
