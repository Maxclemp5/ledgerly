import http from 'node:http';
import {createHandler} from './handler.mjs';
import {createNeonVerifier} from './neonAuth.mjs';
import {makePool,StatementRepository} from './repository.mjs';
import {createStaticHandler} from './staticServer.mjs';
import {createAuthProxy} from './authProxy.mjs';
import {createNsaveClient} from './nsaveClient.mjs';

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

const handler=createHandler({store,verify,allowedOrigin:process.env.ALLOWED_WEB_ORIGIN,nsave});
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
process.on('SIGTERM',()=>server.close(()=>pool.end().finally(()=>process.exit(0))));
