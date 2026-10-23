// Microsoft Teams endpoint for Daniel (Bot Framework messaging endpoint).
//
// Every request must carry a token signed by the Bot Framework for our bot id, or it is refused.
// Only Jonathan (TEAMS_BOSS_AAD_ID), inside our Microsoft tenant, in a 1:1 chat, gets answers.
//
// Railway variables: TEAMS_BOT_APP_ID, TEAMS_BOT_APP_SECRET, TEAMS_BOSS_AAD_ID,
// optional TEAMS_BOT_TENANT_ID (defaults to MS_TENANT_ID).
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = express.Router();
const APP_ID = () => process.env.TEAMS_BOT_APP_ID;

// ---------- incoming: prove the request came from Microsoft for our bot ----------

const OPENID = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
let keyCache = { keys: [], at: 0 };
async function signingKeys() {
  if (Date.now() - keyCache.at < 12 * 3600 * 1000 && keyCache.keys.length) return keyCache.keys;
  const cfg = await (await fetch(OPENID)).json();
  const jwks = await (await fetch(cfg.jwks_uri)).json();
  keyCache = { keys: jwks.keys || [], at: Date.now() };
  return keyCache.keys;
}

export const SERVICE_URL_OK = /^https:\/\/([a-z0-9-]+\.)*(botframework\.com|trafficmanager\.net|teams\.microsoft\.com)\//i;

export async function verifyIncoming(authHeader, activity) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('no token');
  const head = jwt.decode(token, { complete: true })?.header;
  if (!head?.kid) throw new Error('bad token');
  let jwk = (await signingKeys()).find(k => k.kid === head.kid);
  if (!jwk) { keyCache.at = 0; jwk = (await signingKeys()).find(k => k.kid === head.kid); }
  if (!jwk) throw new Error('unknown signing key');
  if (Array.isArray(jwk.endorsements) && activity?.channelId && !jwk.endorsements.includes(activity.channelId)) throw new Error('key not endorsed for channel');
  const pem = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  const claims = jwt.verify(token, pem, { algorithms: ['RS256'], issuer: 'https://api.botframework.com', audience: APP_ID(), clockTolerance: 300 });
  if (claims.serviceurl && activity?.serviceUrl && claims.serviceurl !== activity.serviceUrl) throw new Error('service url mismatch');
  if (!SERVICE_URL_OK.test(activity?.serviceUrl || '')) throw new Error('unexpected service url');
  return claims;
}

// ---------- outgoing: talk back to Teams ----------

let botToken = { value: null, exp: 0 };
async function getBotToken() {
  if (botToken.value && Date.now() < botToken.exp - 60000) return botToken.value;
  const tenant = process.env.TEAMS_BOT_TENANT_ID || process.env.MS_TENANT_ID;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID(), client_secret: process.env.TEAMS_BOT_APP_SECRET || '', scope: 'https://api.botframework.com/.default' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('bot token: ' + (j.error_description || j.error || res.status));
  botToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return botToken.value;
}

async function send(activity, payload) {
  const url = `${activity.serviceUrl.replace(/\/?$/, '/')}v3/conversations/${encodeURIComponent(activity.conversation.id)}/activities`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await getBotToken()), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: activity.recipient, recipient: activity.from, conversation: activity.conversation, ...payload }),
  });
  if (!res.ok) console.error('[Teams] send failed', res.status, (await res.text()).slice(0, 300));
}
const say = (activity, text) => send(activity, { type: 'message', text, textFormat: 'plain' });
const typing = activity => send(activity, { type: 'typing' }).catch(() => {});

export function draftCard(d, draftId, fromName) {
  const facts = [
    { title: 'From', value: d.reply_to ? `reply-all in ${d.reply_to.mailbox}'s thread` : fromName },
    { title: 'To', value: d.to.join(', ') },
    ...(d.cc.length ? [{ title: 'Cc', value: d.cc.join(', ') }] : []),
    { title: 'Subject', value: d.subject },
  ];
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard', version: '1.4', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      body: [
        { type: 'TextBlock', text: 'Draft email', weight: 'Bolder', size: 'Medium' },
        { type: 'FactSet', facts },
        { type: 'TextBlock', text: d.body, wrap: true, spacing: 'Medium' },
        { type: 'TextBlock', text: 'To change it, just tell me what to change.', isSubtle: true, wrap: true, size: 'Small' },
      ],
      actions: [
        { type: 'Action.Submit', title: 'Send', data: { action: 'send', draftId } },
        { type: 'Action.Submit', title: 'Cancel', data: { action: 'cancel', draftId } },
      ],
    },
  };
}

// ---------- handling a message ----------

async function handle(activity) {
  if (activity.type !== 'message') return;
  if (activity.channelData?.tenant?.id && activity.channelData.tenant.id !== process.env.MS_TENANT_ID) return;   // outside our company
  if (activity.conversation?.conversationType && activity.conversation.conversationType !== 'personal') {
    return say(activity, 'I only work in a 1:1 chat with Jonathan.');
  }
  const boss = process.env.TEAMS_BOSS_AAD_ID;
  if (!boss) return say(activity, `I'm almost set up.  Add this in Railway as TEAMS_BOSS_AAD_ID: ${activity.from?.aadObjectId || '(no id)'}`);
  if (activity.from?.aadObjectId !== boss) return say(activity, 'Sorry, I only take requests from Jonathan.');

  const { chatTurn, resolveDraft } = await import('../services/danielChat.js');
  const conversationId = activity.conversation.id;

  if (activity.value?.action && activity.value?.draftId) {
    const text = await resolveDraft({ conversationId, draftId: parseInt(activity.value.draftId, 10), action: activity.value.action });
    return say(activity, text);
  }

  const text = String(activity.text || '').replace(/<at>[^<]*<\/at>/g, '').trim();
  if (!text) return;
  await typing(activity);
  const keepTyping = setInterval(() => typing(activity), 3000);
  try {
    const out = await chatTurn({ conversationId, text });
    clearInterval(keepTyping);
    await say(activity, out.reply);
    if (out.draft) {
      const { TEAM } = await import('../services/daniel.js');
      await send(activity, { attachments: [draftCard(out.draft, out.draftId, TEAM[out.draft.from]?.name || out.draft.from)] });
    }
  } catch (e) {
    clearInterval(keepTyping);
    console.error('[Teams] chat failed:', e.message);
    await say(activity, `Sorry, I hit a problem: ${e.message}`);
  }
}

router.post('/messages', async (req, res) => {
  if (!APP_ID()) return res.status(503).json({ error: 'Teams is not set up' });
  try {
    await verifyIncoming(req.headers.authorization, req.body);
  } catch (e) {
    console.warn('[Teams] refused request:', e.message);
    return res.status(401).end();
  }
  res.status(200).end();   // answer Teams right away; the reply follows when Daniel is done
  handle(req.body).catch(e => console.error('[Teams] handler error:', e.message));
});

export default router;
