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
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/','http://localhost');
  if(req.method!=='GET'||!['/','/health','/health/openpdf'].includes(url.pathname)){
    res.writeHead(404,{'content-type':'application/json'});return res.end(JSON.stringify({error:'NOT_FOUND'}));
  }
  const state=readiness.begin();
  const data={service:'pdf-reliability-staging',status:state.status,ready:state.ready,
    uptimeSeconds:Math.floor((Date.now()-startedAt)/1000)};
  res.writeHead(state.ready?200:202,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(data));
});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{
  console.log('PDF reliability staging probe listening; no database/customer routes enabled');
  void readiness.warm();
});
process.on('SIGTERM',()=>{worker.removeAllListeners('exit');worker.kill('SIGTERM');server.close();});
