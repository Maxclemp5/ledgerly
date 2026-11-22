import http from 'node:http';
import {readFileSync} from 'node:fs';
import {applicationDefault,cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createHandler} from './handler.mjs';
import {makePool,StatementRepository} from './repository.mjs';

for(const env of ['GOOGLE_CLOUD_PROJECT','ALLOWED_WEB_ORIGIN']){
  if(!process.env[env])throw new Error('Missing required configuration: '+env);
}
const hasDatabaseUrl=Boolean(process.env.DATABASE_URL);
const hasSplitDatabaseConfig=['PGHOST','PGUSER','PGDATABASE','PGPASSWORD']
  .every(key=>Boolean(process.env[key]));
if(!hasDatabaseUrl&&!hasSplitDatabaseConfig){
  throw new Error('Configure DATABASE_URL or all PGHOST, PGUSER, PGDATABASE and PGPASSWORD values');
}

// Render supplies the Firebase Admin key as a protected secret file.
// Google Cloud deployments can continue using Application Default Credentials.
let firebaseCredential=applicationDefault();
if(process.env.FIREBASE_SERVICE_ACCOUNT_FILE){
  const serviceAccount=JSON.parse(
    readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE,'utf8')
  );
  if(serviceAccount.project_id&&serviceAccount.project_id!==process.env.GOOGLE_CLOUD_PROJECT){
    throw new Error('Firebase service-account project does not match GOOGLE_CLOUD_PROJECT');
  }
  firebaseCredential=cert(serviceAccount);
}
if(!getApps().length){
  initializeApp({
    credential:firebaseCredential,
    projectId:process.env.GOOGLE_CLOUD_PROJECT
  });
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
const port=Number(process.env.PORT||10000);
const server=http.createServer(handler);
server.listen(port,'0.0.0.0',()=>{
  console.log('Ledger Desk statement-request API listening on port '+port);
});
process.on('SIGTERM',()=>{
  server.close(()=>pool.end().finally(()=>process.exit(0)));
});
