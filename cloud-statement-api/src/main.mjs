import http from 'node:http';
import {createHandler} from './handler.mjs';
import {createNeonVerifier} from './neonAuth.mjs';
import {makePool,StatementRepository} from './repository.mjs';
import {createStaticHandler} from './staticServer.mjs';

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
const handler=createHandler({store,verify,allowedOrigin:process.env.ALLOWED_WEB_ORIGIN});
const port=Number(process.env.PORT||10000);
const serveStatic=createStaticHandler({authBaseUrl:process.env.NEON_AUTH_BASE_URL});
const server=http.createServer(async(req,res)=>{
  const url=req.url||'/';
  if(req.method==='GET'&&url==='/public-config'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    return res.end(JSON.stringify({authUrl:process.env.NEON_AUTH_BASE_URL}));
  }
  if(await serveStatic(req,res))return;
  return handler(req,res);
});
server.listen(port,'0.0.0.0',()=>{
  console.log('Ledger Desk statement-request API listening on port '+port);
});
process.on('SIGTERM',()=>server.close(()=>pool.end().finally(()=>process.exit(0))));
