import pool from '../db/connection.js';

// Check if a prospect is a duplicate
export async function checkDuplicate({ email, firstName, lastName, company }) {
  // Exact email match
  const [emailMatch] = await pool.execute(
    'SELECT id, first_name, last_name, company FROM prospects WHERE email = ?',
    [email]
  );

  if (emailMatch.length > 0) {
    return { isDuplicate: true, type: 'email', existing: emailMatch[0] };
  }

  // Check exclusion list
  const [excluded] = await pool.execute(
    'SELECT id, reason FROM exclusion_list WHERE email = ?',
    [email]
  );

  if (excluded.length > 0) {
    return { isDuplicate: true, type: 'excluded', reason: excluded[0].reason };
  }

  // Fuzzy match: same name + company
  if (firstName && lastName && company) {
    const [fuzzyMatch] = await pool.execute(
      'SELECT id, email FROM prospects WHERE first_name = ? AND last_name = ? AND company = ?',
      [firstName, lastName, company]
    );

    if (fuzzyMatch.length > 0) {
      return { isDuplicate: true, type: 'fuzzy', existing: fuzzyMatch[0] };
    }
  }

  return { isDuplicate: false };
}

// Bulk dedup check
export async function bulkDedupCheck(prospects) {
  const results = [];
  for (const prospect of prospects) {
    const check = await checkDuplicate({
      email: prospect.email,
      firstName: prospect.first_name,
      lastName: prospect.last_name,
      company: prospect.company,
    });
    results.push({ ...prospect, ...check });
  }
  return results;
}
