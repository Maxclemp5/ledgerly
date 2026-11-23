import {verifyNsaveCustomerAccountBinding} from '../src/handler.mjs';
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


test('profile account_reference is authoritative when nsave customer references differ',()=>{
 const profile={data:{customer:{id:'cus_test',nsave_reference:'nsave_cus_profile',
  accounts:[{account_reference:'nsave_acct_test',account_id:'acct_test'}]}}};
 assert.equal(verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test',statementAccountId:'acct_test'
 }),true);
});
test('supports a flat nSave customer profile account_reference',()=>{
 const profile={data:{id:'cus_test',account_reference:'nsave_acct_test',account_id:'acct_test'}};
 assert.equal(verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test',statementAccountId:'acct_test'
 }),true);
});
test('rejects an account reference absent from selected customer profile',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{account_reference:'nsave_acct_other'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test'
 }),/not uniquely linked/);
});
test('rejects a statement account reference different from the profile',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_other'
 }),/Statement account reference/);
});
test('rejects mismatched account_id when both APIs supply it',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{account_reference:'nsave_acct_test',account_id:'acct_profile'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test',statementAccountId:'acct_statement'
 }),/Statement account ID/);
});
test('accepts a missing optional account_id from either source',()=>{
 const profile={data:{customer:{id:'cus_test',accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.equal(verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test',statementAccountId:'acct_test'
 }),true);
});
test('rejects contradictory customer identity in profile response',()=>{
 const profile={data:{customer:{id:'cus_other',accounts:[{account_reference:'nsave_acct_test'}]}}};
 assert.throws(()=>verifyNsaveCustomerAccountBinding(profile,{
  customerId:'cus_test',accountReference:'nsave_acct_test',
  statementAccountReference:'nsave_acct_test'
 }),/identity differs/);
});
