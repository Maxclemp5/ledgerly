import {canonicalNsaveCustomerReference,verifyNsaveCustomerAccountBinding} from '../src/handler.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNsaveStatement,renderNsaveStatement} from '../src/nsaveStatement.mjs';

const sample={
 month:null,start:'2026-11-11',end:'2026-11-11',
 data:[{
  nsave_reference:'nsave_cus_test',account_reference:'nsave_acct_test',
  account_id:'acct_test',customer_name:'Test Customer',address:'Test Address',
  bank_name:'Cross River Bank',bank_address:'Test Bank Address',
  account_number:'000012345678',currency:'USD',
  opening_cents:0,total_deposits_cents:0,total_payments_cents:0,closing_cents:0,
  transactions:[]
 }],
 request_reference:'nsave_req_test',organization_reference:'nsave_org_test'
};
test('maps an approved zero-activity nSave statement and accepts zero balances',()=>{
 const result=normalizeNsaveStatement(sample,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_test',
  from:'2026-11-11',to:'2026-11-11'
 });
 assert.equal(result.opening,0);
 assert.equal(result.closing,0);
 assert.equal(result.deposits,0);
 assert.equal(result.payments,0);
 assert.equal(result.transactions.length,0);
});
test('carries forward a prior balance when the period has no transactions',()=>{
 const data=structuredClone(sample);
 data.data[0].opening_cents=12050;
 data.data[0].closing_cents=12050;
 const result=normalizeNsaveStatement(data,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_test',
  from:'2026-11-11',to:'2026-11-11'
 });
 assert.equal(result.opening,result.closing);
});
test('rejects non-reconciling nSave statement totals',()=>{
 const data=structuredClone(sample);data.data[0].closing_cents=1;
 assert.throws(()=>normalizeNsaveStatement(data,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_test',
  from:'2026-11-11',to:'2026-11-11'
 }),/do not reconcile/);
});
test('rejects a statement for a different account or customer',()=>{
 assert.throws(()=>normalizeNsaveStatement(sample,{
  accountReference:'nsave_acct_other',customerReference:'nsave_cus_test',
  from:'2026-11-11',to:'2026-11-11'
 }),/matching account/);
 assert.throws(()=>normalizeNsaveStatement(sample,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_other',
  from:'2026-11-11',to:'2026-11-11'
 }),/customer reference/);
});
test('rejects a mismatched reporting period',()=>{
 assert.throws(()=>normalizeNsaveStatement(sample,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_test',
  from:'2026-11-01',to:'2026-11-11'
 }),/period does not match/);
});

test('renders a valid zero-activity statement PDF',async()=>{
 const statement=normalizeNsaveStatement(sample,{
  accountReference:'nsave_acct_test',customerReference:'nsave_cus_test',
  from:'2026-11-11',to:'2026-11-11'
 });
 const pdf=await renderNsaveStatement(statement);
 assert.equal(Buffer.isBuffer(pdf),true);
 assert.equal(pdf.subarray(0,5).toString('ascii'),'%PDF-');
 assert.ok(pdf.length>1000);
});

test('customer directory ID canonically maps to the ledger nsave_reference',()=>{
 assert.equal(canonicalNsaveCustomerReference('cus_a1b842ae1c1a467a9a389a1fbb544cce'),
  'nsave_cus_a1b842ae1c1a467a9a389a1fbb544cce');
 assert.equal(canonicalNsaveCustomerReference('nsave_cus_a1b842ae1c1a467a9a389a1fbb544cce'),
  'nsave_cus_a1b842ae1c1a467a9a389a1fbb544cce');
 assert.equal(canonicalNsaveCustomerReference('cus_other'), 'nsave_cus_other');
 for(const unsafe of ['acct_123','cus_../../other','cus_/x',''])assert.equal(canonicalNsaveCustomerReference(unsafe),null);
});

test('authenticates account association where ledger customer reference differs from internal ID',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{
  id:'acct_test',account_reference:'nsave_acct_test'
 }]}}};
 assert.equal(verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementCustomerReference:'nsave_cus_unrelated_generated_reference'
 }),true);
});
test('rejects a statement if its account does not belong to the authenticated customer detail',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{account_reference:'nsave_acct_other'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',statementCustomerReference:'nsave_cus_test'
 }),/not uniquely linked/);
});
test('rejects a contradictory explicit customer reference returned by authenticated nSave detail',()=>{
 const profile={data:{customer:{id:'cus_test',nsave_reference:'nsave_cus_true',
  accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',statementCustomerReference:'nsave_cus_other'
 }),/conflicts/);
});
test('rejects customer identity discrepancies in authenticated detail',()=>{
 const profile={data:{customer:{id:'cus_other',accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',statementCustomerReference:'nsave_cus_other'
 }),/identity differs/);
});

test('reports only safe yes/no diagnostics for genuine customer-reference conflicts',()=>{
 const profile={data:{customer:{id:'cus_test',nsave_reference:'nsave_cus_profile',
  accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementCustomerReference:'nsave_cus_ledger'
 }),e=>{
  assert.equal(e.code,'NSAVE_CUSTOMER_REFERENCE_CONFLICT');
  assert.deepEqual(e.diagnostics,{
   selectedCustomerIdentityConfirmed:true,
   selectedAccountLinkedToCustomer:true,
   accountOwnerReferencePresent:false,
   accountOwnerReferenceMatchesLedger:null,
   profileOwnerReferencePresent:true,
   profileOwnerReferenceMatchesLedger:false
  });
  const output=JSON.stringify(e.diagnostics);
  assert.equal(output.includes('nsave_cus_profile'),false);
  assert.equal(output.includes('nsave_cus_ledger'),false);
  return true;
 });
});
test('does not accept one matching owner reference if another authoritative source conflicts',()=>{
 const profile={data:{customer:{id:'cus_test',nsave_reference:'nsave_cus_profile',
  accounts:[{account_reference:'nsave_acct_test',nsave_reference:'nsave_cus_ledger'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementCustomerReference:'nsave_cus_ledger'
 }),/identity conflict/);
});
