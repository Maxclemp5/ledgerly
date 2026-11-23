import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileIssuerLedger} from '../src/issuerLedger.mjs';
const input={issuerOrgId:'issuer1',accountId:'acc1',from:'2026-11-01',to:'2026-11-20'};
const stub={
 async account(id,org){return {accountId:id,issuerOrgId:org,currency:'USD',status:'ACTIVE',sourceAccountId:'core_0001'}},
 async postedEntries(){return [
  {id:'tx1',postedAt:'2026-11-04T09:00:00Z',creditMinor:3000,debitMinor:0,currency:'USD'},
  {id:'tx2',postedAt:'2026-11-09T09:00:00Z',creditMinor:0,debitMinor:900,currency:'USD'}]},
 async boundaryBalances(){return {openingMinor:5000,closingMinor:7100,currency:'USD',openingCheckpointId:'snap_a',closingCheckpointId:'snap_b'}}
};
test('reconciles posted amounts exactly',async()=>{
 const r=await reconcileIssuerLedger(stub,input);
 assert.equal(r.closingMinor,'7100');assert.equal(r.postedEntryCount,2);
 assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);
});
test('does not accept incorrect ending balance',async()=>{
 await assert.rejects(()=>reconcileIssuerLedger({...stub,
 async boundaryBalances(){return {openingMinor:5000,closingMinor:9999,currency:'USD',openingCheckpointId:'a',closingCheckpointId:'b'}}
 },input),/reconcile/);
});
test('does not accept different issuer',async()=>{
 await assert.rejects(()=>reconcileIssuerLedger({...stub,
 async account(){return {accountId:'acc1',issuerOrgId:'another',currency:'USD',status:'ACTIVE',sourceAccountId:'core_0001'}}
 },input),/ownership/);
});
test('fails closed when no actual issuer connector exists',async()=>{
 await assert.rejects(()=>reconcileIssuerLedger({},input),/not configured/);
});

test('accepts a new verified account with no posted transactions and zero balances',async()=>{
 const verifiedEmpty={
  ...stub,
  async postedEntries(){return []},
  async boundaryBalances(){return {openingMinor:0,closingMinor:0,currency:'USD',openingCheckpointId:'opening_verified',closingCheckpointId:'closing_verified'}}
 };
 const result=await reconcileIssuerLedger(verifiedEmpty,input);
 assert.equal(result.postedEntryCount,0);
 assert.equal(result.openingMinor,'0');
 assert.equal(result.closingMinor,'0');
 assert.equal(result.source,'AUTHENTICATED_ISSUER_LEDGER');
});
test('accepts empty activity with a nonzero unchanged verified balance',async()=>{
 const verifiedEmpty={
  ...stub,
  async postedEntries(){return []},
  async boundaryBalances(){return {openingMinor:5000,closingMinor:5000,currency:'USD',openingCheckpointId:'opening_verified',closingCheckpointId:'closing_verified'}}
 };
 const result=await reconcileIssuerLedger(verifiedEmpty,input);
 assert.equal(result.postedEntryCount,0);
 assert.equal(result.openingMinor,result.closingMinor);
});
test('rejects empty activity when ledger checkpoints do not reconcile',async()=>{
 await assert.rejects(()=>reconcileIssuerLedger({
  ...stub,async postedEntries(){return []},
  async boundaryBalances(){return {openingMinor:0,closingMinor:1,currency:'USD',openingCheckpointId:'a',closingCheckpointId:'b'}}
 },input),/reconcile/);
});
