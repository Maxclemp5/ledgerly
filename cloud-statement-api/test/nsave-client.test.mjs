import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNsaveClient} from '../src/nsaveClient.mjs';
const env={NSAVE_API_BASE_URL:'https://nsave.work/api/v1',NSAVE_SITE_SERVICE_TOKEN:'site-secret',NSAVE_MANAGER_API_KEY:'manager-secret'};
test('nSave customer list uses documented base URL and both server credentials',async()=>{
 let seen;
 const api=createNsaveClient({env,request:async(url,opts)=>{seen={url,opts};return new Response(JSON.stringify({data:[],next_offset:null}),{status:200})}});
 const result=await api.listCustomers({limit:50,offset:0});
 assert.equal(result.next_offset,null);
 assert.equal(seen.url,'https://nsave.work/api/v1/customers?limit=50&offset=0');
 assert.equal(seen.opts.headers['OAI-Sites-Authorization'],'Bearer site-secret');
 assert.equal(seen.opts.headers.Authorization,'Bearer manager-secret');
});
test('nSave profile lookup and exact search use documented endpoints',async()=>{
 const urls=[];
 const api=createNsaveClient({env,request:async(url,opts)=>{urls.push({url,opts});return new Response('{}',{status:200})}});
 await api.getCustomer('cus_123');
 await api.searchCustomer({account_number:'00001234'});
 await api.searchCustomer({name:'Amina Rauf'});
 assert.equal(urls[0].url,'https://nsave.work/api/v1/customers/cus_123');
 assert.equal(urls[1].opts.method,'POST');
 assert.equal(urls[1].opts.body,'{"account_number":"00001234"}');
 assert.equal(urls[2].opts.body,'{"name":"Amina Rauf"}');
});
test('nSave client rejects missing credentials and invalid search fields',async()=>{
 const api=createNsaveClient({env:{},request:async()=>{throw Error('must not call')}});
 await assert.rejects(()=>api.listCustomers(),/credentials/);
 const ready=createNsaveClient({env,request:async()=>new Response('{}',{status:200})});
 assert.throws(()=>ready.searchCustomer({email:'x@y.test'}),/exact account number or full customer name/);
});

test('nSave client keeps upstream 401/403 status without exposing credentials',async()=>{
 for(const upstreamStatus of [401,403]){
  const api=createNsaveClient({env,request:async()=>new Response('{}',{status:upstreamStatus})});
  await assert.rejects(()=>api.listCustomers({limit:1}),error=>
   error.code==='NSAVE_AUTH_FAILED'&&error.upstreamStatus===upstreamStatus&&!error.message.includes('secret'));
 }
});
test('account-number lookup preserves leading zeros and rejects non-digits',async()=>{
 let body='';
 const api=createNsaveClient({env,request:async(_url,options)=>{body=options.body;return new Response('{}',{status:200})}});
 await api.searchCustomer({account_number:'00000123'});
 assert.equal(body,'{"account_number":"00000123"}');
 assert.throws(()=>api.searchCustomer({account_number:'123-456'}),/exact account number/);
});

test('exact Fly service-token rejection gets dedicated internal code on 401 and 403',async()=>{
 for(const upstreamStatus of [401,403]){
  const api=createNsaveClient({env,request:async()=>new Response(
   JSON.stringify({error:'Service authorization required.'}),{status:upstreamStatus}
  )});
  await assert.rejects(()=>api.listCustomers({limit:1}),error=>
   error.code==='NSAVE_SERVICE_TOKEN_REJECTED'&&error.upstreamStatus===upstreamStatus);
 }
});
test('other authentication errors remain generic, including non-JSON responses',async()=>{
 for(const body of [
  JSON.stringify({error:'Invalid manager API key'}),
  JSON.stringify({error:'Service authorization required'}),
  '<html>Unauthorized</html>'
 ]){
  const api=createNsaveClient({env,request:async()=>new Response(body,{status:401})});
  await assert.rejects(()=>api.listCustomers({limit:1}),error=>
   error.code==='NSAVE_AUTH_FAILED'&&error.upstreamStatus===401);
 }
});

test('date-scoped customer lookup passes start and end to nSave without altering credentials',async()=>{
 let url,options;
 const api=createNsaveClient({env,request:async(u,o)=>{url=u;options=o;return new Response('{}',{status:200})}});
 await api.getCustomer('nsave_cus_test',{start:'2026-11-01',end:'2026-11-23'});
 assert.equal(url,'https://nsave.work/api/v1/customers/nsave_cus_test?start=2026-11-01&end=2026-11-23');
 assert.equal(options.headers['OAI-Sites-Authorization'],'Bearer site-secret');
 assert.equal(options.headers.Authorization,'Bearer manager-secret');
});
test('date-scoped customer lookup rejects missing, malformed, reversed dates synchronously',()=>{
 const api=createNsaveClient({env,request:async()=>new Response('{}',{status:200})});
 assert.throws(()=>api.getCustomer('cus_test',{start:'2026-11-01'}),/Both statement/);
 assert.throws(()=>api.getCustomer('cus_test',{start:'2026-13-01',end:'2026-11-23'}),/Invalid nSave/);
 assert.throws(()=>api.getCustomer('cus_test',{start:'2026-11-23',end:'2026-11-01'}),/Invalid nSave/);
});

test('calls the approved nSave statement endpoint with account reference and period',async()=>{
 let url,options;
 const api=createNsaveClient({env,request:async(u,o)=>{url=u;options=o;return new Response('{}',{status:200})}});
 await api.getStatement('nsave_acct_test',{start:'2026-11-01',end:'2026-11-23'});
 assert.equal(url,'https://nsave.work/api/v1/statements/nsave_acct_test?start=2026-11-01&end=2026-11-23');
 assert.equal(options.headers['OAI-Sites-Authorization'],'Bearer site-secret');
 assert.equal(options.headers.Authorization,'Bearer manager-secret');
});
test('statement endpoint rejects unsafe references and invalid periods',()=>{
 const api=createNsaveClient({env,request:async()=>new Response('{}',{status:200})});
 assert.throws(()=>api.getStatement('../customers',{start:'2026-11-01',end:'2026-11-23'}),/account reference/);
 assert.throws(()=>api.getStatement('nsave_acct_test',{start:'2026-11-23',end:'2026-11-01'}),/reporting period/);
});
