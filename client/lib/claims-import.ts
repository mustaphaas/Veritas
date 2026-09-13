import type { ImportClaimRow } from './claims-api';

export type ParsedClaim = ImportClaimRow & { rowNumber: number; issues: string[]; valid: boolean };

const aliases: Record<string, keyof ImportClaimRow> = {
  claimid:'claimId', externalid:'claimId', serialno:'claimId', serialnumber:'claimId', projectid:'projectId', programme:'programme', program:'programme',
  state:'state', lga:'lga', community:'community', latitude:'latitude', longitude:'longitude', contractor:'contractor', developer:'contractor',
  claimamount:'claimAmount', amount:'claimAmount', claimdate:'claimDate', submitteddate:'submittedDate', sourcereference:'sourceReference',
};
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g,'');
function csvLine(line: string) { const out:string[]=[]; let cell='', quoted=false; for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'&&line[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(cell.trim());cell='';}else cell+=c;} out.push(cell.trim()); return out; }
function rowsFromText(text: string) {
  if (/<table[\s>]/i.test(text)) {
    const doc = new DOMParser().parseFromString(text,'text/html');
    return [...doc.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => (cell.textContent || '').trim()));
  }
  return text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(csvLine);
}
function asNumber(v: unknown) { const n=Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? n : NaN; }

export async function parseClaimsFile(file: File): Promise<ParsedClaim[]> {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (!['csv','xls'].includes(ext)) throw new Error('Use CSV or Excel .xls format for this import.');
  const rows = rowsFromText(await file.text()).filter(row => row.some(Boolean));
  if (rows.length < 2) throw new Error('The upload does not contain claim rows.');
  const headers = rows[0].map(header => aliases[norm(header)] || null);
  return rows.slice(1).map((cells,index) => {
    const raw: Record<string, string> = {};
    headers.forEach((key,i) => { if(key) raw[key] = cells[i] || ''; });
    const claimAmount = asNumber(raw.claimAmount);
    const latitude = raw.latitude ? asNumber(raw.latitude) : undefined;
    const longitude = raw.longitude ? asNumber(raw.longitude) : undefined;
    const claim: ImportClaimRow = {
      claimId: String(raw.claimId || '').trim(), projectId: String(raw.projectId || '').trim(), programme: String(raw.programme || 'DARES').trim() || 'DARES',
      state: String(raw.state || '').trim(), lga: String(raw.lga || '').trim(), community: String(raw.community || '').trim(),
      latitude: latitude as number | undefined, longitude: longitude as number | undefined, contractor: String(raw.contractor || '').trim(),
      claimAmount, claimDate: String(raw.claimDate || '').trim(), submittedDate: String(raw.submittedDate || '').trim(), sourceReference: String(raw.sourceReference || raw.claimId || '').trim(),
    };
    const issues:string[]=[];
    if(!claim.claimId) issues.push('Claim ID is required');
    if(!claim.state) issues.push('State is required');
    if(!claim.lga) issues.push('LGA is required');
    if(!claim.contractor) issues.push('Contractor is required');
    if(!Number.isFinite(claimAmount) || claimAmount < 0) issues.push('Claim amount is invalid');
    if(latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) issues.push('Latitude is invalid');
    if(longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) issues.push('Longitude is invalid');
    return { ...claim, rowNumber:index+2, issues, valid:issues.length===0 };
  });
}
