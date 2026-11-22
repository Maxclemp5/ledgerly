import pg from 'pg';

export class StatementRepository {
  constructor(pool){this.pool=pool;}
  async listAccountsForUid(uid){
    const result=await this.pool.query(
      'SELECT a.id,a.masked_number AS "maskedNumber",a.currency,a.display_name AS "displayName",'+
      'a.verification_status AS "verificationStatus" '+
      'FROM verified_accounts a JOIN customer_identity_links l ON l.customer_id=a.customer_id '+
      'WHERE l.auth_user_id=$1 AND l.active AND a.active ORDER BY a.display_name LIMIT 100',[uid]);
    return result.rows;
  }
  async listRequestsForUid(uid){
    const result=await this.pool.query(
      'SELECT r.id,r.account_id AS "accountId",r.period_start AS "from",'+
      'r.period_end AS "to",r.status,r.created_at AS "createdAt" '+
      'FROM statement_requests r JOIN customer_identity_links l ON l.customer_id=r.customer_id '+
      'WHERE l.auth_user_id=$1 AND l.active ORDER BY r.created_at DESC LIMIT 100',[uid]);
    return result.rows;
  }
  async findAccountForUid(uid,accountId){
    const r=await this.pool.query(
      'SELECT a.id,a.customer_id,a.issuer_org_id,a.verification_status '+
      'FROM verified_accounts a JOIN customer_identity_links l ON l.customer_id=a.customer_id '+
      'WHERE l.auth_user_id=$1 AND l.active AND a.id=$2 AND a.active LIMIT 1',[uid,accountId]);
    return r.rows[0]||null;
  }
  async isManager(authUserId){
    const r=await this.pool.query(
      'SELECT 1 FROM manager_authorizations WHERE auth_user_id=$1 AND active LIMIT 1',
      [authUserId]);
    return Boolean(r.rowCount);
  }
  async findAccountForManager(customerId,accountId,authUserId){
    // The issuer scope comes from an administrator-managed grant, never a token claim.
    const r=await this.pool.query(
      'SELECT a.id,a.customer_id,a.issuer_org_id,a.verification_status '+
      'FROM verified_accounts a JOIN manager_authorizations m '+
      'ON m.issuer_org_id=a.issuer_org_id AND m.auth_user_id=$3 AND m.active '+
      'WHERE a.customer_id=$1 AND a.id=$2 AND a.active LIMIT 1',
      [customerId,accountId,authUserId]);
    return r.rows[0]||null;
  }
  async getRequestForUid(uid,requestId){
    const r=await this.pool.query(
      'SELECT r.id,r.account_id AS "accountId",r.period_start AS "from",'+
      'r.period_end AS "to",r.status,r.created_at AS "createdAt" '+
      'FROM statement_requests r JOIN customer_identity_links l ON l.customer_id=r.customer_id '+
      'WHERE l.auth_user_id=$1 AND l.active AND r.id=$2 LIMIT 1',[uid,requestId]);
    return r.rows[0]||null;
  }
  async listManagerOrganizations(uid){
    const result=await this.pool.query(
      'SELECT issuer_org_id AS "issuerOrgId" FROM manager_authorizations '+
      'WHERE auth_user_id=$1 AND active ORDER BY issuer_org_id LIMIT 20',[uid]);
    return result.rows;
  }
  async getManagerSummary(uid){
    const [accounts,requests]=await Promise.all([
      this.pool.query(
        'SELECT COUNT(DISTINCT a.customer_id)::int AS customers, '+
        'COUNT(*) FILTER (WHERE a.verification_status=\'verified\')::int AS "verifiedAccounts" '+
        'FROM verified_accounts a JOIN manager_authorizations m ON m.issuer_org_id=a.issuer_org_id '+
        'AND m.auth_user_id=$1 AND m.active WHERE a.active',[uid]),
      this.pool.query(
        'SELECT COUNT(*)::int AS total, '+
        'COUNT(*) FILTER (WHERE r.status=\'PENDING_ISSUER\')::int AS pending '+
        'FROM statement_requests r JOIN manager_authorizations m ON m.issuer_org_id=r.issuer_org_id '+
        'AND m.auth_user_id=$1 AND m.active',[uid])
    ]);
    return {
      customers:accounts.rows[0]?.customers||0,
      verifiedAccounts:accounts.rows[0]?.verifiedAccounts||0,
      totalRequests:requests.rows[0]?.total||0,
      pendingRequests:requests.rows[0]?.pending||0
    };
  }
  async searchManagerCustomers(uid,prefix){
    const result=await this.pool.query(
      'SELECT a.customer_id AS "customerId", COUNT(*)::int AS "accountCount", '+
      'COUNT(*) FILTER (WHERE a.verification_status=\'verified\')::int AS "verifiedCount" '+
      'FROM verified_accounts a JOIN manager_authorizations m ON m.issuer_org_id=a.issuer_org_id '+
      'AND m.auth_user_id=$1 AND m.active WHERE a.active '+
      'AND LEFT(LOWER(a.customer_id), LENGTH($2))=LOWER($2) '+
      'GROUP BY a.customer_id ORDER BY a.customer_id LIMIT 20',[uid,prefix]);
    return result.rows;
  }
  async listManagerAccounts(uid,customerId){
    const result=await this.pool.query(
      'SELECT a.id,a.display_name AS "displayName",a.masked_number AS "maskedNumber", '+
      'a.currency,a.verification_status AS "verificationStatus",a.issuer_org_id AS "issuerOrgId" '+
      'FROM verified_accounts a JOIN manager_authorizations m ON m.issuer_org_id=a.issuer_org_id '+
      'AND m.auth_user_id=$1 AND m.active '+
      'WHERE a.customer_id=$2 AND a.active ORDER BY a.display_name LIMIT 50',[uid,customerId]);
    return result.rows;
  }
  async listManagerRequests(uid){
    const result=await this.pool.query(
      'SELECT r.id,r.customer_id AS "customerId",r.account_id AS "accountId", '+
      'r.issuer_org_id AS "issuerOrgId",r.period_start AS "from",r.period_end AS "to", '+
      'r.status,r.created_at AS "createdAt" '+
      'FROM statement_requests r JOIN manager_authorizations m ON m.issuer_org_id=r.issuer_org_id '+
      'AND m.auth_user_id=$1 AND m.active ORDER BY r.created_at DESC LIMIT 50',[uid]);
    return result.rows;
  }
  async createRequest({requesterUid,customerId,accountId,issuerOrgId,from,to}){
    // One atomic statement: the restricted runtime role needs SELECT+INSERT only.
    // Issuer source verification is required at the moment of request creation.
    const result=await this.pool.query(
      'INSERT INTO statement_requests '+
      '(customer_id,account_id,issuer_org_id,requested_by_uid,period_start,period_end,status) '+
      "SELECT $1,a.id,$3,$4,$5,$6,'PENDING_ISSUER' FROM verified_accounts a "+
      "WHERE a.id=$2 AND a.customer_id=$1 AND a.issuer_org_id=$3 AND a.active "+
      "AND a.verification_status='verified' AND a.source_verified_at IS NOT NULL "+
      'RETURNING id,account_id AS "accountId",period_start AS "from",'+
      'period_end AS "to",status,created_at AS "createdAt"',
      [customerId,accountId,issuerOrgId,requesterUid,from,to]);
    if(!result.rowCount){
      const err=new Error('Issuer source not verified');
      err.name='SourceNotVerified';
      throw err;
    }
    return result.rows[0];
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
