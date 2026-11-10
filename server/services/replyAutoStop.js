// Stop the cadence on its own when a prospect's reply makes it pointless (Jonathan, 5 Nov 2026:
// "remove anyone that said no or asked to be removed, period").  Before this, the inbox labelled
// the reply but left the prospect in_sequence, so people who had said no were still due the next
// step (27 on 5 Nov, 14 more by hand 8-9 Nov on Steven's and Jared's threads).
//
//   negative (no / not interested / remove me)  -> cadence stopped, Unsubscribed, Do Not Contact
//   negative, but the problem is Comcast itself -> cadence stopped, Engaged, left in the inbox for him
//     (Etna Supply, The Granite Group 9 Nov: still a 1Cloud prospect for a direct reply, not DNC)
//   negative, but asks us to send pricing        -> cadence stopped, Engaged, left in the inbox for him
//   not_now                                      -> cadence stopped, Engaged, check-back task in 90 days
//   positive, meeting_request                    -> cadence stopped, Engaged (a person takes it from here)
//   anything else (ooo, question, referral...)  -> left alone
//
// Never touches a prospect a person already owns (booked, won, handed off), never acts on mail from
// our own agents or partners, and never unsubscribes someone already Engaged: a "no" inside a live
// conversation ("no, Tuesday doesn't work") is not a removal request.
// Uses the same SQL as the platform's own Stop Cadence (danielActions.js).

const OWNED = ['booked', 'won', 'handed_off'];
const GONE = ['unsubscribed', 'bounced', 'disqualified'];
const TO_ENGAGED = ['not_now', 'positive', 'meeting_request'];
const CHECK_BACK_DAYS = 90;

// The prospect's own words: HTML stripped, and the quoted thread cut off, because our quoted
// email talks about Comcast and would make every no look like a Comcast complaint.
export function replyOnly(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/\s+/g, ' ')
    .split(/\bFrom:\s|-----\s?Original Message|_{10,}|\bOn [^\n]{5,120}? wrote:/i)[0]
    .trim()
    .slice(0, 3000);
}

