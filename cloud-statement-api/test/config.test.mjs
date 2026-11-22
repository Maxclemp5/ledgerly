import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPoolConfig} from '../src/repository.mjs';

test('uses Render DATABASE_URL when supplied',()=>{
  const config=buildPoolConfig({
    DATABASE_URL:'postgresql://statement_api:secret@internal-host/ledgerdesk'
  });
  assert.equal(config.connectionString,'postgresql://statement_api:secret@internal-host/ledgerdesk');
  assert.equal(config.max,8);
  assert.equal(config.application_name,'ledgerdesk-statement-api');
  assert.equal(config.host,undefined);
});
test('retains split PG settings for existing Cloud SQL deployment',()=>{
  const config=buildPoolConfig({
    PGHOST:'/cloudsql/project:region:instance',
    PGUSER:'statement_api',
    PGPASSWORD:'secret',
    PGDATABASE:'ledgerdesk'
  });
  assert.equal(config.host,'/cloudsql/project:region:instance');
  assert.equal(config.user,'statement_api');
  assert.equal(config.database,'ledgerdesk');
});
test('fails closed when no database connection is configured',()=>{
  assert.throws(()=>buildPoolConfig({}),/DATABASE_URL or complete PGHOST/);
});
