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
 await assert.rejects(()=>ready.searchCustomer({email:'x@y.test'}),/exact account number or full customer name/);
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
 await assert.rejects(()=>api.searchCustomer({account_number:'123-456'}),/exact account number/);
});
