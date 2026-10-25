// Signing for links people click from email (unsubscribe, replacement Approve/Skip).
//
// These used to be signed with JWT_SECRET, which also signs admin logins, and JWT_SECRET was the
// default word written in this code.  Now links have their own LINK_SECRET.  LINK_SECRET_OLD (comma
// list) is still accepted when checking a link, so every link already emailed keeps working after a
// rotation.  Drop the old value after about 60 days.
//
// With no LINK_SECRET set, behavior is exactly as before (JWT_SECRET, then the old default).
import crypto from 'crypto';

const LEGACY_DEFAULT = 'onecloud2026';

export function linkSecrets() {
  const current = process.env.LINK_SECRET || process.env.JWT_SECRET || LEGACY_DEFAULT;
  const old = String(process.env.LINK_SECRET_OLD || '').split(',').map(s => s.trim()).filter(Boolean);
  return [current, ...old.filter(s => s !== current)];
}

export function hmacHex(secret, data, len) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, len);
}

export function signLink(data, len) {
  return hmacHex(linkSecrets()[0], data, len);
}

export function verifyLink(data, sig, len) {
  if (typeof sig !== 'string' || sig.length !== len) return false;
  return linkSecrets().some(s => {
    const expected = hmacHex(s, data, len);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}
