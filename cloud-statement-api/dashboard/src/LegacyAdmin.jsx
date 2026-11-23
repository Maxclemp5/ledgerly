import React,{useState,useEffect,useCallback} from 'react';
import {LayoutDashboard,Users,ArrowLeftRight,FileText,BarChart3,ShieldCheck,ScrollText,Settings,Plus,Search,RefreshCw,ArrowRight,Archive,Pencil,LockKeyhole} from 'lucide-react';
import './legacyAdmin.css';

const modules=[
 ['dashboard','Dashboard',LayoutDashboard],['customers','Customers',Users],
 ['transactions','Transactions',ArrowLeftRight],['statements','Statements',FileText],
 ['reports','Reports',BarChart3],['approvals','Approvals',ShieldCheck],
 ['audit','Audit Logs',ScrollText],['settings','Settings',Settings]
];
const niceDate=t=>t?new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function Empty({title,detail}){return <div className="old-empty"><ShieldCheck size={24}/><h3>{title}</h3><p>{detail}</p></div>}
function Alert({error,ok}){return (error||ok)?<div role="status" className={'old-alert '+(error?'error':'ok')}>{error||ok}</div>:null}
function PasswordForm({authClient,onSuccess,mandatory=false}){
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('');
 async function submit(e){
  e.preventDefault();setError('');setOk('');
  if(next.length<12){setError('Use a new password of at least 12 characters.');return}
  if(next===current){setError('Your new password must be different.');return}
  if(next!==confirm){setError('Passwords do not match.');return}
  setBusy(true);
  try{
   const r=await authClient.changePassword({currentPassword:current,newPassword:next,revokeOtherSessions:true});
   if(r?.error)throw new Error(r.error.message||'Unable to update password');
   setCurrent('');setNext('');setConfirm('');
   setOk('Password updated. Other sessions were revoked.');
   await onSuccess?.();
  }catch(e){setError(e.message||'Password change failed')}finally{setBusy(false)}
 }
 return <div className="old-password">
  <span className="old-password-symbol"><LockKeyhole size={22}/></span>
  <h2>{mandatory?'Change your temporary password':'Security settings'}</h2>
  <p>{mandatory?'Before entering the Admin Dashboard, change your initial manager password.':'Update your password privately with your current password.'}</p>
  <Alert error={error} ok={ok}/>
  <form onSubmit={submit} className="old-form">
   <label>Current / temporary password<input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required/></label>
   <label>New private password<input type="password" autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} required minLength={12}/></label>
   <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={12}/></label>
   <button className="old-primary" disabled={busy}>{busy?'Updating…':mandatory?'Activate manager access':'Change password'} <ArrowRight size={16}/></button>
  </form>
  <small>Only the authentication provider processes your password. It is never stored in LedgerDesk customer tables.</small>
 </div>;
}
export {PasswordForm as ManagerPasswordForm};
function GridTable({rows,kind}){
 if(!rows.length)return <Empty title={kind==='audit'?'No audit activity':'No requests yet'} detail={kind==='audit'?'Customer changes will be recorded here.':'An authorized issuer must review all submitted requests.'}/>;
 const audit=kind==='audit';
 return <div className="old-overflow"><table><thead><tr>{(audit?['Event','Customer ID','Issuer','Date']:['Customer','Account','Period','Status','Date']).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||r.targetId+i}>{audit?<>
  <td>{r.eventType}</td><td>{r.targetId}</td><td>{r.issuerOrgId}</td><td>{niceDate(r.createdAt)}</td>
  </>:<><td>{r.customerId}</td><td>{r.accountId}</td><td>{niceDate(r.from)} – {niceDate(r.to)}</td><td><span className="old-chip">{String(r.status).replaceAll('_',' ')}</span></td><td>{niceDate(r.createdAt)}</td></>}</tr>)}</tbody></table></div>;
}
function nsaveMatches(payload){
 const raw=Array.isArray(payload)?payload:
  Array.isArray(payload?.customers)?payload.customers:
  Array.isArray(payload?.matches)?payload.matches:
  Array.isArray(payload?.results)?payload.results:
  Array.isArray(payload?.data)?payload.data:
  payload?.customer?[payload.customer]:
  payload?.data&&typeof payload.data==='object'?[payload.data]:
  payload&&typeof payload==='object'&&!('next_offset' in payload)?[payload]:[];
 return raw.filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
}
function NsaveLookup({api}){
 const [mode,setMode]=useState('account_number'),[query,setQuery]=useState('');
 const [results,setResults]=useState([]),[searched,setSearched]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function search(event){
  event.preventDefault();
  const value=query.trim();setError('');setResults([]);setSearched(false);
  if(!value){setError('Enter a bank account number or full customer name.');return}
  if(mode==='account_number'&&!/^[0-9]+$/.test(value)){setError('Enter the exact bank account number using digits only, including any leading zeros.');return}
  if(value.length>160){setError('Search text must be 160 characters or fewer.');return}
  setBusy(true);
  try{
   const response=await api('/v1/manager/nsave/customers/search',{method:'POST',body:{[mode]:value}});
   setResults(nsaveMatches(response));setSearched(true);
  }catch(e){setError(e.message||'nSave lookup failed.');}finally{setBusy(false)}
 }
 return <div className="old-card">
  <div className="old-bar"><div><h2>nSave customer lookup</h2><p>Search live nSave customer records. This does not search internal LedgerDesk profiles.</p></div></div>
  <form className="old-form" onSubmit={search}>
   <label>Search type<select value={mode} onChange={e=>{setMode(e.target.value);setQuery('');setResults([]);setSearched(false);setError('')}}>
     <option value="account_number">Exact bank account number</option>
     <option value="name">Full customer name</option>
   </select></label>
   <label>{mode==='account_number'?'Bank account number':'Customer full name'}
    <input aria-label="nSave customer lookup" autoComplete="off" maxLength={160} value={query} onChange={e=>setQuery(e.target.value)}
     placeholder={mode==='account_number'?'Include all digits and leading zeros':'Enter full name exactly'} required/>
   </label>
   <button type="submit" className="old-primary" disabled={busy}>{busy?'Searching nSave…':'Search nSave'} <Search size={16}/></button>
  </form>
  <Alert error={error}/>
  {searched&&(results.length===0?<Empty title="No nSave matches" detail="No matching customer was returned by nSave for that exact search."/>:
   <div className="old-overflow"><table><thead><tr><th>Customer</th><th>nSave reference</th><th>Verification</th></tr></thead>
    <tbody>{results.map((item,i)=><tr key={String(item.id||item.customer_id||item.customerId||i)}>
     <td><b>{String(item.full_name||item.fullName||item.name||[item.first_name,item.last_name].filter(Boolean).join(' ')||'Name not provided')}</b></td>
     <td className="old-id">{String(item.id||item.customer_id||item.customerId||item.nsave_reference||'—')}</td>
     <td><span className="old-chip">{String(item.kyc_status||item.kycStatus||item.status||'Not provided')}</span></td>
    </tr>)}</tbody></table>
   <p>Bank account numbers and other sensitive fields are not displayed in these search results.</p></div>)}
 </div>;
}
function Customers({api,orgs,changed}){
 const [data,setData]=useState([]),[query,setQuery]=useState(''),[applied,setApplied]=useState('');
 const [editing,setEditing]=useState(null),[open,setOpen]=useState(false);
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[org,setOrg]=useState(orgs[0]?.issuerOrgId||'');
 const [error,setError]=useState(''),[ok,setOk]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  setLoading(true);
  try{setData(await api('/v1/manager/managed-customers?query='+encodeURIComponent(applied))||[])}
  catch(e){setError(e.message)}finally{setLoading(false)}
 },[api,applied,changed]);
 useEffect(()=>{load()},[load]);
 function start(row=null){setEditing(row);setName(row?.displayName||'');setEmail(row?.email||'');setOrg(row?.issuerOrgId||orgs[0]?.issuerOrgId||'');setOpen(true);setError('');setOk('')}
 async function save(e){
  e.preventDefault();setBusy(true);setError('');
  try{
   if(name.trim().length<2)throw new Error('Enter a customer name');
   const body={displayName:name.trim(),email:email.trim()};
   await api(editing?'/v1/manager/managed-customers/'+editing.customerId:'/v1/manager/managed-customers',{method:editing?'PATCH':'POST',body:editing?body:{...body,issuerOrgId:org}});
   setOpen(false);setOk('Customer saved as an unverified internal record.');await load();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function archive(row){
  if(!window.confirm('Archive internal customer '+row.displayName+'?'))return;
  try{await api('/v1/manager/managed-customers/'+row.customerId+'/archive',{method:'POST'});setOk('Customer archived.');await load()}
  catch(e){setError(e.message)}
 }
 return <>
  <NsaveLookup api={api}/>
  <div className="old-bar"><div><h2>Internal customer management</h2><p>Manage separate, unverified LedgerDesk profiles for your authorized issuer.</p></div><button className="old-primary" onClick={()=>start()}><Plus size={16}/> Add Customer</button></div>
  <Alert error={error} ok={ok}/>
  {open&&<div className="old-card old-edit"><div className="old-bar"><h2>{editing?'Edit Customer':'New Customer'}</h2><button className="old-secondary" onClick={()=>setOpen(false)}>Close</button></div>
   <form className="old-form" onSubmit={save}>
    <label>Issuer Organization<select disabled={!!editing} value={org} onChange={e=>setOrg(e.target.value)} required>{orgs.map(x=><option key={x.issuerOrgId} value={x.issuerOrgId}>{x.issuerOrgId}</option>)}</select></label>
    <label>Customer full name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label>
    <label>Email (optional)<input value={email} type="email" maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>
    <p>New customers stay UNVERIFIED. This does not create verified bank accounts.</p>
    <button type="submit" className="old-primary" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create customer'}</button>
   </form></div>}
  <div className="old-card">
   <form className="old-search" onSubmit={e=>{e.preventDefault();setApplied(query.trim())}}><Search size={18}/><input aria-label="Search customers" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search internal customer name or ID"/><button className="old-secondary" type="submit">Search</button></form>
   {loading?<p className="old-loading">Loading…</p>:!data.length?<Empty title="No customers yet" detail="Add an internal customer record to begin. Bank verification remains issuer-controlled."/>:
   <div className="old-overflow"><table><thead><tr><th>Name</th><th>Customer ID</th><th>Organization</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.map(row=><tr key={row.customerId}>
    <td><b>{row.displayName}</b><small>{row.email||'No email'}</small></td><td className="old-id">{row.customerId}</td><td>{row.issuerOrgId}</td><td><span className="old-chip">Unverified</span></td>
    <td><div className="old-actions"><button onClick={()=>start(row)} aria-label={'Edit '+row.displayName}><Pencil size={15}/></button><button onClick={()=>archive(row)} aria-label={'Archive '+row.displayName}><Archive size={15}/></button></div></td>
   </tr>)}</tbody></table></div>}</div>
 </>;
}
function Stat({name,num,icon:Icon}){return <div className="old-stat"><span><Icon size={21}/></span><small>{name}</small><strong>{num}</strong></div>}
export default function LegacyAdmin({api,authClient,organizations=[],session}){
 const [section,setSection]=useState('dashboard'),[summary,setSummary]=useState({}),[requests,setRequests]=useState([]),[audit,setAudit]=useState([]),[error,setError]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{let alive=true;Promise.all([api('/v1/manager/summary'),api('/v1/manager/statement-requests'),api('/v1/manager/audit-logs')])
  .then(([s,r,a])=>{if(alive){setSummary(s||{});setRequests(r||[]);setAudit(a||[])}})
  .catch(e=>{if(alive)setError(e.message)});return()=>{alive=false};},[api,tick]);
 const pending=requests.filter(x=>x.status==='PENDING_ISSUER');
 return <div className="old-dashboard">
  <div className="old-intro"><div><small>LEDGER DESK / ADMIN WORKSPACE</small><h1>Admin Dashboard</h1><p>Welcome, {session?.user?.name||'Manager'} · Issuer-scoped customer workspace</p></div><div className="old-authorized"><ShieldCheck size={17}/> AUTHORIZED MANAGER</div></div>
  <div className="old-layout"><nav className="old-nav" aria-label="Admin dashboard navigation"><span>MANAGEMENT</span>
   {modules.map(([id,title,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon size={18}/>{title}</button>)}
   <div className="old-nav-footer"><ShieldCheck size={19}/><strong>{organizations.length} approved issuer{organizations.length!==1?'s':''}</strong></div>
  </nav><main className="old-main">
   <div className="old-bar"><div><small>MANAGEMENT CENTER</small><h2>{modules.find(x=>x[0]===section)?.[1]}</h2></div><button className="old-secondary" onClick={()=>setTick(v=>v+1)}><RefreshCw size={16}/> Refresh</button></div>
   <Alert error={error}/>
   {section==='dashboard'&&<><div className="old-stats"><Stat name="Verified customers" num={summary.customers??0} icon={Users}/><Stat name="Verified accounts" num={summary.verifiedAccounts??0} icon={ShieldCheck}/><Stat name="Requests" num={summary.totalRequests??0} icon={FileText}/><Stat name="Pending" num={summary.pendingRequests??0} icon={BarChart3}/></div>
    <div className="old-tip"><ShieldCheck size={24}/><div><b>Account permissions secured</b><p>Manager permissions are limited to approved issuer organizations. New customer profiles remain unverified.</p></div><button className="old-primary" onClick={()=>setSection('customers')}>Manage Customers <ArrowRight size={15}/></button></div>
    <div className="old-card"><h2>Recent statement requests</h2><GridTable rows={requests.slice(0,8)}/></div></>}
   {section==='customers'&&<Customers api={api} orgs={organizations} changed={tick}/>}
   {section==='transactions'&&<div className="old-card"><Empty title="Verified ledger not connected" detail="Transactions cannot be added or edited without an authorized issuer source."/></div>}
   {section==='statements'&&<div className="old-card"><h2>Statement requests</h2><p>Only issuer review requests; this is not an official statement generator.</p><GridTable rows={requests}/></div>}
   {section==='reports'&&<><div className="old-stats"><Stat name="Issuer customers" num={summary.customers??0} icon={Users}/><Stat name="Accounts" num={summary.verifiedAccounts??0} icon={ShieldCheck}/><Stat name="Requests" num={summary.totalRequests??0} icon={FileText}/><Stat name="Pending" num={pending.length} icon={BarChart3}/></div><div className="old-card"><Empty title="Reporting unavailable" detail="Connect an authorized issuer ledger before enabling financial reporting."/></div></>}
   {section==='approvals'&&<div className="old-card"><h2>Pending issuer reviews</h2><p>This is read-only. Only an authorized issuer may approve bank statements.</p><GridTable rows={pending}/></div>}
   {section==='audit'&&<div className="old-card"><h2>Customer administration log</h2><GridTable kind="audit" rows={audit}/></div>}
   {section==='settings'&&<PasswordForm authClient={authClient}/>}
  </main></div>
 </div>;
}