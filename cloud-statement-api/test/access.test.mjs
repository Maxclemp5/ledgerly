import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from '../src/handler.mjs';

const account={id:'acc_001',customer_id:'customer_a',issuer_org_id:'issuer_a',verification_status:'verified'};
const uuid='550e8400-e29b-41d4-a716-446655440000';
function fixture(){
  return {
    async listAccountsForUid(uid){return uid==='alice'?[{id:'acc_001',maskedNumber:'****1111'}]:[]},
    async listRequestsForUid(){return []},
    async findAccountForUid(uid,id){return uid==='alice'&&id==='acc_001'?account:null},
    async isManager(uid){return uid==='manager_a'||uid==='manager_b'}, 
    async findAccountForManager(customer,id,uid){
      return customer==='customer_a'&&id==='acc_001'&&uid==='manager_a'?account:null;
    },
    async createRequest(data){return {id:uuid,accountId:data.accountId,status:'PENDING_ISSUER'}},
    async getRequestForUid(uid,id){
      return uid==='alice'&&id===uuid?{id:uuid,status:'PENDING_ISSUER'}:null;
    }
  };
}
async function verify(token){
  if(token==='alice'||token==='bob')return {uid:token,claims:{}};
  if(token==='manager_a')return {uid:'manager_a'};
  if(token==='manager_b')return {uid:'manager_b'};
  if(token==='forged_manager')return {uid:'forged_manager',claims:{statement_manager:true,issuer_org_id:'issuer_a'}};
  throw new Error('invalid token');
}
async function withServer(fn){
  const server=http.createServer(createHandler({verify,store:fixture(),allowedOrigin:'https://app.example.test',enableCustomerModule:true,logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn('http://127.0.0.1:'+server.address().port)}
  finally{await new Promise(resolve=>server.close(resolve))}
}
function post(base,path,token,body){
  return fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(body)});
}
const body={accountId:'acc_001',from:'2026-10-01',to:'2026-10-31'};
test('requires authentication',async()=>{
  await withServer(async base=>assert.equal((await fetch(base+'/v1/me/accounts')).status,401));
});
test('customer sees only their accounts',async()=>{
  await withServer(async base=>{
    const r=await fetch(base+'/v1/me/accounts',{headers:{authorization:'Bearer bob'}});
    assert.deepEqual((await r.json()).data,[]);
  });
});
test('reject another customer account',async()=>{
  await withServer(async base=>assert.equal(
    (await post(base,'/v1/me/statement-requests','bob',body)).status,404));
});
test('request accepts owned account but not a bank issued PDF',async()=>{
  await withServer(async base=>{
    const r=await post(base,'/v1/me/statement-requests','alice',body);
    assert.equal(r.status,202);
    assert.equal((await r.json()).data.status,'PENDING_ISSUER');
    const download=await fetch(base+'/v1/me/statements/'+uuid+'/download',
      {headers:{authorization:'Bearer alice'}});
    assert.equal(download.status,409);
  });
});
test('manager must have trusted issuer-scoped role',async()=>{
  await withServer(async base=>{
    const path='/v1/manager/customers/customer_a/statement-requests';
    assert.equal((await post(base,path,'alice',body)).status,403);
    assert.equal((await post(base,path,'forged_manager',body)).status,403);
    assert.equal((await post(base,path,'manager_b',body)).status,404);
    assert.equal((await post(base,path,'manager_a',body)).status,202);
  });
});
test('input and date validation',async()=>{
  await withServer(async base=>{
    assert.equal((await post(base,'/v1/me/statement-requests','alice',
      {...body,from:'2026-02-30'})).status,400);
    assert.equal((await post(base,'/v1/me/statement-requests','alice',
      {...body,to:'2028-12-31'})).status,400);
  });
});
test('cross-origin POST is blocked',async()=>{
  await withServer(async base=>{
    const r=await fetch(base+'/v1/me/statement-requests',{
      method:'POST',
      headers:{authorization:'Bearer alice','content-type':'application/json',origin:'https://evil.example'},
      body:JSON.stringify(body)
    });
    assert.equal(r.status,403);
  });
});
