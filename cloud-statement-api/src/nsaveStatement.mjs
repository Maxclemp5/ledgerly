const isDate=(v)=>typeof v==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)&&
 Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(Date.parse(v+'T00:00:00Z')).toISOString().slice(0,10)===v;
const cents=(v,label,{negative=false}={})=>{
 if(!Number.isSafeInteger(v)||(!negative&&v<0))throw new Error('Invalid verified statement field: '+label);
 return v;
};
const money=(minor,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency,
 minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100);
const text=(v,label,max=240)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Missing or invalid statement field: '+label);return v.trim()};
function transactionRow(row,index,currency){
 if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Invalid transaction at row '+(index+1));
 const date=row.posted_at||row.postedAt||row.date||row.transaction_date||row.transactionDate||row.created_at;
 const description=row.description||row.narrative||row.memo||row.reference||row.type;
 let amount;
 if(Number.isSafeInteger(row.amount_cents))amount=row.amount_cents;
 else if(Number.isSafeInteger(row.amountCents))amount=row.amountCents;
 else if(Number.isSafeInteger(row.amount_minor))amount=row.amount_minor;
 else if(Number.isSafeInteger(row.amountMinor))amount=row.amountMinor;
 else if(Number.isSafeInteger(row.amount))amount=Math.round(row.amount*100);
 else if(Number.isSafeInteger(row.credit_cents)&&row.credit_cents>0)amount=row.credit_cents;
 else if(Number.isSafeInteger(row.debit_cents)&&row.debit_cents>0)amount=-row.debit_cents;
 else throw new Error('Unsupported nSave transaction amount field at row '+(index+1));
 const balance=Number.isSafeInteger(row.balance_cents)?row.balance_cents:
  Number.isSafeInteger(row.balanceCents)?row.balanceCents:
  Number.isSafeInteger(row.balance_minor)?row.balance_minor:
  Number.isSafeInteger(row.balanceMinor)?row.balanceMinor:null;
 if(!isDate(String(date||'').slice(0,10)))throw new Error('Unsupported transaction date at row '+(index+1));
 if(typeof description!=='string'||!description.trim())throw new Error('Missing transaction description at row '+(index+1));
 return {date:String(date).slice(0,10),description:description.trim().slice(0,140),amount,balance};
}
export function normalizeNsaveStatement(payload,{accountReference,customerReference,from,to}={}){
 const root=payload?.data&&!Array.isArray(payload.data)?payload.data:payload;
 if(!root||typeof root!=='object'||!Array.isArray(root.data))
  throw new Error('nSave statement response is missing its data array');
 if(root.start!==from||root.end!==to||!isDate(root.start)||!isDate(root.end)||root.start>root.end)
  throw new Error('nSave statement period does not match the requested period');
 const matches=root.data.filter(x=>x&&x.account_reference===accountReference);
 if(matches.length!==1)throw new Error('nSave did not return exactly one matching account record');
 const row=matches[0];
 if(customerReference&&row.nsave_reference!==customerReference)
  throw new Error('nSave customer reference does not match the selected customer');
 const currency=text(row.currency,'currency',3);
 if(!/^[A-Z]{3}$/.test(currency))throw new Error('Invalid statement currency');
 const opening=cents(row.opening_cents,'opening_cents',{negative:true});
 const deposits=cents(row.total_deposits_cents,'total_deposits_cents');
 const payments=cents(row.total_payments_cents,'total_payments_cents');
 const closing=cents(row.closing_cents,'closing_cents',{negative:true});
 if(opening+deposits-payments!==closing)
  throw new Error('nSave statement balances do not reconcile: opening + deposits - payments must equal closing');
 if(!Array.isArray(row.transactions))throw new Error('nSave transactions must be an array');
 const transactions=row.transactions.map((x,i)=>transactionRow(x,i,currency));
 if(transactions.length===0&&deposits!==0&&payments!==0)
  throw new Error('nSave returned no transactions but non-zero period totals');
 if(transactions.length>0){
  const credits=transactions.reduce((sum,x)=>sum+Math.max(0,x.amount),0);
  const debits=transactions.reduce((sum,x)=>sum+Math.max(0,-x.amount),0);
  if(credits!==deposits||debits!==payments)
   throw new Error('Itemized transactions do not reconcile to nSave period totals');
 }
 return Object.freeze({
  requestReference:text(root.request_reference,'request_reference',160),
  organizationReference:typeof root.organization_reference==='string'?root.organization_reference:'',
  customerReference:text(row.nsave_reference,'nsave_reference',160),
  accountReference:text(row.account_reference,'account_reference',160),
  accountId:text(row.account_id,'account_id',160),
  customerName:text(row.customer_name,'customer_name',160),
  address:text(row.address,'address',500),
  bankName:text(row.bank_name,'bank_name',120),
  bankAddress:text(row.bank_address,'bank_address',300),
  accountNumber:text(row.account_number,'account_number',64),
  routingNumber:typeof row.routing_number==='string'?row.routing_number:'',
  currency,from:root.start,to:root.end,opening,deposits,payments,closing,transactions
 });
}
