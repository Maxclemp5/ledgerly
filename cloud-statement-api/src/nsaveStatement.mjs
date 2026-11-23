import PDFDocument from 'pdfkit';

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
export async function renderNsaveStatement(statement){
 const doc=new PDFDocument({size:'LETTER',margin:0,compress:true,info:{
  Title:'Account Statement '+statement.currency,
  Author:'nsave Ltd.',
  Subject:'Account statement '+statement.from+' to '+statement.to,
  Creator:'LedgerDesk authorized statement service'
 }});
 const chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const ink='#111111',muted='#77736f',rule='#dedbd8',left=36,right=576;
 const moneyText=v=>money(v,statement.currency);
 const dateText=v=>{const [y,m,d]=v.split('-');return d+'/'+m+'/'+y};
 doc.font('Helvetica-Bold').fontSize(19).fillColor(ink).text('Account Statement '+statement.currency,left,58,{lineBreak:false});
 doc.font('Helvetica').fontSize(10).fillColor(muted).text(dateText(statement.from)+' - '+dateText(statement.to),left,82);
 doc.font('Helvetica-Bold').fontSize(21).fillColor(ink).text('nsave',475,58,{width:100,align:'right'});
 const line=(y)=>doc.moveTo(left,y).lineTo(right,y).lineWidth(.55).strokeColor(rule).stroke();
 const label=(t,x,y)=>doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text(t,x,y,{lineBreak:false});
 const val=(t,x,y,w=245)=>doc.font('Helvetica').fontSize(9).fillColor(muted).text(String(t),x,y,{width:w,lineBreak:false});
 label('Name',left,122);val(statement.customerName,178,122);
 label('Address',left,141);val(statement.address,178,141,250);
 label('Bank',left,198);val(statement.bankName,178,198);
 label('Bank Address',left,218);val(statement.bankAddress,178,218,360);
 label('Account Number',left,238);val(statement.accountNumber,178,238);
 if(statement.routingNumber){label('Routing Number',left,258);val(statement.routingNumber,178,258);}
 const sumX=390,sumV=532;
 const sumY=statement.routingNumber?238:258;
 const summary=[
  ['Opening Balance',moneyText(statement.opening)],
  ['Closing Balance',moneyText(statement.closing)],
  ['Total Payments',moneyText(statement.payments)],
  ['Total Deposits',moneyText(statement.deposits)]
 ];
 summary.forEach(([k,v],i)=>{label(k,sumX,sumY+i*20);val(v,sumV,sumY+i*20,45);});
 const tableY=Math.max(statement.routingNumber?296:276,sumY+92);
 const col={date:left,desc:118,amount:410,balance:520};
 doc.font('Helvetica').fontSize(9).fillColor(muted);
 doc.text('Date',col.date,tableY,{lineBreak:false});
 doc.text('Description',col.desc,tableY,{lineBreak:false});
 doc.text('Amount',col.amount,tableY,{width:70,align:'right',lineBreak:false});
 doc.text('Balance',col.balance,tableY,{width:56,align:'right',lineBreak:false});
 line(tableY+17);
 let y=tableY+25;
 if(statement.transactions.length===0){
  doc.font('Helvetica').fontSize(9).fillColor(muted).text('No transactions in this period.',left,y,{lineBreak:false});
  y+=18;line(y);
 }else{
  for(const tx of statement.transactions){
   const h=Math.max(18,doc.heightOfString(tx.description,{width:260,fontSize:8})+5);
   if(y+h>710){doc.addPage();y=55;}
   doc.font('Helvetica').fontSize(8).fillColor(muted);
   doc.text(dateText(tx.date),col.date,y,{width:75});
   doc.text(tx.description,col.desc,y,{width:260});
   doc.text(moneyText(tx.amount),col.amount,y,{width:70,align:'right'});
   doc.text(tx.balance===null?'—':moneyText(tx.balance),col.balance,y,{width:56,align:'right'});
   y+=h;line(y-3);
  }
 }
 // Nsave's supplied corporate disclosure footer from the existing template.
 const footer='© nsave Ltd. 2026 registered in England and Wales under number 14337994. npay USA Inc. is a company incorporated in Montana, USA and registered as a Money Services Business (MSB) with FinCEN under registration number: 31000342363468. GBP and Multi-Currency accounts are offered by Keel Money Ltd. authorised by the Financial Conduct Authority under the Electronic Money Regulations 2011 (FRN: 1020783) for the issuing of electronic money and payment instruments.';
 const footerY=Math.max(y+62,620);
 doc.font('Helvetica').fontSize(8).fillColor(muted).text(footer,left,footerY,{width:right-left,align:'left',lineGap:1});
 doc.end();
 return done;
}
