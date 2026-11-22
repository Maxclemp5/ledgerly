import pg from 'pg';

export class StatementRepository {
  constructor(pool){this.pool=pool;}
  async listAccountsForUid(uid){
    const result=await this.pool.query(
      'SELECT a.id,a.masked_number AS "maskedNumber",a.currency,a.display_name AS "displayName",'+
      'a.verification_status AS "verificationStatus" '+
      'FROM verified_accounts a JOIN customer_identity_links l ON l.customer_id=a.customer_id '+
      'WHERE l.firebase_uid=$1 AND l.active AND a.active ORDER BY a.display_name LIMIT 100',[uid]);
    return result.rows;
  }
  async listRequestsForUid(uid){
    const result=await this.pool.query(
      'SELECT r.id,r.account_id AS "accountId",r.period_start AS "from",'+
      'r.period_end AS "to",r.status,r.created_at AS "createdAt" '+
      'FROM statement_requests r JOIN customer_identity_links l ON l.customer_id=r.customer_id '+
      'WHERE l.firebase_uid=$1 AND l.active ORDER BY r.created_at DESC LIMIT 100',[uid]);
    return result.rows;
  }
  async findAccountForUid(uid,accountId){
    const r=await this.pool.query(
      'SELECT a.id,a.customer_id,a.issuer_org_id,a.verification_status '+
      'FROM verified_accounts a JOIN customer_identity_links l ON l.customer_id=a.customer_id '+
      'WHERE l.firebase_uid=$1 AND l.active AND a.id=$2 AND a.active LIMIT 1',[uid,accountId]);
    return r.rows[0]||null;
  }
  async findAccountForManager(customerId,accountId,issuerOrgId){
    const r=await this.pool.query(
      'SELECT id,customer_id,issuer_org_id,verification_status FROM verified_accounts '+
      'WHERE customer_id=$1 AND id=$2 AND issuer_org_id=$3 AND active LIMIT 1',
      [customerId,accountId,issuerOrgId]);
    return r.rows[0]||null;
  }
  async getRequestForUid(uid,requestId){
    const r=await this.pool.query(
      'SELECT r.id,r.account_id AS "accountId",r.period_start AS "from",'+
      'r.period_end AS "to",r.status,r.created_at AS "createdAt" '+
      'FROM statement_requests r JOIN customer_identity_links l ON l.customer_id=r.customer_id '+
      'WHERE l.firebase_uid=$1 AND l.active AND r.id=$2 LIMIT 1',[uid,requestId]);
    return r.rows[0]||null;
  }
  async createRequest({requesterUid,customerId,accountId,issuerOrgId,from,to}){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const verified=await client.query(
        'SELECT id FROM verified_accounts WHERE id=$1 AND customer_id=$2 AND '+
        'issuer_org_id=$3 AND active AND verification_status=$4 '+
        'AND source_verified_at IS NOT NULL FOR SHARE',
        [accountId,customerId,issuerOrgId,'verified']);
      if(!verified.rowCount)throw Object.assign(new Error('Issuer source not verified'),
        {name:'SourceNotVerified'});
      const inserted=await client.query(
        'INSERT INTO statement_requests '+
        '(customer_id,account_id,issuer_org_id,requested_by_uid,period_start,period_end,status) '+
        "VALUES ($1,$2,$3,$4,$5,$6,'PENDING_ISSUER') "+
        'RETURNING id,account_id AS "accountId",period_start AS "from",'+
        'period_end AS "to",status,created_at AS "createdAt"',
        [customerId,accountId,issuerOrgId,requesterUid,from,to]);
      await client.query('COMMIT');
      return inserted.rows[0];
    }catch(err){await client.query('ROLLBACK');throw err}
    finally{client.release()}
  }
}

export function buildPoolConfig(env=process.env){
  const common={
    max:8,
    connectionTimeoutMillis:3000,
    idleTimeoutMillis:15000,
    application_name:'ledgerdesk-statement-api'
  };
  if(env.DATABASE_URL){
    return {...common,connectionString:env.DATABASE_URL};
  }
  if(!env.PGHOST||!env.PGUSER||!env.PGDATABASE||!env.PGPASSWORD){
    throw new Error('DATABASE_URL or complete PGHOST/PGUSER/PGDATABASE/PGPASSWORD configuration is required');
  }
  return {
    ...common,
    host:env.PGHOST,
    port:Number(env.PGPORT||5432),
    user:env.PGUSER,
    password:env.PGPASSWORD,
    database:env.PGDATABASE
  };
}
export function makePool(env=process.env){
  return new pg.Pool(buildPoolConfig(env));
}
