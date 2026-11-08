// Stop the cadence on its own when a prospect's reply makes it pointless (Jonathan, 5 Nov 2026:
// "remove anyone that said no or asked to be removed, period").  Before this, the inbox labelled
// the reply but left the prospect in_sequence, so 27 people who had said no or asked for a meeting
// were still due Kayla's step 4 "circle back".
//
//   negative (no / not interested / remove me)  -> cadence stopped, Unsubscribed, Do Not Contact
//   not_now, positive, meeting_request          -> cadence stopped, Engaged (a person takes it from here)
//   anything else (ooo, question, referral...)  -> left alone
//
// Never touches a prospect a person already owns (booked, won, handed off), and never unsubscribes
// someone already Engaged: a "no" inside a live conversation ("no, Tuesday doesn't work") is not a
// removal request.  Uses the same SQL as the platform's own Stop Cadence (danielActions.js).

const OWNED = ['booked', 'won', 'handed_off'];
const GONE = ['unsubscribed', 'bounced', 'disqualified'];
const TO_ENGAGED = ['not_now', 'positive', 'meeting_request'];

async function cancelEnrollments(db, prospectId) {
  await db.execute(`UPDATE prospect_sequence_enrollment SET status='cancelled' WHERE prospect_id=? AND status IN ('active','paused')`, [prospectId]);
  const [r] = await db.execute(`UPDATE partner_enrollments SET status='cancelled', completed_at=NOW() WHERE prospect_id=? AND status IN ('active','waiting_partner','paused')`, [prospectId]);
  return r?.affectedRows || 0;
}

// Returns a short note of what was done, or null when nothing was.
export async function autoStopOnReply(db, { prospectId, agentId = null, receivedEmailId = null, sentiment }) {
  if (!prospectId || !sentiment) return null;
  if (sentiment !== 'negative' && !TO_ENGAGED.includes(sentiment)) return null;

  const [[p]] = await db.execute('SELECT id, email, company, status FROM prospects WHERE id=?', [prospectId]);
  if (!p || OWNED.includes(p.status)) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Already removed: just make sure nothing is still queued for them.
  if (GONE.includes(p.status)) {
    const n = await cancelEnrollments(db, p.id);
    return n ? `cleared ${n} leftover enrollment(s) for ${p.status} prospect` : null;
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
  if (p.status === 'engaged') return 'cadence stopped (already Engaged)';
  await db.execute(`UPDATE prospects SET status='engaged', updated_at=NOW() WHERE id=?`, [p.id]);
  if (sentiment === 'not_now' && receivedEmailId) {
    await db.execute(`UPDATE received_emails SET actioned=1, action_type='auto_not_now', actioned_at=NOW() WHERE id=?`, [receivedEmailId]);
  }
  await db.execute('INSERT INTO pipeline_events (prospect_id, from_status, to_status, agent_id, notes) VALUES (?,?,?,?,?)',
    [p.id, p.status, 'engaged', agentId, `Auto: ${sentiment.replace('_', ' ')} reply - cadence stopped`]);
  return 'cadence stopped, Engaged';
}
