import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StatementRepository} from '../src/repository.mjs';

test('manager must have active administrator-managed grant',async()=>{
  const queries=[];
  const store=new StatementRepository({
    async query(sql,params){queries.push({sql,params});return {rowCount:0,rows:[]}}
  });
  assert.equal(await store.isManager('attacker'),false);
  assert.match(queries[0].sql,/manager_authorizations/);
  assert.match(queries[0].sql,/active/);
  assert.deepEqual(queries[0].params,['attacker']);
});
test('manager account lookup joins grants by caller identity and issuer scope',async()=>{
  const queries=[];
  const store=new StatementRepository({
    async query(sql,params){queries.push({sql,params});return {rowCount:0,rows:[]}}
  });
  assert.equal(await store.findAccountForManager('customer_a','acc_001','manager_wrong'),null);
  assert.match(queries[0].sql,/JOIN manager_authorizations m/);
  assert.match(queries[0].sql,/m.issuer_org_id=a.issuer_org_id/);
  assert.match(queries[0].sql,/m.auth_user_id=\$3/);
  assert.deepEqual(queries[0].params,['customer_a','acc_001','manager_wrong']);
});
test('customer account query filters by authenticated subject',async()=>{
  const queries=[];
  const store=new StatementRepository({async query(sql,params){queries.push({sql,params});return {rows:[]}}});
  await store.listAccountsForUid('neon-user');
  assert.match(queries[0].sql,/l.auth_user_id=\$1/);
  assert.deepEqual(queries[0].params,['neon-user']);
});
