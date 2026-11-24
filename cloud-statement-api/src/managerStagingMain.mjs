// Dedicated Manager integration staging launcher.
// Uses its own Neon project and never configures an upstream customer API.
// The embedded PDF auth secret is generated for each runtime start.
import {randomBytes} from 'node:crypto';
if(process.env.LEDGERDESK_STAGING_MANAGER!=='1')
  throw new Error('Manager staging launcher requires explicit staging flag');
if(Object.keys(process.env).some(key=>key.startsWith('NSAVE_')&&process.env[key]))
  throw new Error('Never attach issuer credentials to Manager staging');
process.env.LEDGERDESK_EMBEDDED_PDF_URL='http://127.0.0.1:10001';
process.env.PDF_STAMPER_TOKEN=randomBytes(48).toString('hex');
await import('./main.mjs');
