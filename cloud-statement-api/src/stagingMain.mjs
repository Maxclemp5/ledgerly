// Isolated Render staging entrypoint. Never connects to Neon, nSave or
// manager authentication. Exercises the actual bundled OpenPDF Java worker.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createPdfReadiness} from './pdfReadiness.mjs';

const token=randomBytes(32).toString('hex');
const worker=spawn('java',[
  '-Xms32m','-Xmx192m','-XX:MaxMetaspaceSize=96m',
  '-XX:MaxDirectMemorySize=32m','-XX:ActiveProcessorCount=2',
  '-jar','/app/openpdf.jar'
],{env:{...process.env,PORT:'10001',PDF_BIND_HOST:'127.0.0.1',PDF_STAMPER_TOKEN:token},stdio:'inherit'});
worker.on('error',error=>console.error('Staging OpenPDF worker startup failure',error.code||'unknown'));
worker.on('exit',(code,signal)=>{console.error('Staging OpenPDF worker stopped',code??signal);process.exit(1);});
const readiness=createPdfReadiness({getBase:()=> 'http://127.0.0.1:10001'});
const startedAt=Date.now();
let pdfCheck={status:'pending',verifiedAt:null};
async function syntheticPdfAcceptance(){
  pdfCheck={status:'running',verifiedAt:null};
  // Deliberately fictional values. Never reach Neon, nSave or customer APIs.
  const statement={
    requestReference:'synthetic-validation-only',
    accountReference:'synthetic-account-only',
    customerName:'SYNTHETIC TEST CUSTOMER',
    address:'10 Example Street, Test City',
    bankName:'DEMO TEST BANK',
    bankAddress:'1 Example Road, Test City',
    accountNumber:'000000000000',
    routingNumber:'000000000',
    currency:'USD',from:'2026-11-11',to:'2026-11-11',
    opening:10000,deposits:2000,payments:1000,closing:11000,
    transactions:[{date:'2026-11-11',description:'Synthetic test deposit',amount:2000,balance:12000},
      {date:'2026-11-11',description:'Synthetic test payment',amount:-1000,balance:11000}]
  };
  try{
    if(!await readiness.warm())throw new Error('RENDERER_NOT_READY');
    const response=await fetch('http://127.0.0.1:10001/render',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/pdf'},
      body:JSON.stringify(statement),signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw new Error('RENDER_HTTP_'+response.status);
    if(!String(response.headers.get('content-type')).includes('application/pdf'))
      throw new Error('INVALID_CONTENT_TYPE');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<20000||bytes.length>15000000||
       bytes.subarray(0,5).toString('ascii')!=='%PDF-'||
       !bytes.subarray(-1024).toString('latin1').includes('%%EOF'))
      throw new Error('INVALID_PDF_OUTPUT');
    pdfCheck={status:'passed',verifiedAt:new Date().toISOString()};
    console.log('STAGING_SYNTHETIC_PDF_ACCEPTANCE: PASSED (PDF header, trailer, MIME, size verified)');
  }catch(error){
    pdfCheck={status:'failed',verifiedAt:new Date().toISOString()};
    console.error('STAGING_SYNTHETIC_PDF_ACCEPTANCE: FAILED',String(error?.message||'UNKNOWN').slice(0,60));
  }
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/','http://localhost');
  if(req.method!=='GET'||!['/','/health','/health/openpdf'].includes(url.pathname)){
    res.writeHead(404,{'content-type':'application/json'});return res.end(JSON.stringify({error:'NOT_FOUND'}));
  }
  const state=readiness.begin();
  const data={service:'pdf-reliability-staging',status:state.status,ready:state.ready,
    uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),syntheticPdfTest:pdfCheck.status};
  res.writeHead(state.ready?200:202,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(data));
});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{
  console.log('PDF reliability staging probe listening; no database/customer routes enabled');
  void syntheticPdfAcceptance();
});
process.on('SIGTERM',()=>{worker.removeAllListeners('exit');worker.kill('SIGTERM');server.close();});
