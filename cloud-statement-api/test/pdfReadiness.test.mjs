import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfReadiness} from '../src/pdfReadiness.mjs';

const good=()=>({ok:true,json:async()=>({status:'ok'})});
const bad=()=>({ok:false,status:503,json:async()=>({})});

test('ready renderer is detected without customer information',async()=>{
  const targets=[];
  const readiness=createPdfReadiness({
    getBase:()=> 'http://127.0.0.1:10001',
    fetchImpl:async(url,options)=>{targets.push({url:String(url),options});return good();}
  });
  assert.equal(await readiness.warm(),true);
  assert.equal(readiness.snapshot().status,'ready');
  assert.equal(targets.length,1);
  assert.equal(targets[0].url,'http://127.0.0.1:10001/health');
  assert.equal(targets[0].options.method,'GET');
  assert.equal(targets[0].options.body,undefined);
});

test('cold start retries until actual worker is healthy',async()=>{
  let calls=0, clock=0;
  const readiness=createPdfReadiness({
    getBase:()=> 'http://127.0.0.1:10001',
    fetchImpl:async()=>++calls<3?bad():good(),
    now:()=>clock,
    wait:async ms=>{clock+=ms;},
    retryDelayMs:500,
    maxWaitMs:5000
  });
  assert.equal(await readiness.warm(),true);
  assert.equal(calls,3);
  assert.equal(readiness.snapshot().status,'ready');
});

test('concurrent manager requests share a single warmup',async()=>{
  let calls=0;
  const readiness=createPdfReadiness({
    getBase:()=> 'http://127.0.0.1:10001',
    fetchImpl:async()=>{calls++;await new Promise(r=>setImmediate(r));return good();}
  });
  const [a,b,c]=await Promise.all([readiness.warm(),readiness.warm(),readiness.warm()]);
  assert.deepEqual([a,b,c],[true,true,true]);
  assert.equal(calls,1);
});

test('missing renderer configuration remains unavailable',async()=>{
  const readiness=createPdfReadiness({getBase:()=>''});
  assert.equal(await readiness.warm(),false);
  assert.equal(readiness.snapshot().status,'unavailable');
});

test('unhealthy worker eventually times out with bounded retries',async()=>{
  let clock=0,calls=0;
  const readiness=createPdfReadiness({
    getBase:()=> 'http://127.0.0.1:10001',
    fetchImpl:async()=>{calls++;return bad();},
    now:()=>clock,
    wait:async ms=>{clock+=ms;},
    retryDelayMs:500,
    maxWaitMs:1900,
    logger:{warn:()=>{}}
  });
  assert.equal(await readiness.warm(),false);
  assert.equal(readiness.snapshot().status,'unavailable');
  assert.equal(calls,4);
});
