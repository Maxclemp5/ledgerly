import {createHash} from 'node:crypto';

/**
 * Generic interface supplied by an issuer-authorized core-banking partner.
 *
 * connector.account(accountId, issuerOrgId)
 * connector.postedEntries(accountId, from, to)
 * connector.boundaryBalances(accountId, from, to)
 *
 * Use OAuth2/mTLS with issuer-owned credentials stored in Google Secret Manager.
 * Never substitute browser-entered balances or imported PDF figures.
 */
export async function reconcileIssuerLedger(connector,{issuerOrgId,accountId,from,to}) {
  if(!connector||typeof connector.account!=='function'||
    typeof connector.postedEntries!=='function'||
    typeof connector.boundaryBalances!=='function') {
    throw new Error('Authorized issuer ledger connector is not configured');
  }
  const [account,entries,balance]=await Promise.all([
    connector.account(accountId,issuerOrgId),
    connector.postedEntries(accountId,from,to),
    connector.boundaryBalances(accountId,from,to)
  ]);
  if(account?.accountId!==accountId||account?.issuerOrgId!==issuerOrgId||
     account?.status!=='ACTIVE'||!account?.sourceAccountId) {
    throw new Error('Issuer account ownership/source cannot be verified');
  }
  if(!Array.isArray(entries)||entries.length>10000) {
    throw new Error('Posted ledger entries unavailable or limit exceeded');
  }
  if(!/^[A-Z]{3}$/.test(account.currency||'')||
     account.currency!==balance?.currency||
     !balance.openingCheckpointId||!balance.closingCheckpointId) {
    throw new Error('Authoritative ledger balance checkpoints unavailable');
  }
  const asMinor=(value)=>{
    if(!Number.isSafeInteger(value)||value<0)
      throw new Error('Ledger amount must be nonnegative integer minor units');
    return BigInt(value);
  };
  const opening=asMinor(balance.openingMinor),closing=asMinor(balance.closingMinor);
  let movement=0n;
  const seen=new Set();
  for(const entry of entries) {
    if(!entry||typeof entry.id!=='string'||!entry.id||
      seen.has(entry.id)||entry.currency!==account.currency)
      throw new Error('Invalid or duplicate ledger transaction');
    seen.add(entry.id);
    if(typeof entry.postedAt!=='string'||
      !/^\d{4}-\d{2}-\d{2}T/.test(entry.postedAt)) {
      throw new Error('Missing authoritative posted timestamp');
    }
    const postingDay=entry.postedAt.slice(0,10);
    if(postingDay<from||postingDay>to)
      throw new Error('Posted ledger entry outside requested period');
    const debit=asMinor(entry.debitMinor),credit=asMinor(entry.creditMinor);
    if(debit>0n&&credit>0n)
      throw new Error('Entry contains both debit and credit');
    movement+=credit-debit;
  }
  if(opening+movement!==closing) {
    throw new Error('Opening, posted movements and closing do not reconcile');
  }
  const digest=createHash('sha256').update(JSON.stringify({
    accountId,issuerOrgId,from,to,opening:opening.toString(),closing:closing.toString(),
    ids:entries.map(x=>x.id),start:balance.openingCheckpointId,end:balance.closingCheckpointId
  })).digest('hex');
  return Object.freeze({
    source:'AUTHENTICATED_ISSUER_LEDGER',
    accountId,issuerOrgId,currency:account.currency,
    from,to,openingMinor:opening.toString(),closingMinor:closing.toString(),
    postedEntryCount:entries.length,
    checkpointIds:[balance.openingCheckpointId,balance.closingCheckpointId],
    sourceDigest:digest
  });
}
