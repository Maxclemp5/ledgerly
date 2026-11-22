import http from 'node:http';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createHandler} from './handler.mjs';
import {makePool,StatementRepository} from './repository.mjs';

// Fail closed: no credentials, issuer access or verified ledger = no production API.
for(const env of ['GOOGLE_CLOUD_PROJECT','ALLOWED_WEB_ORIGIN','PGHOST','PGUSER','PGDATABASE','PGPASSWORD']){
  if(!process.env[env])throw new Error('Missing required configuration: '+env);
}
if(!getApps().length){
  initializeApp({credential:applicationDefault(),projectId:process.env.GOOGLE_CLOUD_PROJECT});
}
const pool=makePool(),store=new StatementRepository(pool);
const handler=createHandler({
  store,
  verify:async token=>{
    const claims=await getAuth().verifyIdToken(token,true);
    return {uid:claims.uid,claims};
  },
  allowedOrigin:process.env.ALLOWED_WEB_ORIGIN
});
const port=Number(process.env.PORT||8080);
const server=http.createServer(handler);
server.listen(port,'0.0.0.0',()=>{
  console.log('Ledger Desk issuer-request API listening on port '+port);
});
process.on('SIGTERM',()=>{
  server.close(()=>pool.end().finally(()=>process.exit(0)));
});
