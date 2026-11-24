import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHandler} from './handler.mjs';
import {createNeonVerifier} from './neonAuth.mjs';
import {makePool,StatementRepository} from './repository.mjs';
import {createStaticHandler} from './staticServer.mjs';
import {createAuthProxy} from './authProxy.mjs';
import {createNsaveClient} from './nsaveClient.mjs';
import {createPdfReadiness} from './pdfReadiness.mjs';

for (const env of ['ALLOWED_WEB_ORIGIN','NEON_AUTH_BASE_URL','NEON_AUTH_JWKS_URL']) {
  if (!process.env[env]) throw new Error('Missing required configuration: '+env);
}
const hasDatabaseUrl=Boolean(process.env.DATABASE_URL);
const hasSplitDatabaseConfig=['PGHOST','PGUSER','PGDATABASE','PGPASSWORD']
  .every(key=>Boolean(process.env[key]));
if (!hasDatabaseUrl && !hasSplitDatabaseConfig) {
  throw new Error('Configure DATABASE_URL or all PGHOST, PGUSER, PGDATABASE and PGPASSWORD values');
}

const verify=createNeonVerifier({
  baseUrl:process.env.NEON_AUTH_BASE_URL,
  jwksUrl:process.env.NEON_AUTH_JWKS_URL
});
const pool=makePool(),store=new StatementRepository(pool);
const nsave=createNsaveClient();
/**
 * One-off startup connectivity probe. The upstream response is deliberately
 * discarded: do not log customer data, account numbers, or API secrets.
 * Failure does not make the main dashboard unavailable.
 */
if(nsave.configured()){
  void nsave.listCustomers({limit:1,offset:0}).then(
    ()=>console.info('nSave API connection check: SUCCESS'),
    error=>console.warn('nSave API connection check: FAILED ('+
      (['NSAVE_AUTH_FAILED','NSAVE_SERVICE_TOKEN_REJECTED','UPSTREAM_RATE_LIMIT','NSAVE_API_ERROR'].includes(error?.code)
        ? error.code : 'NETWORK_OR_RESPONSE_ERROR')+')')
  );
}else{
  console.warn('nSave API connection check: NOT_CONFIGURED');
}

// The production Free container contains a Java/OpenPDF worker in this same
// network namespace. Bind exclusively to loopback: no public renderer port.
// The existing stand-alone renderer remains available for other deployments.
let pdfWorker=null;
if(process.env.LEDGERDESK_EMBEDDED_PDF_URL){
  if(process.env.LEDGERDESK_EMBEDDED_PDF_URL!=='http://127.0.0.1:10001')
    throw new Error('Embedded PDF worker URL must be loopback:10001');
  if(!process.env.PDF_STAMPER_TOKEN||process.env.PDF_STAMPER_TOKEN.length<32)
    throw new Error('PDF_STAMPER_TOKEN required for embedded PDF renderer');
  pdfWorker=spawn('java',[
    '-Xms32m','-Xmx192m','-XX:MaxMetaspaceSize=96m',
    '-XX:MaxDirectMemorySize=32m','-XX:ActiveProcessorCount=2',
    '-jar','/app/openpdf.jar'
  ],{
    env:{...process.env,PORT:'10001',PDF_BIND_HOST:'127.0.0.1'},
    stdio:'inherit'
  });
  pdfWorker.on('error',error=>{
    console.error('Embedded PDF worker failed to start:',error?.code||'UNKNOWN');
    process.exit(1);
  });
  pdfWorker.on('exit',(code,signal)=>{
    console.error('Embedded PDF worker exited unexpectedly:',code??signal??'UNKNOWN');
    process.exit(1);
  });
}
const pdfReadiness=createPdfReadiness();
const handler=createHandler({store,verify,allowedOrigin:process.env.ALLOWED_WEB_ORIGIN,nsave,pdfReadiness});
// Start local OpenPDF readiness checks as the container boots; the manager portal
// remains usable while the Java worker completes initialization.
if(process.env.LEDGERDESK_EMBEDDED_PDF_URL||process.env.PDF_STAMPER_URL)void pdfReadiness.warm();
const port=Number(process.env.PORT||10000);
const serveStatic=createStaticHandler({authBaseUrl:process.env.NEON_AUTH_BASE_URL});
const serveAuth=createAuthProxy(process.env.NEON_AUTH_BASE_URL);
const server=http.createServer(async(req,res)=>{
  const url=req.url||'/';
  if(req.method==='GET'&&url==='/public-config'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    return res.end(JSON.stringify({authUrl:process.env.NEON_AUTH_BASE_URL,authProxyUrl:'/auth'}));
  }
  if(await serveAuth(req,res))return;
  if(await serveStatic(req,res))return;
  return handler(req,res);
});
server.listen(port,'0.0.0.0',()=>{
  console.log('Ledger Desk statement-request API listening on port '+port);
});
process.on('SIGTERM',()=>{
  if(pdfWorker){pdfWorker.removeAllListeners('exit');pdfWorker.kill('SIGTERM');}
  server.close(()=>pool.end().finally(()=>process.exit(0)));
});
