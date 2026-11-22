import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from '../src/handler.mjs';
import {StatementRepository} from '../src/repository.mjs';

const validAccount={
  id:'acc_001',customer_id:'customer_a',issuer_org_id:'issuer_a',
  verification_status:'verified'
};
const request={accountId:'acc_001',from:'2026-10-01',to:'2026-10-31'};
const oneRequest={id:'550e8400-e29b-41d4-a716-446655440000',
  customerId:'customer_a',issuerOrgId:'issuer_a',status:'PENDING_ISSUER'};

function fixture(){
  return {
    async listManagerOrganizations(uid){
      return uid==='manager_a'?[{issuerOrgId:'issuer_a'}]:uid==='manager_b'?[{issuerOrgId:'issuer_b'}]:[];
    },
    async isManager(uid){return ['manager_a','manager_b'].includes(uid)},
    async managerPasswordChangeNeeded(uid){return uid==='onboarding_manager'},
    async getManagerSummary(uid){return uid==='manager_a'?{customers:1,verifiedAccounts:1,totalRequests:1,pendingRequests:1}:{customers:0,verifiedAccounts:0,totalRequests:0,pendingRequests:0}},
    async searchManagerCustomers(uid,q){return uid==='manager_a'&&'customer_a'.startsWith(q)?[{customerId:'customer_a',accountCount:1,verifiedCount:1}]:[]},
    async listManagerAccounts(uid,id){return uid==='manager_a'&&id==='customer_a'?[validAccount]:[]},
    async listManagerRequests(uid){return uid==='manager_a'?[oneRequest]:[]},
    async findAccountForManager(customer,id,uid){return uid==='manager_a'&&customer==='customer_a'&&id==='acc_001'?validAccount:null},
    async createRequest(){return oneRequest}
  };
}
async function verify(token){
  if(['manager_a','manager_b','alice','attacker','onboarding_manager'].includes(token))
    return {uid:token,claims:{statement_manager:true,issuer_org_id:'issuer_a'}};
  throw new Error('invalid token');
}
async function withServer(fn){
  const srv=http.createServer(createHandler({verify,store:fixture(),allowedOrigin:'https://ledgerdesk.test',logger:{error(){}}}));
  await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  try{await fn('http://127.0.0.1:'+srv.address().port)}
  finally{await new Promise(resolve=>srv.close(resolve))}
}
const auth=uid=>({authorization:'Bearer '+uid});
test('access endpoint reflects authoritative database grants, not JWT roles',async()=>{
  await withServer(async base=>{
    let r=await fetch(base+'/v1/me/access',{headers:auth('attacker')});
    assert.equal(r.status,200);
    assert.deepEqual((await r.json()).data,{manager:false,organizations:[],pendingPasswordChange:false});
    r=await fetch(base+'/v1/me/access',{headers:auth('manager_a')});
    assert.equal(r.status,200);
    assert.deepEqual((await r.json()).data,{manager:true,organizations:[{issuerOrgId:'issuer_a'}],pendingPasswordChange:false});
  });
});
test('every manager read route blocks customer with forged claims',async()=>{
  await withServer(async base=>{
    for(const path of [
      '/v1/manager/summary',
      '/v1/manager/customers?query=customer_a',
      '/v1/manager/customers/customer_a/accounts',
      '/v1/manager/statement-requests'
    ]){
      const r=await fetch(base+path,{headers:auth('attacker')});
      assert.equal(r.status,403,path);
    }
  });
});
test('manager search requires a specific customer ID prefix',async()=>{
  await withServer(async base=>{
    let r=await fetch(base+'/v1/manager/customers?query=ab',{headers:auth('manager_a')});
    assert.equal(r.status,400);
    r=await fetch(base+'/v1/manager/customers?query=cus',{headers:auth('manager_a')});
    assert.equal(r.status,200);
    assert.deepEqual((await r.json()).data,[{customerId:'customer_a',accountCount:1,verifiedCount:1}]);
    r=await fetch(base+'/v1/manager/customers?query=%25%25%25',{headers:auth('manager_a')});
    assert.equal(r.status,400);
  });
});
test('manager only receives accounts and requests in their issuer scope',async()=>{
  await withServer(async base=>{
    let r=await fetch(base+'/v1/manager/customers/customer_a/accounts',{headers:auth('manager_b')});
    assert.deepEqual((await r.json()).data,[]);
    r=await fetch(base+'/v1/manager/statement-requests',{headers:auth('manager_b')});
    assert.deepEqual((await r.json()).data,[]);
    r=await fetch(base+'/v1/manager/customers/customer_a/statement-requests',{
      method:'POST',headers:{...auth('manager_b'),'content-type':'application/json'},body:JSON.stringify(request)
    });
    assert.equal(r.status,404);
  });
});
test('manager summary is scoped and manager request write is authorized',async()=>{
  await withServer(async base=>{
    let r=await fetch(base+'/v1/manager/summary',{headers:auth('manager_a')});
    assert.equal((await r.json()).data.verifiedAccounts,1);
    r=await fetch(base+'/v1/manager/customers/customer_a/statement-requests',{
      method:'POST',headers:{...auth('manager_a'),'content-type':'application/json'},body:JSON.stringify(request)
    });
    assert.equal(r.status,202);
  });
});
test('repository manager queries join issuer grant and authenticated user',async()=>{
  const queries=[];
  const repo=new StatementRepository({async query(sql,args){queries.push({sql,args});return {rows:[],rowCount:0}}});
  await repo.getManagerSummary('manager_a');
  await repo.searchManagerCustomers('manager_a','cus');
  await repo.listManagerAccounts('manager_a','customer_a');
  await repo.listManagerRequests('manager_a');
  assert.equal(queries.length,5);
  for(const q of queries){
    assert.match(q.sql,/manager_authorizations/);
    assert.match(q.sql,/m\.auth_user_id=\$1/);
    assert.match(q.sql,/m\.active/);
    assert.equal(q.args[0],'manager_a');
  }
  assert.match(queries[2].sql,/LENGTH\(\$2\)/);
  assert.deepEqual(queries[3].args,['manager_a','customer_a']);
});
test('request creation uses only an atomic verified SELECT+INSERT, no row update grant',async()=>{
  const calls=[];
  const repo=new StatementRepository({async query(sql,args){
    calls.push({sql,args});
    return {rows:[oneRequest],rowCount:1};
  }});
  const result=await repo.createRequest({
    requesterUid:'manager_a',customerId:'customer_a',
    accountId:'acc_001',issuerOrgId:'issuer_a',from:'2026-10-01',to:'2026-10-31'
  });
  assert.equal(result.id,oneRequest.id);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/INSERT INTO statement_requests/);
  assert.match(calls[0].sql,/SELECT \$1,a\.id/);
  assert.match(calls[0].sql,/a\.source_verified_at IS NOT NULL/);
  assert.doesNotMatch(calls[0].sql,/FOR SHARE|FOR UPDATE/);
});
test('unverified or revoked account cannot create statement request',async()=>{
  const repo=new StatementRepository({async query(){return {rows:[],rowCount:0}}});
  await assert.rejects(repo.createRequest({
    requesterUid:'manager_a',customerId:'customer_a',
    accountId:'acc_001',issuerOrgId:'issuer_a',from:'2026-10-01',to:'2026-10-31'
  }),{name:'SourceNotVerified'});
});

test('manager first login reports pending password rotation without manager privileges',async()=>{
  await withServer(async base=>{
    const r=await fetch(base+'/v1/me/access',{headers:auth('onboarding_manager')});
    assert.equal(r.status,200);
    const payload=(await r.json()).data;
    assert.equal(payload.manager,false);
    assert.equal(payload.pendingPasswordChange,true);
    const restricted=await fetch(base+'/v1/manager/summary',{headers:auth('onboarding_manager')});
    assert.equal(restricted.status,403);
  });
});
