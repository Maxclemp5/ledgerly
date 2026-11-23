import {nsaveCustomer,nsaveAddressText,nsaveUnpack} from './nsaveProfile.mjs';
import React,{useState} from 'react';
import {Search,RefreshCw,ChevronRight,ArrowLeft,FileText,ShieldCheck,Eye,EyeOff} from 'lucide-react';

// Search and profile retrieval are performed on the server with organization credentials.
// Never store the returned banking profile in browser storage or logs.
const customerId=x=>String(x?.id||x?.customer_id||x?.customerId||x?.nsave_reference||'');
const customerName=x=>String(x?.full_name||x?.fullName||x?.name||
 [x?.first_name,x?.last_name].filter(Boolean).join(' ')||'Name not supplied');
const mask=n=>{const s=String(n||'');return s.length<=4?'••••':'•••• '+s.slice(-4)};
const value=x=>x===undefined||x===null||x===''?'—':String(x);
const accountsOf=p=>Array.isArray(p?.accounts)?p.accounts:[];
function Field({label,children}){return <div className="nsave-field"><small>{label}</small><strong>{children}</strong></div>}
function Profile({profile,onBack,api}){
 const [selected,setSelected]=useState('');
 const [revealAccounts,setRevealAccounts]=useState(false);
 const [from,setFrom]=useState(''),[to,setTo]=useState('');
 const [error,setError]=useState(''),[result,setResult]=useState(null),[checking,setChecking]=useState(false),[generating,setGenerating]=useState(false);
 const accounts=accountsOf(profile);
 const id=customerId(profile);
 const address=profile.address;
 const reference=profile.nsave_reference||profile.nsaveReference||id;
 async function generatePdf(){
  setError('');setGenerating(true);
  try{
   const pdf=await api('/v1/manager/nsave/statements/generate',{method:'POST',responseType:'blob',body:{
    customerId:id,accountReference:selected,from,to
   }});
   const url=URL.createObjectURL(pdf);
   const a=document.createElement('a');a.href=url;a.download='nsave-statement-'+from+'-to-'+to+'.pdf';
   document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }catch(err){setError(err.message||'Statement PDF could not be generated.')}finally{setGenerating(false)}
 }
 async function prepare(e){
  e.preventDefault();setError('');setResult(null);
  if(!selected){setError('Select one of this customer’s accounts.');return}
  if(!from||!to||from>to){setError('Select a valid statement date range.');return}
  setChecking(true);
  try{
   const pulled=await api('/v1/manager/nsave/statement-readiness',{method:'POST',body:{
    customerId:id,accountId:selected,from,to
   }});
   const raw=pulled?.statement||{};
   const records=Array.isArray(raw?.data)?raw.data:[];
   const record=records.find(x=>(x?.account_reference||'')===selected)||null;
   if(!record)throw new Error('nSave returned no matching account record for this statement period.');
   const summary={
    opening_cents:record.opening_cents,
    closing_cents:record.closing_cents,
    total_deposits_cents:record.total_deposits_cents,
    total_payments_cents:record.total_payments_cents,
    currency:record.currency
   };
   const transactions=Array.isArray(record.transactions)?record.transactions:[];
   setResult({summary,record,transactions,fields:Object.keys(raw||{}),schema:pulled?.statementSchema||null,from,to,note:pulled?.note||'nSave statement data retrieved.'});
  }catch(err){setError(err.message||'Unable to retrieve nSave date-scoped summary.')}finally{setChecking(false)}
 }
 return <div className="old-card">
  <button type="button" className="old-secondary" onClick={onBack}><ArrowLeft size={15}/> Back to customers</button>
  <div className="old-bar" style={{marginTop:18}}>
   <div><h2>{customerName(profile)}</h2><p>Live nSave customer profile · Reference {value(reference)}</p></div>
   <span className="old-chip">{value(profile.kyc_status||profile.kycStatus||profile.status)}</span>
  </div>
  <div className="nsave-fields">
   <Field label="Customer ID">{value(id)}</Field>
   <Field label="Email">{value(profile.email)}</Field>
   <Field label="Phone">{value(profile.phone||profile.phone_number)}</Field>
   <Field label="Created">{value(profile.created_at||profile.createdAt)}</Field>
   <Field label="KYC">{value(profile.kyc_status||profile.kycStatus)}</Field>
   <Field label="Address">{value(nsaveAddressText(address))}</Field>
   <Field label="Bank address">{value(nsaveAddressText(profile.bank_address||accounts[0]?.bank_address))}</Field>
  </div>
  <div className="old-bar"><h3>Linked nSave bank accounts</h3>
   <button type="button" className="old-secondary" aria-pressed={revealAccounts}
    onClick={()=>setRevealAccounts(v=>!v)} disabled={!accounts.some(a=>a.account_number||a.accountNumber||a.iban)}>
    {revealAccounts?<EyeOff size={15}/>:<Eye size={15}/>}
    {revealAccounts?'Hide account numbers':'Show full account numbers'}
   </button></div>
  {!accounts.length?<p>Linked bank-account details are not included in the nSave profile response. The customer record loaded, but no account list was supplied by this endpoint. Statement generation requires the nSave account reference.</p>:
   <div className="old-overflow"><table><thead><tr><th>Select</th><th>Account</th><th>Bank</th><th>Currency</th><th>Status</th></tr></thead>
    <tbody>{accounts.map((a,i)=>{
     const aid=String(a.account_reference||a.accountReference||a.nsave_account_reference||a.id||a.account_id||a.accountId||'');
     return <tr key={aid||i}>
      <td><input type="radio" name="nsave-account" aria-label={'Select account '+mask(a.account_number||a.accountNumber||a.iban||aid)}
       checked={selected===aid&&!!aid} disabled={!aid} onChange={()=>{setSelected(aid);setError('');setResult('')}}/></td>
      <td>{revealAccounts&& (a.account_number||a.accountNumber||a.iban)
       ? value(a.account_number||a.accountNumber||a.iban)
       : mask(a.account_number||a.accountNumber||a.masked_number||a.iban||aid)}<small>{value(a.account_reference||a.accountReference||a.id||a.account_id)}</small></td>
      <td>{value(a.bank_name||a.bankName||a.bank?.name)}</td><td>{value(a.currency||a.currency_code)}</td><td>{value(a.status)}</td>
     </tr>;
    })}</tbody></table></div>}
  <p>Only reveal full account numbers when necessary for authorized branch verification. They are hidden again when you leave this profile.</p>
  <div className="nsave-statement">
   <h3><FileText size={17}/> Statement generation</h3>
   <p>Select an account and reporting period. Brand-new accounts are eligible for statements even when they have no transactions. A zero-activity statement must still use verified balances.</p>
   <form className="old-form" onSubmit={prepare}>
    <div className="nsave-dates">
     <label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label>
     <label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} required/></label>
    </div>
    <button type="submit" className="old-primary" disabled={!selected||checking}>{checking?'Loading period data…':'Fetch statement data'} <ChevronRight size={15}/></button>
   </form>
   {error&&<div className="old-alert error" role="alert">{error}</div>}
   {result&&<div className="old-card" role="status">
    <h3>nSave period summary · {result.from} to {result.to}</h3>
    <p>{result.note}</p>
    {Object.keys(result.summary).length>0?
      <div className="nsave-fields">
       {[
        ['Opening balance',result.summary.opening_cents===undefined?undefined:(result.summary.opening_cents/100).toLocaleString('en-US',{style:'currency',currency:result.summary.currency||'USD'})],
        ['Closing balance',result.summary.closing_cents===undefined?undefined:(result.summary.closing_cents/100).toLocaleString('en-US',{style:'currency',currency:result.summary.currency||'USD'})],
        ['Total deposits',result.summary.total_deposits_cents===undefined?undefined:(result.summary.total_deposits_cents/100).toLocaleString('en-US',{style:'currency',currency:result.summary.currency||'USD'})],
        ['Total payments',result.summary.total_payments_cents===undefined?undefined:(result.summary.total_payments_cents/100).toLocaleString('en-US',{style:'currency',currency:result.summary.currency||'USD'})],
        ['Currency',result.summary.currency]
       ].filter(([,v])=>v!==undefined&&v!==null).map(([label,v])=>
        <Field key={label} label={label}>{value(v)}</Field>)}
      </div>:
      <p>The statement endpoint responded, but its account-summary fields are not mapped yet. The privacy-safe response structure is shown below; it contains field names and data types only, not customer values.</p>}
    <p>{result.transactions.length===0?'No transactions in this period.':'nSave returned '+result.transactions.length+' transaction records for this period.'}</p>
    {result.record&&<p>Account reference verified: {value(result.record.account_reference)}</p>}
    <button type="button" className="old-primary" disabled={generating||checking} onClick={generatePdf}>{generating?'Generating PDF…':'Generate and download statement PDF'} <FileText size={15}/></button>
    {result.schema&&<details className="nsave-schema"><summary>View sanitized response structure</summary><pre>{JSON.stringify(result.schema,null,2)}</pre></details>}
   </div>}
   <p><ShieldCheck size={13}/> No transactions during a period is valid. Statement PDF delivery requires issuer-verified opening and closing balances and an authorized statement source.</p>
  </div>
 </div>;
}
export default function NsaveDirectory({api}){
 const [items,setItems]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(false);
 const [mode,setMode]=useState('name'),[term,setTerm]=useState(''),[error,setError]=useState('');
 const [selected,setSelected]=useState(null),[busyProfile,setBusyProfile]=useState(false);
 const [searched,setSearched]=useState(false);
 async function list(offset=0){
  setLoading(true);setError('');if(offset===0){setItems([]);setSelected(null)}
  try{
   const data=await api('/v1/manager/nsave/customers?limit=50&offset='+encodeURIComponent(String(offset)));
   const parsed=nsaveUnpack(data);
   setItems(old=>offset===0?parsed.items:[...old,...parsed.items]);
   setNext(parsed.next);setSearched(true);
  }catch(e){setError(e.message||'Unable to load nSave customers')}finally{setLoading(false)}
 }
 async function search(e){
  e.preventDefault();setError('');setSelected(null);setItems([]);setNext(null);setSearched(false);
  const q=term.trim();
  if(!q||q.length>160){setError('Enter a valid exact account number or full customer name.');return}
  if(mode==='account_number'&&!/^[0-9]+$/.test(q)){setError('The exact account number must contain digits only, including leading zeros.');return}
  setLoading(true);
  try{
   const data=await api('/v1/manager/nsave/customers/search',{method:'POST',body:{[mode]:q}});
   const parsed=nsaveUnpack(data);setItems(parsed.items);setSearched(true);
  }catch(err){setError(err.message||'Customer search failed')}finally{setLoading(false)}
 }
 async function select(item){
  const id=customerId(item);setError('');
  if(!id){setError('This nSave search result has no usable customer reference.');return}
  setBusyProfile(true);
  try{
   const data=await api('/v1/manager/nsave/customers/'+encodeURIComponent(id));
   const profile=nsaveCustomer(data,item);
   if(!customerId(profile))throw new Error('nSave returned an incomplete customer profile.');
   setSelected(profile);
  }catch(e){setError(e.message||'Customer profile could not be loaded')}finally{setBusyProfile(false)}
 }
 if(selected)return <Profile key={customerId(selected)} profile={selected} api={api} onBack={()=>setSelected(null)}/>;
 return <div className="old-card">
  <div className="old-bar">
   <div><h2>nSave customer directory</h2><p>Browse authorized nSave customer records or search by exact account number or full name.</p></div>
   <button type="button" className="old-secondary" disabled={loading} onClick={()=>list(0)}><RefreshCw size={15}/> Browse customers</button>
  </div>
  <form className="old-search" onSubmit={search}>
   <Search size={17}/>
   <select aria-label="Search method" value={mode} onChange={e=>{setMode(e.target.value);setTerm('')}}>
    <option value="name">Full name</option><option value="account_number">Account number</option>
   </select>
   <input aria-label="Search nSave customers" autoComplete="off" value={term} maxLength={160}
    onChange={e=>setTerm(e.target.value)} placeholder={mode==='name'?'Full customer name':'Exact account number'}/>
   <button type="submit" className="old-primary" disabled={loading}>Search</button>
  </form>
  {error&&<div className="old-alert error" role="alert">{error}</div>}
  {loading&&<p className="old-loading">Retrieving nSave customer profiles…</p>}
  {busyProfile&&<p className="old-loading">Loading full customer profile…</p>}
  {searched&&!loading&&(!items.length?<p>No customer records returned.</p>:
   <div className="old-overflow"><table><thead><tr><th>Customer</th><th>Reference</th><th>KYC</th><th>Action</th></tr></thead>
    <tbody>{items.map((item,i)=><tr key={customerId(item)||i}>
     <td><b>{customerName(item)}</b></td><td className="old-id">{value(customerId(item))}</td>
     <td>{value(item.kyc_status||item.kycStatus)}</td>
     <td><button className="old-secondary" type="button" disabled={busyProfile} onClick={()=>select(item)}>
       View profile <ChevronRight size={14}/></button></td>
    </tr>)}</tbody></table></div>)}
  {next!==null&&next!==undefined&&<button type="button" className="old-secondary" disabled={loading} onClick={()=>list(next)}>Load more customers</button>}
  <p>Profiles are retrieved live. Full account numbers are masked in this dashboard.</p>
 </div>;
}
