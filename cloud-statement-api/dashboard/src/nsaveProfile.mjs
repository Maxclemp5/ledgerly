// Pure helpers to normalize documented and nested nSave customer response shapes.
// Do not invent missing addresses or linked bank accounts.
export function nsaveObject(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}
const firstObject=(...items)=>items.find(x=>x&&typeof x==='object'&&!Array.isArray(x))||{};
export function nsaveCustomer(raw){
 const outer=nsaveObject(raw), data=nsaveObject(outer.data);
 const detail=firstObject(data.customer,data.profile,outer.customer,outer.profile,
   data.data?.customer,data.data?.profile,data.data,outer.data,outer);
 const nested=firstObject(detail.customer,detail.profile,detail.personal_details,detail.personalDetails);
 // Search/list summaries may contain the customer reference while the detail fields are nested.
 const profile={...outer,...data,...detail,...nested};
 const addresses=[nested.address,detail.address,data.address,outer.address,
  nested.residential_address,detail.residential_address,detail.contact?.address,
  detail.personal_details?.address,detail.profile?.address];
 profile.address=addresses.find(x=>x&&(typeof x==='string'||typeof x==='object'))||null;
 const sources=[nested,detail,data,outer,nested.banking,detail.banking,data.banking,outer.banking,
  detail.customer,data.customer,outer.customer].map(nsaveObject);
 let found=false;
 for(const src of sources){
  for(const key of ['accounts','bank_accounts','bankAccounts','linked_accounts','linkedAccounts']){
   const val=src[key];
   const list=Array.isArray(val)?val:Array.isArray(val?.data)?val.data:
    Array.isArray(val?.items)?val.items:Array.isArray(val?.accounts)?val.accounts:null;
   if(list){profile.accounts=list;found=true;break}
  }
  if(found)break;
 }
 if(!found)profile.accounts=[];
 return profile;
}
export function nsaveAddressText(raw){
 if(typeof raw==='string')return raw;
 const a=nsaveObject(raw);
 return [a.line1||a.address_line1||a.street||a.street_address,
  a.line2||a.address_line2,a.city,a.region||a.state||a.province,
  a.postal_code||a.postalCode||a.zip,a.country].filter(Boolean).join(', ');
}
export function nsaveUnpack(raw){
 const obj=nsaveObject(raw?.data)||nsaveObject(raw);
 const inner=Array.isArray(raw?.data)?raw.data:Array.isArray(obj?.data)?obj.data:
  Array.isArray(obj?.customers)?obj.customers:Array.isArray(obj?.results)?obj.results:
  Array.isArray(obj?.matches)?obj.matches:Array.isArray(obj?.items)?obj.items:
  obj?.customer?[obj.customer]: obj?.id||obj?.customer_id?[obj]:[];
 return {items:Array.isArray(inner)?inner:[],next:obj.next_offset??null};
}
