import {normalizeNsaveStatement,renderNsaveStatement} from './nsaveStatement.mjs';
import {URL} from 'node:url';

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
// Return response structure only: never include scalar values, account numbers,
// names, addresses, transaction descriptions, or other customer content.
function safeShape(value,depth=0){
  if(value===null)return {type:'null'};
  if(Array.isArray(value)){
    const first=value[0];
    return {type:'array',length:value.length,
      itemShape:first===undefined?null:safeShape(first,depth+1)};
  }
  if(typeof value==='object'){
    if(depth>=5)return {type:'object',truncated:true};
    const entries=Object.entries(value).slice(0,80);
    return {type:'object',fields:Object.fromEntries(entries.map(([key,v])=>
      [key,safeShape(v,depth+1)])),truncated:Object.keys(value).length>80};
  }
  return {type:typeof value};
}
function sendPdf(res,buffer,filename,origin=''){
  res.writeHead(200,{
    'content-type':'application/pdf',
    'content-length':String(buffer.length),
    'content-disposition':'attachment; filename="'+filename+'"',
    'cache-control':'no-store, private',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'vary':'Origin',
    ...(origin?{'access-control-allow-origin':origin}:{})
  });
  res.end(buffer);
}
function send(res,status,data,origin='') {
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer','vary':'Origin',
    ...(origin ? {'access-control-allow-origin':origin} : {})
  });
  res.end(JSON.stringify(data));
}
async function readJson(req) {
  if (String(req.headers['content-type']||'').split(';')[0].trim()!=='application/json')
    throw new HttpError(415,'JSON_REQUIRED','Send an application/json request');
  let body=''; for await(const chunk of req) {
    body+=chunk.toString('utf8');
    if(Buffer.byteLength(body)>8192)throw new HttpError(413,'TOO_LARGE','Request too large');
  }
  try {
    const obj=JSON.parse(body);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error();
    return obj;
  }catch{throw new HttpError(400,'BAD_JSON','Expected a JSON object')}
}
function input(obj,key,max=120) {
  const v=obj[key];
  if(typeof v!=='string'||!v.trim()||v.length>max)
    throw new HttpError(400,'BAD_INPUT','Invalid '+key);
  return v.trim();
}
function validPeriod(obj) {
  const from=input(obj,'from',10),to=input(obj,'to',10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw new HttpError(400,'BAD_DATES','Use YYYY-MM-DD');
  const a=Date.parse(from+'T00:00:00Z'),b=Date.parse(to+'T00:00:00Z');
  if(!Number.isFinite(a)||!Number.isFinite(b)||
     new Date(a).toISOString().slice(0,10)!==from||
     new Date(b).toISOString().slice(0,10)!==to||a>b||
     b-a>366*86400000||b>Date.now()+86400000)
    throw new HttpError(400,'BAD_DATES','Invalid reporting period');
  return {from,to};
}
async function principal(req,verify) {
  const h=req.headers.authorization||'';
  if(typeof h!=='string'||!/^Bearer \S+$/.test(h))
    throw new HttpError(401,'AUTH_REQUIRED','Sign in to continue');
  try {
    const p=await verify(h.slice(7));
    if(typeof p?.uid!=='string'||!p.uid)throw new Error();
    return p;
  }catch {throw new HttpError(401,'AUTH_REQUIRED','Session invalid or revoked')}
}
export function createHandler({verify,store,allowedOrigin='',logger=console,enableCustomerModule=false,nsave=null}) {
  if(typeof verify!=='function'||!store)throw new TypeError('Verification and storage required');
  return async (req,res)=>{
    const origin=allowedOrigin&&req.headers.origin===allowedOrigin?allowedOrigin:'';
    try {
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/health')
        return send(res,200,{ok:true,service:'ledgerdesk-statement-api'},origin);
      if(req.method==='OPTIONS') {
        if(!origin)throw new HttpError(403,'ORIGIN_BLOCKED','Origin not allowed');
        res.writeHead(204,{
          'access-control-allow-origin':origin,
          'access-control-allow-methods':'GET,POST,PATCH,OPTIONS',
          'access-control-allow-headers':'Authorization,Content-Type',
          'access-control-max-age':'600','vary':'Origin'
        });
        return res.end();
      }
      if(req.headers.origin&&!origin)
        throw new HttpError(403,'ORIGIN_BLOCKED','Origin not allowed');
      const user=await principal(req,verify);
      if(req.method==='GET'&&url.pathname==='/v1/me/access'){
        const organizations=await store.listManagerOrganizations(user.uid);
        const pendingPasswordChange=await store.managerPasswordChangeNeeded?.(user.uid)||false;
        return send(res,200,{data:{manager:organizations.length>0,organizations,pendingPasswordChange}},origin);
      }
      // The legacy customer API belongs to a future independent Ledger API module.
      // In this organization-level Manager portal it remains disabled by default.
      if(!enableCustomerModule&&url.pathname.startsWith('/v1/me/'))
        throw new HttpError(404,'NOT_FOUND','Customer module is not available on this service');
      if(req.method==='GET'&&url.pathname==='/v1/me/accounts')
        return send(res,200,{data:await store.listAccountsForUid(user.uid)},origin);
      if(req.method==='GET'&&url.pathname==='/v1/me/statement-requests')
        return send(res,200,{data:await store.listRequestsForUid(user.uid)},origin);
      if(req.method==='POST'&&url.pathname==='/v1/me/statement-requests') {
        const data=await readJson(req), accountId=input(data,'accountId',100),period=validPeriod(data);
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(accountId))throw new HttpError(400,'BAD_ACCOUNT','Invalid account ID');
        const account=await store.findAccountForUid(user.uid,accountId);
        if(!account)throw new HttpError(404,'NOT_FOUND','Account not found');
        if(account.verification_status!=='verified'||!account.issuer_org_id)
          throw new HttpError(409,'NOT_VERIFIED','Account is not verified by an issuer');
        const request=await store.createRequest({
          requesterUid:user.uid,customerId:account.customer_id,accountId:account.id,
          issuerOrgId:account.issuer_org_id,...period
        });
        return send(res,202,{data:request},origin);
      }
      const detail=/^\/v1\/me\/statement-requests\/([0-9a-f-]{36})$/.exec(url.pathname);
      if(req.method==='GET'&&detail) {
        const item=await store.getRequestForUid(user.uid,detail[1]);
        if(!item)throw new HttpError(404,'NOT_FOUND','Statement request not found');
        return send(res,200,{data:item},origin);
      }
      const download=/^\/v1\/me\/statements\/([0-9a-f-]{36})\/download$/.exec(url.pathname);
      if(req.method==='GET'&&download) {
        const item=await store.getRequestForUid(user.uid,download[1]);
        if(!item)throw new HttpError(404,'NOT_FOUND','Statement not found');
        // No PDF is delivered until a separately authorized issuer system is integrated.
        throw new HttpError(409,'ISSUER_NOT_CONNECTED','Issuer-certified PDF delivery is not configured');
      }
      // All manager data is scoped to active grants and issuer organizations in SQL.
      const managerPath=url.pathname.startsWith('/v1/manager/');
      if(managerPath&&!await store.isManager(user.uid)){
        throw new HttpError(403,'FORBIDDEN','Organization manager access required');
      }
      // nSave live customer data is available only to authenticated organization managers.
      if(url.pathname.startsWith('/v1/manager/nsave/')) {
        if(!nsave||!nsave.configured())
          throw new HttpError(503,'NSAVE_NOT_CONFIGURED','nSave API credentials are not configured on this service');
        if(req.method==='GET'&&url.pathname==='/v1/manager/nsave/customers'){
          const limit=Number(url.searchParams.get('limit')||50);
          const offset=Number(url.searchParams.get('offset')||0);
          if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)
            throw new HttpError(400,'BAD_PAGINATION','Use limit 1–50 and a nonnegative offset');
          return send(res,200,{data:await nsave.listCustomers({limit,offset})},origin);
        }
        const detail=/^\/v1\/manager\/nsave\/customers\/([A-Za-z0-9_-]{1,160})$/.exec(url.pathname);
        if(req.method==='GET'&&detail){
          const start=url.searchParams.get('start'),end=url.searchParams.get('end');
          if((start===null)!==(end===null))
            throw new HttpError(400,'BAD_DATES','Provide both start and end dates');
          if(start!==null)validPeriod({from:start,to:end});
          return send(res,200,{data:await nsave.getCustomer(detail[1],
            start===null?{}:{start,end})},origin);
        }
        if(req.method==='POST'&&url.pathname==='/v1/manager/nsave/statements/generate'){
          const data=await readJson(req);
          const customerId=input(data,'customerId',160);
          const customerReference=input(data,'customerReference',160);
          const accountReference=input(data,'accountReference',160);
          const {from,to}=validPeriod(data);
          if(!/^[A-Za-z0-9_-]+$/.test(customerId)||!/^nsave_[A-Za-z0-9_-]+$/.test(customerReference)||
             !/^nsave_[A-Za-z0-9_-]+$/.test(accountReference))
            throw new HttpError(400,'BAD_INPUT','Invalid nSave customer or account reference');
          const organizations=await store.listManagerOrganizations(user.uid);
          if(!organizations.length)
            throw new HttpError(403,'NO_ORGANIZATION_ACCESS','No active manager organization grant');
          const payload=await nsave.getStatement(accountReference,{start:from,end:to});
          let statement;
          try{
            statement=normalizeNsaveStatement(payload,{accountReference,customerReference,from,to});
            if(!statement.organizationReference)
              throw new Error('Missing nSave organization reference');
            if(process.env.NSAVE_ORGANIZATION_REFERENCE&&
              statement.organizationReference!==process.env.NSAVE_ORGANIZATION_REFERENCE)
              throw new Error('Statement organization does not match configured nSave organization');
          }catch(error){
            throw new HttpError(409,'STATEMENT_DATA_UNVERIFIED',
              'Statement not issued: '+String(error?.message||'nSave source data could not be verified').slice(0,220));
          }
          const pdf=await renderNsaveStatement(statement);
          const audit={actorUid:user.uid,organizationReference:statement.organizationReference,
            customerReference:statement.customerReference,accountReference:statement.accountReference,
            requestReference:statement.requestReference,from,to};
          await store.recordStatementAudit({...audit,action:'statement.generated'});
          await store.recordStatementAudit({...audit,action:'statement.downloaded'});
          const filename='nsave-statement-'+from+'-to-'+to+'.pdf';
          return sendPdf(res,pdf,filename,origin);
        }
        if(req.method==='POST'&&url.pathname==='/v1/manager/nsave/statement-readiness'){
          const data=await readJson(req);
          const customerId=input(data,'customerId',160),accountId=input(data,'accountId',160);
          const {from,to}=validPeriod(data);
          if(!/^[A-Za-z0-9_-]+$/.test(customerId)||!/^[A-Za-z0-9_-]+$/.test(accountId))
            throw new HttpError(400,'BAD_INPUT','Invalid nSave customer or account reference');
          // nSave Management approved the existing statements endpoint as the source
          // of record for statement-period data. accountId here is the nSave account reference.
          const organizations=await store.listManagerOrganizations(user.uid);
          if(!organizations.length)
            throw new HttpError(403,'NO_ORGANIZATION_ACCESS','No active manager organization grant');
          const statement=await nsave.getStatement(accountId,{start:from,end:to});
          return send(res,200,{data:{source:'NSAVE_STATEMENTS_API',
            customerId,accountReference:accountId,issuerOrgId:organizations[0].issuerOrgId,
            from,to,statement,statementSchema:safeShape(statement),
            officialStatementReady:true,
            note:'Statement data retrieved from the approved nSave statements endpoint.'}},origin);
        }
        if(req.method==='POST'&&url.pathname==='/v1/manager/nsave/customers/search'){
          const criteria=await readJson(req);
          return send(res,200,{data:await nsave.searchCustomer(criteria)},origin);
        }
        throw new HttpError(404,'NOT_FOUND','nSave customer route not found');
      }
      if(req.method==='GET'&&url.pathname==='/v1/manager/summary')
        return send(res,200,{data:await store.getManagerSummary(user.uid)},origin);
      if(req.method==='GET'&&url.pathname==='/v1/manager/statement-requests')
        return send(res,200,{data:await store.listManagerRequests(user.uid)},origin);
      if(req.method==='GET'&&url.pathname==='/v1/manager/customers'){
        const query=String(url.searchParams.get('query')||'').trim();
        if(!/^[A-Za-z0-9_-]{3,100}$/.test(query))
          throw new HttpError(400,'BAD_QUERY','Enter at least 3 characters of a customer ID');
        return send(res,200,{data:await store.searchManagerCustomers(user.uid,query)},origin);
      }
      if(req.method==='GET'&&url.pathname==='/v1/manager/managed-customers'){
        const query=String(url.searchParams.get('query')||'').trim();
        if(query.length>100||!/^[A-Za-z0-9 _.-]*$/.test(query))
          throw new HttpError(400,'BAD_QUERY','Invalid customer search');
        return send(res,200,{data:await store.listManagedCustomers(user.uid,query)},origin);
      }
      if(req.method==='POST'&&url.pathname==='/v1/manager/managed-customers'){
        const data=await readJson(req);
        const org=input(data,'issuerOrgId',100),displayName=input(data,'displayName',120);
        const email=data.email==null?'':String(data.email).trim();
        if(!/^[A-Za-z0-9_-]{1,100}$/.test(org)||
           displayName.length<2||/[<>\u0000-\u001f]/.test(displayName)||
           email.length>254||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
          throw new HttpError(400,'BAD_INPUT','Check customer name, email and organization');
        const created=await store.createManagedCustomer(user.uid,org,displayName,email);
        if(!created)throw new HttpError(404,'NOT_FOUND','Issuer access not found');
        return send(res,201,{data:created},origin);
      }
      const managedEdit=/^\/v1\/manager\/managed-customers\/(cust_[a-f0-9]{32})$/.exec(url.pathname);
      if(req.method==='PATCH'&&managedEdit){
        const data=await readJson(req),displayName=input(data,'displayName',120);
        const email=data.email==null?'':String(data.email).trim();
        if(displayName.length<2||/[<>\u0000-\u001f]/.test(displayName)||
          email.length>254||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
          throw new HttpError(400,'BAD_INPUT','Check customer name and email');
        const changed=await store.updateManagedCustomer(user.uid,managedEdit[1],displayName,email);
        if(!changed)throw new HttpError(404,'NOT_FOUND','Customer not found');
        return send(res,200,{data:changed},origin);
      }
      const managedArchive=/^\/v1\/manager\/managed-customers\/(cust_[a-f0-9]{32})\/archive$/.exec(url.pathname);
      if(req.method==='POST'&&managedArchive){
        const changed=await store.deactivateManagedCustomer(user.uid,managedArchive[1]);
        if(!changed)throw new HttpError(404,'NOT_FOUND','Customer not found');
        return send(res,200,{data:changed},origin);
      }
      if(req.method==='GET'&&url.pathname==='/v1/manager/audit-logs')
        return send(res,200,{data:await store.listManagerAudit(user.uid)},origin);
      const managerAccounts=/^\/v1\/manager\/customers\/([A-Za-z0-9_-]{1,100})\/accounts$/.exec(url.pathname);
      if(req.method==='GET'&&managerAccounts)
        return send(res,200,{data:await store.listManagerAccounts(user.uid,managerAccounts[1])},origin);
      const manager=/^\/v1\/manager\/customers\/([A-Za-z0-9_-]{1,100})\/statement-requests$/.exec(url.pathname);
      if(req.method==='POST'&&manager) {
        // Manager grants live only in the administrator-owned database table,
        // not in client-provided claims, JWT profile fields, or request bodies.
        if(!await store.isManager(user.uid))
          throw new HttpError(403,'FORBIDDEN','Organization manager access required');
        const data=await readJson(req),accountId=input(data,'accountId',100),period=validPeriod(data);
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(accountId))throw new HttpError(400,'BAD_ACCOUNT','Invalid account ID');
        const account=await store.findAccountForManager(manager[1],accountId,user.uid);
        if(!account)throw new HttpError(404,'NOT_FOUND','Account not found');
        if(account.verification_status!=='verified')
          throw new HttpError(409,'NOT_VERIFIED','Account is not issuer-verified');
        const request=await store.createRequest({
          requesterUid:user.uid,customerId:account.customer_id,accountId:account.id,
          issuerOrgId:account.issuer_org_id,...period
        });
        return send(res,202,{data:request},origin);
      }
      throw new HttpError(404,'NOT_FOUND','API route not found');
    }catch(error) {
      if(res.headersSent)return;
      if(error?.name==='SourceNotVerified')
        return send(res,409,{error:{code:'NOT_VERIFIED',message:'Account is not issuer-verified'}},origin);
      if(error instanceof HttpError)
        return send(res,error.status,{error:{code:error.code,message:error.message}},origin);
      if(error?.code==='NSAVE_SERVICE_TOKEN_REJECTED')
        return send(res,502,{error:{code:'NSAVE_SERVICE_TOKEN_REJECTED',
          message:"nSave rejected the service token. Check Render's NSAVE_SITE_SERVICE_TOKEN against Fly's LEDGER_SERVICE_TOKEN."}},origin);
      if(error?.code==='NSAVE_AUTH_FAILED')
        return send(res,502,{error:{code:error.code,message:error.upstreamStatus===403?
          'nSave denied access (403). Check Site token and manager key organization permissions.':
          'nSave authentication failed (401). Check that both API credentials are active and valid.'}},origin);
      if(error?.code==='UPSTREAM_RATE_LIMIT')
        return send(res,429,{error:{code:error.code,message:'nSave rate limit reached. Try again later.'}},origin);
      if(error?.code==='NSAVE_API_ERROR')
        return send(res,502,{error:{code:error.code,message:'nSave customer API returned an error ('+(error.upstreamStatus||'unknown')+'). Contact the nSave administrator.'}},origin);
      logger.error('Statement API internal error',error?.name||'UnknownError');
      return send(res,503,{error:{code:'SERVICE_NOT_READY',message:'Issuer ledger service unavailable'}},origin);
    }
  };
}
