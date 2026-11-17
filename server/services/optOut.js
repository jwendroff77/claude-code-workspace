// One-line opt-out under the signature on partner cadence emails (Jonathan 17 Nov 2026:
// "Not a fit?" wording with a one-click link).  Uses the same signed link as the drip footer;
// the link opens a confirm page, so mail scanners that open links can't unsubscribe anyone.
import { generateUnsubToken } from '../routes/unsubscribe.js';

// Same public host replacement.js falls back to when UNSUB_URL isn't set.  Never a localhost link.
const LIVE = 'https://claude-code-workspace-production.up.railway.app/api/unsubscribe';
const fromEnv = (process.env.UNSUB_URL || '').replace(/\/+$/, '');
const UNSUB_BASE_URL = fromEnv.includes('/api/unsubscribe') && !/localhost|127\.0\.0\.1/.test(fromEnv) ? fromEnv : LIVE;

export function optOutLine(prospectId, email) {
  if (!prospectId || !email) return '';
  const url = `${UNSUB_BASE_URL}/${generateUnsubToken(prospectId, email)}`;
  return `<br><br><span style="font-size:11px;color:#888888;">Not a fit?&nbsp; ` +
    `<a href="${url}" style="color:#888888;text-decoration:underline;">Unsubscribe here</a> ` +
    `and we won't reach out again.</span>`;
}

export function withOptOut(html, prospectId, email) {
  return (html || '') + optOutLine(prospectId, email);
}
