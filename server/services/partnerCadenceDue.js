// Partner cadence due-ness, shared by the scheduler and scripts/partner-cadence-dryrun.js.
// No DB or network imports here, so a script can load it without starting anything.

// ---- Business day helpers ----
// Holidays excluded from business day counts (fixed dates + computed floating holidays)
export function getHolidays(year) {
  const h = new Set();
  h.add(`${year}-01-01`); // New Year's Day
  h.add(`${year}-07-04`); // July 4th
  h.add(`${year}-12-25`); // Christmas
  // Memorial Day: last Monday of May
  const may = new Date(year, 5, 0); // last day of May
  may.setDate(may.getDate() - ((may.getDay() + 6) % 7));
  h.add(may.toISOString().slice(0, 10));
  // Labor Day: first Monday of September
  const sep = new Date(year, 8, 1);
  sep.setDate(sep.getDate() + ((8 - sep.getDay()) % 7 || 7));
  h.add(sep.toISOString().slice(0, 10));
  return h;
}

export function countBusinessDays(startDate, endDate) {
  const cur = new Date(startDate);
  const end = new Date(endDate);
  cur.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() + 1); // start counting day after startDate
  let count = 0;
  while (cur <= end) {
    const dow = cur.getDay();
    const ds = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !getHolidays(cur.getFullYear()).has(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
// ---- End business day helpers ----

// Is this enrollment's current step due to send now?  `row` carries the step as
// cur_step_type / cur_delay_days (joined in the scheduler query).
//   agent_send_cc  (step 1):    delay_days calendar days after enrollment
//   agent_followup (steps 3-6): delay_days business days after the partner replied,
//                               and only while the enrollment is 'active' (the send
//                               branch ignores anything else, so it can't be "due")
export function isPartnerStepDue(row, now = new Date()) {
  if (row.cur_step_type === 'agent_send_cc') {
    const dueAt = new Date(row.enrolled_at);
    dueAt.setDate(dueAt.getDate() + Number(row.cur_delay_days || 0));
    return dueAt <= now;
  }
  if (row.cur_step_type === 'agent_followup') {
    if (!row.partner_replied_at || row.status !== 'active') return false;
    return countBusinessDays(new Date(row.partner_replied_at), now) >= row.cur_delay_days;
  }
  return false;
}

// One row per agent: the first DUE row in the order given.  Rows must arrive in the
// scheduler's priority order.  2026-10-19: taking only each agent's top row let one
// not-yet-due thread (Megan's seq 5 step 4, 15-day delay) block 54 due law/accounting
// step 4s; Kayla's held step 3 (delay 999) would have blocked her the same way.
export function pickFirstDuePerAgent(rows, now = new Date()) {
  const picked = new Map();
  for (const row of rows) {
    if (picked.has(row.agent_id)) continue;
    if (isPartnerStepDue(row, now)) picked.set(row.agent_id, row);
  }
  return [...picked.values()];
}
