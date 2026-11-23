import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nsaveCustomer,nsaveAddressText,nsaveUnpack} from '../dashboard/src/nsaveProfile.mjs';
test('reads nested customer and linked account details',()=>{
 const p=nsaveCustomer({data:{data:{customer:{id:'cus_test',address:{line1:'Example Road',city:'Fresno'},accounts:[{id:'acct_test',currency:'USD'}]}}}});
 assert.equal(p.id,'cus_test');
 assert.equal(p.accounts[0].id,'acct_test');
 assert.equal(nsaveAddressText(p.address),'Example Road, Fresno');
});
test('maps flat ledger account profile without manufacturing values',()=>{
 const p=nsaveCustomer({data:{id:'cus_test',name:'Test Customer',
  address:'Example Street, Fresno CA',bank_address:'Example Bank Road, NJ',
  account_id:'acct_test',account_reference:'nsave_acct_test',
  account_number:'000001234',bank_name:'Sample Bank',currency:'USD'}});
 assert.equal(p.accounts.length,1);
 assert.equal(p.accounts[0].id,'acct_test');
 assert.equal(p.accounts[0].account_reference,'nsave_acct_test');
 assert.equal(p.accounts[0].account_number,'000001234');
 assert.equal(nsaveAddressText(p.address),'Example Street, Fresno CA');
 assert.equal(nsaveAddressText(p.bank_address),'Example Bank Road, NJ');
});
test('keeps summary address and account when detail omits them',()=>{
 const p=nsaveCustomer({data:{id:'cus_test',email:'example@example.invalid'}},{
  id:'cus_test',address:'Summary street',account_id:'acct_test',currency:'USD'});
 assert.equal(nsaveAddressText(p.address),'Summary street');
 assert.equal(p.accounts[0].id,'acct_test');
});
test('does not invent missing banking fields',()=>{
 const p=nsaveCustomer({data:{id:'cus_test',name:'Test Customer'}});
 assert.deepEqual(p.accounts,[]);
 assert.equal(nsaveAddressText(p.address),'');
});
test('unpacks list, search, and customer envelopes',()=>{
 assert.equal(nsaveUnpack({data:{customers:[{id:'cus_a'}]}}).items[0].id,'cus_a');
 assert.equal(nsaveUnpack({data:{data:[{id:'cus_b'}]}}).items[0].id,'cus_b');
 assert.equal(nsaveUnpack({data:{customer:{id:'cus_c'}}}).items[0].id,'cus_c');
});
