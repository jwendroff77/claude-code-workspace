import dns from 'dns';
import { promisify } from 'util';
import pool from '../db/connection.js';

const resolveTxt = promisify(dns.resolveTxt);

// Check SPF, DKIM, DMARC for a domain
export async function checkDomainHealth(domain) {
  const results = { spf_valid: 0, dkim_valid: 0, dmarc_valid: 0, details: {} };

  // SPF check
  try {
    const records = await resolveTxt(domain);
    const spfRecord = records.flat().find(r => r.startsWith('v=spf1'));
    results.spf_valid = spfRecord ? 1 : 0;
    results.details.spf = spfRecord || 'No SPF record found';
  } catch (err) {
    results.details.spf = `DNS error: ${err.code || err.message}`;
  }

  // DKIM check (common selectors)
  const selectors = ['default', 'selector1', 'selector2', 'google', 'k1'];
  for (const sel of selectors) {
    try {
      const records = await resolveTxt(`${sel}._domainkey.${domain}`);
      const dkimRecord = records.flat().find(r => r.includes('v=DKIM1'));
      if (dkimRecord) {
        results.dkim_valid = 1;
        results.details.dkim = `Found via ${sel}._domainkey.${domain}`;
        break;
      }
    } catch (err) {
      // Try next selector
    }
  }
  if (!results.dkim_valid) {
    results.details.dkim = 'No DKIM record found (checked: ' + selectors.join(', ') + ')';
  }

  // DMARC check
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records.flat().find(r => r.startsWith('v=DMARC1'));
    results.dmarc_valid = dmarcRecord ? 1 : 0;
    results.details.dmarc = dmarcRecord || 'No DMARC record found';
  } catch (err) {
    results.details.dmarc = `DNS error: ${err.code || err.message}`;
  }

  // Store results
  await pool.execute(
    `INSERT INTO domain_health (domain, spf_valid, dkim_valid, dmarc_valid, last_checked, details)
     VALUES (?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE spf_valid = VALUES(spf_valid), dkim_valid = VALUES(dkim_valid),
       dmarc_valid = VALUES(dmarc_valid), last_checked = NOW(), details = VALUES(details)`,
    [domain, results.spf_valid, results.dkim_valid, results.dmarc_valid, JSON.stringify(results.details)]
  );

  const allValid = results.spf_valid && results.dkim_valid && results.dmarc_valid;
  if (!allValid) {
    console.log(`[DomainHealth] WARNING: ${domain} - SPF:${results.spf_valid} DKIM:${results.dkim_valid} DMARC:${results.dmarc_valid}`);
  } else {
    console.log(`[DomainHealth] ${domain} - All checks passed`);
  }

  return results;
}