// "We're cancelling all our Comcast accounts", "too many issues with Comcast billing": a no to
// Comcast, not to 1Cloud.  An explicit removal request still wins.
export function isComcastTrouble(text = '') {
  return /comcast/i.test(text)
    && /(cancel|issue|problem|dispute|billing|terrible|awful|horrible|leaving|moving away|pulling away|switch|aggregator|nightmare|outage)/i.test(text)
    && !/(remove|unsubscribe|do not (contact|email)|don'?t (contact|email)|stop (emailing|contacting))/i.test(text);
}

// "I am only looking for price decreases, so send those over" (Brennan, 9 Nov): the classifier calls
// it a no, but they asked for something.  A person decides; never Do Not Contact.
export function asksForPricing(text = '') {
  return /\b(price|prices|pricing|quote|quotes|rates?)\b.{0,60}\b(send|share|email)\b|\b(send|share|email)\b.{0,40}\b(price|prices|pricing|quote|quotes|rates?|numbers)\b/i.test(text)
    && !/(remove|unsubscribe|do not (contact|email)|don'?t (contact|email)|stop (emailing|contacting))/i.test(text);
}

async function cancelEnrollments(db, prospectId) {
  await db.execute(`UPDATE prospect_sequence_enrollment SET status='cancelled' WHERE prospect_id=? AND status IN ('active','paused')`, [prospectId]);
  const [r] = await db.execute(`UPDATE partner_enrollments SET status='cancelled', completed_at=NOW() WHERE prospect_id=? AND status IN ('active','waiting_partner','paused')`, [prospectId]);
  return r?.affectedRows || 0;
}

async function toEngaged(db, p, agentId, note) {
  await db.execute(`UPDATE prospects SET status='engaged', updated_at=NOW() WHERE id=?`, [p.id]);
  await db.execute('INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?,?,?,?,?)',
    [p.id, p.status, 'engaged', agentId, note]);
}

// Returns a short note of what was done, or null when nothing was.
export async function autoStopOnReply(db, { prospectId, agentId = null, receivedEmailId = null, sentiment, text = '', senderEmail = '' }) {
  if (!prospectId || !sentiment) return null;
  if (sentiment !== 'negative' && !TO_ENGAGED.includes(sentiment)) return null;

  // Our own agents and partners (Steven, Jared) are rows in agents: their notes are never a prospect's answer.
  if (senderEmail) {
    const [ours] = await db.execute('SELECT id FROM agents WHERE LOWER(email)=LOWER(?) OR LOWER(smtp_user)=LOWER(?)', [senderEmail, senderEmail]);
    if (ours.length) return null;
  }

  const [[p]] = await db.execute('SELECT id, email, company, status FROM prospects WHERE id=?', [prospectId]);
  if (!p || OWNED.includes(p.status)) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Already removed: just make sure nothing is still queued for them.
  if (GONE.includes(p.status)) {
    const n = await cancelEnrollments(db, p.id);
    return n ? `cleared ${n} leftover enrollment(s) for ${p.status} prospect` : null;
  }

  if (sentiment === 'negative' && isComcastTrouble(text)) {
    await cancelEnrollments(db, p.id);
    if (p.status === 'engaged') return 'cadence stopped (already Engaged), not a Comcast fit';
    // Reply stays un-actioned so it sits in the inbox for his direct-reply decision.
    await toEngaged(db, p, agentId, 'Auto: no to Comcast (not to 1Cloud) - cadence stopped, possible direct reply, not Do Not Contact');
    return 'cadence stopped, Engaged, not a Comcast fit (no DNC)';
  }

  if (sentiment === 'negative' && asksForPricing(text)) {
    await cancelEnrollments(db, p.id);
    if (p.status === 'engaged') return 'cadence stopped (already Engaged), asked for pricing';
    await toEngaged(db, p, agentId, 'Auto: said no but asked for pricing - cadence stopped, left for a person, not Do Not Contact');
    return 'cadence stopped, Engaged, asked for pricing (no DNC)';
  }

  if (sentiment === 'negative') {
    if (p.status === 'engaged') return null;
    await cancelEnrollments(db, p.id);
    await db.execute(`UPDATE prospects SET status='unsubscribed', updated_at=NOW() WHERE id=?`, [p.id]);
    const [x] = await db.execute('SELECT id FROM exclusion_list WHERE LOWER(email)=LOWER(?)', [p.email]);
    if (!x.length) {
      await db.execute('INSERT INTO exclusion_list (email, company, reason) VALUES (?,?,?)',
        [p.email, p.company, `Auto: said no / asked to be removed ${today}`]);
    }
    if (receivedEmailId) {
      await db.execute(`UPDATE received_emails SET actioned=1, action_type='auto_unsubscribe', actioned_at=NOW() WHERE id=?`, [receivedEmailId]);
    }
    await db.execute('INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?,?,?,?,?)',
      [p.id, p.status, 'unsubscribed', agentId, 'Auto: said no / asked to be removed - cadence stopped, Do Not Contact']);
    return 'unsubscribed + Do Not Contact';
  }

  // not_now / positive / meeting_request: a person handles it from here.
  await cancelEnrollments(db, p.id);
  if (sentiment === 'not_now') {
    const [t] = await db.execute(`SELECT id FROM tasks WHERE prospect_id=? AND status='pending' AND title LIKE 'Check back%'`, [p.id]);
    if (!t.length) {
      const quote = String(text).replace(/\s+/g, ' ').trim().slice(0, 300);
      await db.execute(
        `INSERT INTO tasks (prospect_id, agent_id, task_type, title, description, due_date) VALUES (?,?,?,?,?, DATE_ADD(CURDATE(), INTERVAL ${CHECK_BACK_DAYS} DAY))`,
        [p.id, agentId, 'custom', `Check back: ${p.company || p.email}`, `Said not now on ${today}: "${quote}"  Change the date if they named one.`]);
    }
    if (receivedEmailId) {
      await db.execute(`UPDATE received_emails SET actioned=1, action_type='auto_not_now', actioned_at=NOW() WHERE id=?`, [receivedEmailId]);
    }
  }
  if (p.status === 'engaged') return 'cadence stopped (already Engaged)';
  await toEngaged(db, p, agentId, `Auto: ${sentiment.replace('_', ' ')} reply - cadence stopped`);
  return sentiment === 'not_now' ? `cadence stopped, Engaged, check back in ${CHECK_BACK_DAYS} days` : 'cadence stopped, Engaged';
}
