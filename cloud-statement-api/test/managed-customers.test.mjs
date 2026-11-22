import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from '../src/handler.mjs';
import {StatementRepository} from '../src/repository.mjs';

const id='cust_0123456789abcdef0123456789abcdef';
const existing={customerId:id,issuerOrgId:'issuer_a',displayName:'Test Customer',email:'test@example.test',status:'unverified'};
function store(){
 return {
  async isManager(uid){return uid==='manager_a'},
  async listManagedCustomers(uid,q){return uid==='manager_a'?[existing]:[]},
  async createManagedCustomer(uid,org,name,email){return uid==='manager_a'&&org==='issuer_a'?{...existing,displayName:name,email}:null},
  async updateManagedCustomer(uid,cid,name,email){return uid==='manager_a'&&cid===id?{...existing,displayName:name,email}:null},
  async deactivateManagedCustomer(uid,cid){return uid==='manager_a'&&cid===id?{customerId:cid}:null},
  async listManagerAudit(uid){return uid==='manager_a'?[{eventType:'customer.created',targetId:id,issuerOrgId:'issuer_a'}]:[]}
 };
}
async function withApp(fn){
 const server=http.createServer(createHandler({
  verify:async t=>({uid:t}),
  store:store(),allowedOrigin:'https://test.example',logger:{error(){}}
 }));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await fn('http://127.0.0.1:'+server.address().port)}
 finally{await new Promise(r=>server.close(r))}
}
function headers(uid){return {authorization:'Bearer '+uid,'content-type':'application/json'}}
test('only approved manager may create a customer and choose own issuer',async()=>{
 await withApp(async base=>{
  const path=base+'/v1/manager/managed-customers';
  const data={issuerOrgId:'issuer_a',displayName:'Demo Customer',email:'demo@example.test'};
  let r=await fetch(path,{method:'POST',headers:headers('visitor'),body:JSON.stringify(data)});
  assert.equal(r.status,403);
  r=await fetch(path,{method:'POST',headers:headers('manager_a'),body:JSON.stringify({...data,issuerOrgId:'issuer_b'})});
  assert.equal(r.status,404);
  r=await fetch(path,{method:'POST',headers:headers('manager_a'),body:JSON.stringify(data)});
  assert.equal(r.status,201);
  assert.equal((await r.json()).data.status,'unverified');
 });
});
test('customer changes and archives are manager-only and validated',async()=>{
 await withApp(async base=>{
  let r=await fetch(base+'/v1/manager/managed-customers/'+id,{
   method:'PATCH',headers:headers('manager_a'),
   body:JSON.stringify({displayName:'Updated Test',email:''})});
  assert.equal(r.status,200);
  assert.equal((await r.json()).data.displayName,'Updated Test');
  r=await fetch(base+'/v1/manager/managed-customers/'+id,{
   method:'PATCH',headers:headers('visitor'),
   body:JSON.stringify({displayName:'Forged',email:''})});
  assert.equal(r.status,403);
  r=await fetch(base+'/v1/manager/managed-customers/'+id+'/archive',{method:'POST',headers:headers('manager_a')});
  assert.equal(r.status,200);
  r=await fetch(base+'/v1/manager/managed-customers',{method:'POST',headers:headers('manager_a'),
   body:JSON.stringify({issuerOrgId:'issuer_a',displayName:'X',email:'not-an-email'})});
  assert.equal(r.status,400);
 });
});
test('manager customer directory and audit logs are private',async()=>{
 await withApp(async base=>{
  for(const path of ['/v1/manager/managed-customers','/v1/manager/audit-logs']){
   assert.equal((await fetch(base+path,{headers:headers('visitor')})).status,403);
   assert.equal((await fetch(base+path,{headers:headers('manager_a')})).status,200);
  }
 });
});
test('customer intake SQL always filters by active administrator issuer grant',async()=>{
 const calls=[];
 const repo=new StatementRepository({async query(sql,args){calls.push({sql,args});return {rowCount:0,rows:[]}}});
 await repo.listManagedCustomers('mgr','demo');
 await repo.createManagedCustomer('mgr','issuer_a','Test Name','');
 await repo.updateManagedCustomer('mgr',id,'Test Name','');
 await repo.deactivateManagedCustomer('mgr',id);
 await repo.listManagerAudit('mgr');
 assert.equal(calls.length,5);
 for(const c of calls){
  assert.match(c.sql,/manager_authorizations/);
  assert.match(c.sql,/m.auth_user_id=\$1/);
  assert.match(c.sql,/m.active/);
  assert.equal(c.args[0],'mgr');
 }
 assert.match(calls[1].sql,/INSERT INTO managed_customers/);
 assert.match(calls[1].sql,/manager_audit_events/);
 assert.match(calls[2].sql,/manager_audit_events/);
 assert.match(calls[3].sql,/active=false/);
 assert.match(calls[4].sql,/LIMIT 50/);
});
test('manager requires password rotation before backend privileges unlock',async()=>{
 const calls=[];
 const repo=new StatementRepository({async query(sql,args){
  calls.push({sql,args});
  return {rows:[{pending:true}],rowCount:1};
 }});
 assert.equal(await repo.managerPasswordChangeNeeded('mgr'),true);
 assert.match(calls[0].sql,/manager_password_changed_since/);
 assert.match(calls[0].sql,/require_password_change/);
 assert.equal(calls[0].args[0],'mgr');
});
