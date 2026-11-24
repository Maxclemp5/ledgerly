import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHandler} from '../src/handler.mjs';

async function invoke(handler,url='/v1/manager/pdf-readiness'){
  const req=Readable.from([]);
  req.method='GET';req.url=url;req.headers={authorization:'Bearer test-token'};
  let status=0,body='';
  const res={
    writeHead(code){status=code;},
    end(data=''){body+=data;},
  };
  await handler(req,res);
  return {status,body:JSON.parse(body)};
}
function fakeStore({manager=true,organizations=[{issuerOrgId:'issuer-test'}]}={}){
  return {
    isManager:async()=>manager,
    listManagerOrganizations:async()=>organizations,
  };
}
const verify=async()=>({uid:'test-manager'});
test('authorized organization manager can prewarm the renderer with no customer data',async()=>{
  let calls=0;
  const handler=createHandler({
    verify,store:fakeStore(),
    pdfReadiness:{begin(){calls++;return {status:'starting',ready:false,attempt:1,lastCheckedAt:null};}}
  });
  const result=await invoke(handler);
  assert.equal(result.status,202);
  assert.equal(result.body.data.status,'starting');
  assert.equal(calls,1);
  assert.equal(JSON.stringify(result.body).includes('test-token'),false);
});
test('PDF readiness reports ready only after positive worker validation',async()=>{
  const handler=createHandler({
    verify,store:fakeStore(),
    pdfReadiness:{begin:()=>({status:'ready',ready:true,attempt:2,lastCheckedAt:'2026-11-24T00:00:00.000Z'})}
  });
  const result=await invoke(handler);
  assert.equal(result.status,200);
  assert.equal(result.body.data.ready,true);
});
test('unassigned identities cannot wake the PDF renderer',async()=>{
  let called=false;
  const handler=createHandler({
    verify,store:fakeStore({manager:false}),
    pdfReadiness:{begin:()=>{called=true;return {ready:true,status:'ready'};}}
  });
  const result=await invoke(handler);
  assert.equal(result.status,403);
  assert.equal(called,false);
});
test('manager without an active organization grant cannot wake the PDF renderer',async()=>{
  let called=false;
  const handler=createHandler({
    verify,store:fakeStore({organizations:[]}),
    pdfReadiness:{begin:()=>{called=true;return {ready:true,status:'ready'};}}
  });
  const result=await invoke(handler);
  assert.equal(result.status,403);
  assert.equal(called,false);
});
