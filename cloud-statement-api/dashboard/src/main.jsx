import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createAuthClient} from '@neon/auth';
import {BetterAuthReactAdapter} from '@neon/auth/react/adapters';
import {
  LayoutDashboard, WalletCards, FileText, UsersRound, LogOut, ChevronRight,
  ArrowRight, Search, RefreshCw, CheckCircle2, CircleAlert, ShieldCheck,
  LockKeyhole, Mail, Eye, EyeOff, Clock3, PanelLeftClose, Menu, X,
  Building2, Activity, Plus, CalendarDays, Headphones, KeyRound
} from 'lucide-react';
import './style.css';
import {createNeonOtp} from './neonOtp.js';
import LegacyAdmin,{ManagerPasswordForm} from './LegacyAdmin.jsx';

const API='';
const blankForm={accountId:'',from:'',to:''};
const emptySummary={customers:0,verifiedAccounts:0,totalRequests:0,pendingRequests:0};
function formatDate(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
function initials(name){return String(name||'User').split(/[\s@]+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}
function roleFromPath(){return location.pathname==='/manager'?'manager':'customer';}
function statusLabel(value){return String(value||'unknown').replaceAll('_',' ').toLowerCase();}
function Status({value}){
  const v=String(value||'');
  const tone=v==='verified'||v==='ISSUED'?'success':v==='REJECTED'||v==='revoked'?'danger':'pending';
  return <span className={'status status-'+tone}><span className="status-dot"/>{statusLabel(v)}</span>;
}
function Empty({icon:Icon=FileText,title,body}){
  return <div className="empty"><span className="empty-symbol"><Icon size={23}/></span><strong>{title}</strong><p>{body}</p></div>;
}
function Notice({message,kind='error',onClose}){
  if(!message)return null;
  return <div className={'notice notice-'+kind} role={kind==='error'?'alert':'status'}>
    {kind==='error'?<CircleAlert size={19}/>:<CheckCircle2 size={19}/>}
    <span>{message}</span>{onClose&&<button className="icon-button" aria-label="Dismiss" onClick={onClose}><X size={16}/></button>}
  </div>;
}
function Brand({compact=false}){
  return <div className={'brand '+(compact?'brand-compact':'')}>
    <span className="brand-symbol"><span className="brand-glyph">LD</span></span>
    {!compact&&<span className="brand-wordmark"><strong>LEDGER</strong><span>DESK</span></span>}
  </div>;
}
function PasswordField({value,onChange,placeholder='Enter your password',autoComplete='current-password',required=true}){
  const [show,setShow]=useState(false);
  return <div className="password-wrap">
    <input type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      minLength={8} autoComplete={autoComplete} required={required}/>
    <button className="password-toggle" type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>
      {show?<EyeOff size={18}/>:<Eye size={18}/>}
    </button>
  </div>;
}

function AuthScreen({authClient,onAuthenticated}){
  const [audience,setAudience]=useState(roleFromPath);
  const [mode,setMode]=useState('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [otp,setOtp]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const changeMode=next=>{setMode(next);setError('');setSuccess('');setOtp('');};
  async function run(fn){
    setBusy(true);setError('');setSuccess('');
    try{await fn();}catch(err){setError(err?.message||'Something went wrong. Please try again.');}
    finally{setBusy(false);}
  }
  async function submit(e){
    e.preventDefault();
    await run(async()=>{
      let result;
      if(mode==='login'){
        result=await authClient.signIn.email({email:email.trim(),password});
        if(result.error){
          if(String(result.error.code||'').includes('VERIFIED')||/verif/i.test(result.error.message||'')){
            changeMode('verify');
            setSuccess('Verify your email to finish signing in.');
            return;
          }
          throw new Error(result.error.message||'Incorrect credentials');
        }
        await onAuthenticated(audience);
        return;
      }
      if(mode==='signup'){
        result=await authClient.signUp.email({name:name.trim(),email:email.trim(),password});
        if(result.error)throw new Error(result.error.message||'Could not create the account');
        changeMode('verify');
        setSuccess('We sent a verification code to your email. Enter it below to activate your account.');
        return;
      }
      if(mode==='verify'){
        result=await createNeonOtp(authClient).verifyEmail(email.trim(),otp.trim());
        if(result.error)throw new Error(result.error.message||'Invalid or expired code');
        const login=await authClient.signIn.email({email:email.trim(),password});
        if(login.error){
          changeMode('login');
          setSuccess('Email verified. Sign in using your password.');
          return;
        }
        await onAuthenticated(audience);
        return;
      }
      if(mode==='forgot'){
        result=await createNeonOtp(authClient).requestPasswordReset(email.trim());
        if(result.error)throw new Error(result.error.message||'Could not request a reset code');
        changeMode('reset');
        setSuccess('If that email is registered, a password-reset code will arrive shortly.');
        return;
      }
      if(mode==='reset'){
        result=await createNeonOtp(authClient).resetPassword(email.trim(),otp.trim(),password);
        if(result.error)throw new Error(result.error.message||'Unable to reset password');
        changeMode('login');
        setSuccess('Password updated. Sign in with your new password.');
      }
    });
  }
  async function resend(){
    await run(async()=>{
      const result=await createNeonOtp(authClient).sendVerificationOtp(email.trim());
      if(result.error)throw new Error(result.error.message||'Could not resend code');
      setSuccess('A new verification code was sent.');
    });
  }
  return <div className="auth-layout">
    <aside className="auth-illustration">
      <div className="auth-top"><Brand/><span className="auth-pill"><span className="live-light"/> DEVELOPMENT ENVIRONMENT</span></div>
      <div className="auth-pitch">
        <span className="eyebrow bright">YOUR FINANCIAL WORKSPACE</span>
        <h1>Your financial requests.<br/><em>Simplified.</em></h1>
        <p>One organized place for customers and authorized managers to track account verification and statement requests.</p>
        <div className="auth-feature"><span><ShieldCheck size={19}/></span><div><strong>Access you can trust</strong><small>Identity verified by Neon Auth. Manager permissions stay issuer-scoped.</small></div></div>
        <div className="auth-feature"><span><FileText size={19}/></span><div><strong>Requests, not generated statements</strong><small>Official document issuance needs a separate authorized issuer connection.</small></div></div>
      </div>
      <div className="auth-footer">LEDGER DESK <span>•</span> TEST ENVIRONMENT <span>•</span> NOT FOR LIVE CUSTOMER DATA</div>
    </aside>
    <main className="auth-panel">
      <div className="auth-panel-inner">
        <div className="auth-mobile-brand"><Brand/></div>
        <div className="auth-window">
          <div className="auth-overline"><LockKeyhole size={15}/> SECURE SIGN IN</div>
          <h2>{mode==='signup'?'Create your account':mode==='verify'?'Verify your email':mode==='forgot'?'Reset your password':mode==='reset'?'Set a new password':'Welcome back'}</h2>
          <p className="auth-subtitle">{mode==='login'?'Sign in to your Ledger Desk workspace.':mode==='signup'?'Start with a secure, verified identity.':mode==='verify'?'Enter the one-time code sent to your inbox.':mode==='forgot'?'We will email you a secure reset code.':'Enter the code and choose a strong new password.'}</p>
          <div className="audience-switch" role="group" aria-label="Workspace type">
            <button type="button" className={audience==='customer'?'selected':''} onClick={()=>setAudience('customer')}><WalletCards size={17}/> Customer</button>
            <button type="button" className={audience==='manager'?'selected':''} onClick={()=>setAudience('manager')}><ShieldCheck size={17}/> Manager</button>
          </div>
          {audience==='manager'&&<p className="role-help"><ShieldCheck size={14}/> Manager access requires an administrator-approved grant.</p>}
          <Notice message={error} onClose={()=>setError('')}/>
          <Notice message={success} kind="success" onClose={()=>setSuccess('')}/>
          <form onSubmit={submit} className="auth-form">
            {mode==='signup'&&<label>Full name<input autoComplete="name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" maxLength={120}/></label>}
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
            {(mode==='verify'||mode==='reset')&&<label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6-digit code" minLength={6} maxLength={10} required/></label>}
            {['login','signup','reset','verify'].includes(mode)&&<label>Password<PasswordField value={password} onChange={setPassword} autoComplete={mode==='signup'||mode==='reset'?'new-password':'current-password'} placeholder={mode==='reset'?'Create a new password':'Enter your password'}/></label>}
            {mode==='login'&&<div className="forgot-row"><button className="text-link" type="button" onClick={()=>changeMode('forgot')}>Forgot / set password?</button></div>}
            <button className="primary-button auth-submit" type="submit" disabled={busy}>
              {busy?<RefreshCw className="spinning" size={18}/>:null}
              {mode==='signup'?'Create account':mode==='verify'?'Verify and continue':mode==='forgot'?'Send reset code':mode==='reset'?'Reset password':'Sign in to workspace'}
              {!busy&&<ArrowRight size={17}/>}
            </button>
          </form>
          {mode==='verify'&&<button className="text-link centered" onClick={resend} disabled={busy}>Resend verification code</button>}
          <div className="auth-bottom">
            {mode==='login'?<>New to Ledger Desk? <button className="text-link" onClick={()=>changeMode('signup')}>Create an account</button></>:
            <>Already have an account? <button className="text-link" onClick={()=>changeMode('login')}>Sign in</button></>}
          </div>
          <p className="auth-disclaimer"><LockKeyhole size={13}/> Development environment. Do not enter real banking information.</p>
        </div>
      </div>
    </main>
  </div>;
}

function useApi(authClient,onUnauthorized){
  return useCallback(async(path,options={})=>{
    const tokenResult=await authClient.token();
    const jwt=tokenResult?.data?.token;
    if(tokenResult?.error||!jwt){onUnauthorized();throw new Error('Session expired. Please sign in again.');}
    const res=await fetch(API+path,{
      method:options.method||'GET',
      headers:{Authorization:'Bearer '+jwt,...(options.body?{'Content-Type':'application/json'}:{})},
      body:options.body?JSON.stringify(options.body):undefined,
      cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(res.status===401){onUnauthorized();throw new Error('Session expired. Please sign in again.');}
    if(!res.ok)throw new Error(data?.error?.message||'Request failed ('+res.status+')');
    return data.data;
  },[authClient,onUnauthorized]);
}
function Metric({title,value,icon:Icon,note,accent=false}){
  return <div className={'metric '+(accent?'metric-featured':'')}>
    <div className="metric-top"><span>{title}</span><span className="metric-icon"><Icon size={18}/></span></div>
    <strong>{value}</strong><small>{note}</small>
  </div>;
}
function RequestTable({requests,manager=false}){
  if(!requests.length)return <Empty icon={FileText} title="No statement requests yet" body="Requests you submit will appear here. An authorized issuer must review and process them."/>;
  return <div className="table-scroll"><table className="data-table"><thead><tr>{manager&&<th>Customer</th>}<th>Account</th><th>Period</th><th>Status</th><th>Requested</th></tr></thead>
    <tbody>{requests.map(item=><tr key={item.id}>{manager&&<td className="mono">{item.customerId}</td>}<td className="mono">{item.accountId}</td><td>{formatDate(item.from)} – {formatDate(item.to)}</td><td><Status value={item.status}/></td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody>
  </table></div>;
}
function CustomerDashboard({api,refreshKey}){
  const [accounts,setAccounts]=useState([]);
  const [requests,setRequests]=useState([]);
  const [form,setForm]=useState(blankForm);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const reload=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [a,r]=await Promise.all([api('/v1/me/accounts'),api('/v1/me/statement-requests')]);
      setAccounts(a||[]);setRequests(r||[]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[api]);
  useEffect(()=>{reload();},[reload,refreshKey]);
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');setSuccess('');
    try{
      await api('/v1/me/statement-requests',{method:'POST',body:form});
      setSuccess('Your request was submitted for issuer review. It is not an issued bank statement.');
      setForm(blankForm);await reload();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const verified=accounts.filter(x=>x.verificationStatus==='verified');
  return <>
    <div className="page-heading"><div><span className="eyebrow">CUSTOMER WORKSPACE</span><h1>Account overview</h1><p>Your accounts and statement requests, all in one place.</p></div><button className="secondary-button" onClick={reload} disabled={loading}><RefreshCw size={17} className={loading?'spinning':''}/> Refresh</button></div>
    <Notice message={error} onClose={()=>setError('')}/><Notice message={success} kind="success" onClose={()=>setSuccess('')}/>
    <div className="metric-grid three">
      <Metric title="Linked accounts" value={loading?'—':accounts.length} icon={WalletCards} note="Issuer-linked accounts" accent/>
      <Metric title="Total requests" value={loading?'—':requests.length} icon={FileText} note="Your submitted requests"/>
      <Metric title="Pending review" value={loading?'—':requests.filter(x=>x.status==='PENDING_ISSUER').length} icon={Clock3} note="Awaiting issuer processing"/>
    </div>
    <div className="content-grid">
      <section className="surface-card"><div className="card-heading"><div><h2>My accounts</h2><p>Only accounts verified and linked by an authorized issuer</p></div><WalletCards size={20}/></div>
        {loading?<div className="loading">Loading accounts…</div>:accounts.length===0?<Empty icon={WalletCards} title="No linked accounts" body="An authorized institution must verify and link your account before it appears here."/>:
          <div className="account-list">{accounts.map(x=><div className="account-row" key={x.id}><span className="account-icon"><WalletCards size={21}/></span><div className="account-desc"><strong>{x.displayName}</strong><small>{x.maskedNumber} · {x.currency}</small></div><Status value={x.verificationStatus}/></div>)}</div>}
      </section>
      <section className="surface-card form-card"><div className="card-heading"><div><h2>New statement request</h2><p>Request review of a specific account period</p></div><Plus size={20}/></div>
        <form className="request-form" onSubmit={submit}>
          <label>Verified account<select value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})} required disabled={!verified.length}>
            <option value="">Select an account</option>{verified.map(a=><option key={a.id} value={a.id}>{a.displayName} · {a.maskedNumber}</option>)}
          </select></label>
          <div className="date-grid"><label>From<input type="date" required value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label>To<input type="date" required value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label></div>
          <button type="submit" className="primary-button" disabled={!verified.length||busy}>{busy?'Submitting…':'Submit for review'}<ArrowRight size={16}/></button>
          <p className="fine-print"><ShieldCheck size={14}/> Only issuer-verified accounts can be requested. This does not generate a PDF.</p>
        </form>
      </section>
    </div>
    <section className="surface-card table-card"><div className="card-heading"><div><h2>Request history</h2><p>Track every request from submission to issuer response</p></div><FileText size={20}/></div>
      {loading?<div className="loading">Loading requests…</div>:<RequestTable requests={requests}/>}
    </section>
  </>;
}

function ManagerDashboard({api,organizations,refreshKey}){
  const [summary,setSummary]=useState(emptySummary);
  const [requests,setRequests]=useState([]);
  const [query,setQuery]=useState('');
  const [matches,setMatches]=useState([]);
  const [selected,setSelected]=useState(null);
  const [accounts,setAccounts]=useState([]);
  const [form,setForm]=useState(blankForm);
  const [tab,setTab]=useState('overview');
  const [loading,setLoading]=useState(true);
  const [searching,setSearching]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const reload=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [s,r]=await Promise.all([api('/v1/manager/summary'),api('/v1/manager/statement-requests')]);
      setSummary(s||emptySummary);setRequests(r||[]);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  },[api]);
  useEffect(()=>{reload();},[reload,refreshKey]);
  async function search(e){
    e.preventDefault();setError('');setSuccess('');
    if(!/^[A-Za-z0-9_-]{3,100}$/.test(query.trim())){setError('Enter at least three characters of a customer ID.');return;}
    setSearching(true);setSelected(null);setAccounts([]);
    try{setMatches(await api('/v1/manager/customers?query='+encodeURIComponent(query.trim()))||[]);}
    catch(e){setError(e.message);}finally{setSearching(false);}
  }
  async function selectCustomer(item){
    setSelected(item);setAccounts([]);setForm(blankForm);setError('');setTab('customers');
    try{setAccounts(await api('/v1/manager/customers/'+encodeURIComponent(item.customerId)+'/accounts')||[]);}
    catch(e){setError(e.message);}
  }
  async function submit(e){
    e.preventDefault();if(!selected)return;
    setBusy(true);setError('');setSuccess('');
    try{
      await api('/v1/manager/customers/'+encodeURIComponent(selected.customerId)+'/statement-requests',{method:'POST',body:form});
      setSuccess('Statement request submitted to issuer review for '+selected.customerId+'.');
      setForm(blankForm);await reload();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const verified=accounts.filter(x=>x.verificationStatus==='verified');
  return <>
    <div className="page-heading"><div><span className="eyebrow">AUTHORIZED MANAGER WORKSPACE</span><h1>Manager overview</h1><p>Issuer-scoped access to customer accounts and review requests.</p></div><button className="secondary-button" onClick={reload} disabled={loading}><RefreshCw size={17} className={loading?'spinning':''}/> Refresh</button></div>
    <Notice message={error} onClose={()=>setError('')}/><Notice message={success} kind="success" onClose={()=>setSuccess('')}/>
    <div className="manager-scope"><ShieldCheck size={18}/><div><strong>Issuer-scoped permissions active</strong><small>You can only access customers and requests for your approved organizations.</small></div>
      <span className="scope-label">{organizations.length} authorized issuer{organizations.length!==1?'s':''}</span></div>
    <div className="metric-grid four">
      <Metric title="Customers" value={loading?'—':summary.customers} icon={UsersRound} note="Within your organizations" accent/>
      <Metric title="Verified accounts" value={loading?'—':summary.verifiedAccounts} icon={WalletCards} note="Issuer-confirmed"/>
      <Metric title="Total requests" value={loading?'—':summary.totalRequests} icon={FileText} note="Across authorized issuers"/>
      <Metric title="Pending review" value={loading?'—':summary.pendingRequests} icon={Clock3} note="Issuer action needed"/>
    </div>
    <div className="tabs" role="tablist" aria-label="Manager sections">
      {[['overview','Overview',LayoutDashboard],['customers','Customer lookup',Search],['requests','Requests',FileText]].map(([id,label,Icon])=>
        <button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}
    </div>
    {(tab==='overview'||tab==='customers')&&<div className="content-grid manager-grid">
      <section className="surface-card"><div className="card-heading"><div><h2>Customer lookup</h2><p>Search by customer ID within your authorized issuers</p></div><Search size={20}/></div>
        <form className="search-row" onSubmit={search}><div className="search-input"><Search size={19}/><input aria-label="Customer ID prefix" placeholder="Enter customer ID (at least 3 characters)" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/></div>
        <button className="primary-button" disabled={searching} type="submit">{searching?'Searching…':'Search'}<ArrowRight size={16}/></button></form>
        {matches.length?<div className="customer-results">{matches.map(item=><button className={'customer-result '+(selected?.customerId===item.customerId?'selected':'')} key={item.customerId} onClick={()=>selectCustomer(item)}>
          <span className="account-icon"><UsersRound size={18}/></span><span><strong>{item.customerId}</strong><small>{item.verifiedCount} verified of {item.accountCount} accounts</small></span><ChevronRight size={18}/></button>)}</div>:
          <Empty icon={Search} title="Find an authorized customer" body="Search results appear here. Customers from other issuers will never be shown."/>}
      </section>
      <section className="surface-card form-card"><div className="card-heading"><div><h2>Request for customer</h2><p>{selected?'Customer '+selected.customerId:'Select a customer from search results'}</p></div><Plus size={20}/></div>
        {selected?<form className="request-form" onSubmit={submit}>
          <label>Verified customer account<select value={form.accountId} onChange={e=>setForm({...form,accountId:e.target.value})} required disabled={!verified.length}>
            <option value="">Select a verified account</option>{verified.map(a=><option key={a.id} value={a.id}>{a.displayName} · {a.maskedNumber} ({a.issuerOrgId})</option>)}
          </select></label>
          <div className="date-grid"><label>From<input required type="date" value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label>To<input required type="date" value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label></div>
          <button className="primary-button" disabled={!verified.length||busy}>{busy?'Submitting…':'Submit request'}<ArrowRight size={16}/></button>
          <p className="fine-print"><ShieldCheck size={14}/> Every submission is checked against your active issuer permissions.</p>
        </form>:<Empty icon={UsersRound} title="No customer selected" body="Find a customer to view their issuer-verified accounts and submit a statement request."/>}
      </section>
    </div>}
    {(tab==='overview'||tab==='requests')&&<section className="surface-card table-card"><div className="card-heading"><div><h2>Issuer request queue</h2><p>Requests within your authorized organizations</p></div><FileText size={20}/></div>
      {loading?<div className="loading">Loading queue…</div>:<RequestTable manager requests={requests}/>}
    </section>}
  </>;
}
function DashboardShell({authClient,session,onSignOut,initialRole,onSessionExpired}){
  const [role,setRole]=useState(initialRole);
  const [access,setAccess]=useState(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [mobileOpen,setMobileOpen]=useState(false);
  const api=useApi(authClient,onSessionExpired);
  const manager=access?.manager===true;
  useEffect(()=>{
    let cancelled=false;
    api('/v1/me/access').then(v=>{
      if(cancelled)return;
      setAccess(v);
      if(initialRole==='manager'&&!v.manager&&!v.pendingPasswordChange)setError('Manager access has not been assigned to this account. An authorized administrator must grant access.');
    }).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[api,initialRole]);
  function navigate(next){
    setRole(next);setMobileOpen(false);setError('');
    history.pushState(null,'',next==='manager'?'/manager':'/customer');
  }
  useEffect(()=>{
    const onPop=()=>setRole(roleFromPath());
    addEventListener('popstate',onPop);
    return()=>removeEventListener('popstate',onPop);
  },[]);
  const name=session?.user?.name||session?.user?.email||'Workspace user';
  return <div className="app-shell">
    {mobileOpen&&<button aria-label="Close navigation" className="mobile-overlay" onClick={()=>setMobileOpen(false)}/>}
    <aside className={'sidebar '+(mobileOpen?'sidebar-open':'')}>
      <div className="sidebar-top"><Brand/><button className="mobile-close icon-button" onClick={()=>setMobileOpen(false)}><X size={20}/></button></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <button className={role==='customer'?'active':''} onClick={()=>navigate('customer')}><LayoutDashboard size={19}/> Customer dashboard {role==='customer'&&<ChevronRight size={16} className="nav-chevron"/>}</button>
        {manager&&<button className={role==='manager'?'active':''} onClick={()=>navigate('manager')}><ShieldCheck size={19}/> Manager workspace {role==='manager'&&<ChevronRight size={16} className="nav-chevron"/>}</button>}
      </nav>
      <div className="sidebar-section-label sidebar-tools">ACCOUNT</div>
      <nav className="side-nav">
        <button onClick={()=>setRefreshKey(v=>v+1)}><RefreshCw size={18}/> Refresh data</button>
        <button onClick={onSignOut}><LogOut size={18}/> Sign out</button>
      </nav>
      <div className="sidebar-bottom"><div className="security-panel"><span><ShieldCheck size={20}/></span><strong>Secure workspace</strong><small>Your records are accessible only after verified sign-in and account authorization.</small></div>
        <span className="sidebar-caption">LEDGER DESK · DEVELOPMENT ONLY</span>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button>
          <div className="breadcrumb">Workspace <ChevronRight size={15}/> <strong>{role==='manager'?'Manager':'Customer'}</strong></div></div>
        <div className="topbar-right"><span className="environment-badge"><span className="live-light"/> TEST ENVIRONMENT</span>
          <div className="user-info"><span className="user-avatar">{initials(name)}</span><span className="user-name"><strong>{name}</strong><small>{manager?'Manager authorized':'Customer access'}</small></span></div></div>
      </header>
      <div className="main-content">
        <Notice message={error} onClose={()=>setError('')}/>
        {busy?<div className="page-loading"><RefreshCw className="spinning"/> Checking access permissions…</div>:
         role==='manager'&&!manager&&access?.pendingPasswordChange?
         <ManagerPasswordForm mandatory authClient={authClient} onSuccess={async()=>{
           const v=await api('/v1/me/access');setAccess(v);setError('');
         }}/>:
         role==='manager'&&!manager?<section className="surface-card access-denied"><ShieldCheck size={32}/><h1>Manager authorization required</h1><p>This account has no active manager grant. An administrator must assign issuer-scoped permissions. Registering or choosing “Manager” does not grant access.</p><button className="primary-button" onClick={()=>navigate('customer')}>Open customer workspace <ArrowRight size={17}/></button></section>:
         role==='manager'?<LegacyAdmin api={api} authClient={authClient} session={session} organizations={access?.organizations||[]} refreshKey={refreshKey}/>:
         <CustomerDashboard api={api} refreshKey={refreshKey}/>}
        <footer className="page-footer"><span>© Ledger Desk · Development workspace</span><span><LockKeyhole size={13}/> No live banking integration or official PDF issuance</span></footer>
      </div>
    </div>
  </div>;
}
function App(){
  const [client,setClient]=useState(null);
  const [session,setSession]=useState(null);
  const [booting,setBooting]=useState(true);
  const [error,setError]=useState('');
  const [initialRole,setInitialRole]=useState(roleFromPath);
  useEffect(()=>{
    let cancelled=false;
    async function init(){
      try{
        const response=await fetch('/public-config',{cache:'no-store'});
        if(!response.ok)throw new Error('Unable to load application configuration');
        const config=await response.json();
        if(!config.authUrl||!config.authUrl.startsWith('https://'))throw new Error('Authentication provider is not configured');
        const c=createAuthClient(config.authUrl,{adapter:BetterAuthReactAdapter()});
        if(cancelled)return;
        setClient(c);
        const result=await c.getSession();
        if(!cancelled)setSession(result?.data?.user?result.data:null);
      }catch(e){if(!cancelled)setError(e.message||'Unable to start workspace');}
      finally{if(!cancelled)setBooting(false);}
    }
    init();return()=>{cancelled=true;};
  },[]);
  const signOut=useCallback(async()=>{
    try{await client?.signOut();}finally{setSession(null);history.replaceState(null,'','/login');}
  },[client]);
  const signIn=async audience=>{
    const result=await client.getSession();
    if(!result?.data?.user)throw new Error('Could not establish a verified session');
    setSession(result.data);setInitialRole(audience);
    history.replaceState(null,'',audience==='manager'?'/manager':'/customer');
  };
  if(booting)return <div className="boot-screen"><Brand/><RefreshCw className="spinning" size={24}/><span>Preparing your secure workspace…</span></div>;
  if(error)return <div className="boot-screen error-boot"><Brand/><CircleAlert size={28}/><h2>Unable to open Ledger Desk</h2><p>{error}</p><button className="primary-button" onClick={()=>location.reload()}>Try again <RefreshCw size={16}/></button></div>;
  if(!client)return null;
  return session?<DashboardShell key={session.user.id} authClient={client} session={session} initialRole={initialRole} onSignOut={signOut} onSessionExpired={signOut}/>:
    <AuthScreen authClient={client} onAuthenticated={signIn}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
