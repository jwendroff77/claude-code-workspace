import pool from '../db/connection.js';

const APOLLO_BASE = 'https://api.apollo.io';

async function getApiKey() {
  const [rows] = await pool.execute(
    "SELECT setting_value FROM settings WHERE setting_key = 'apollo_api_key'"
  );
  return rows[0]?.setting_value || process.env.APOLLO_API_KEY;
}

// Search for people on Apollo
export async function searchPeople({ query, perPage = 50, page = 1 }) {
  const apiKey = await getApiKey();

  const res = await fetch(`${APOLLO_BASE}/v1/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      api_key: apiKey,
      q_organization_domains: query.domains || undefined,
      person_titles: query.titles || undefined,
      person_locations: query.locations || undefined,
      organization_num_employees_ranges: query.employeeRanges || undefined,
      per_page: perPage,
      page,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apollo API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Import prospects from Apollo search results
export async function importProspects({ people, agentId, listId }) {
  const imported = [];
  const duplicates = [];

  for (const person of people) {
    // Check exclusion list
    const [excluded] = await pool.execute(
      'SELECT id FROM exclusion_list WHERE email = ?',
      [person.email]
    );
    if (excluded.length > 0) continue;

    // Check existing prospect (dedup by email)
    const [existing] = await pool.execute(
      'SELECT id FROM prospects WHERE email = ?',
      [person.email]
    );

    if (existing.length > 0) {
      duplicates.push(person.email);
      continue;
    }

    // Check fuzzy dedup (same name + company)
    const [fuzzy] = await pool.execute(
      'SELECT id FROM prospects WHERE first_name = ? AND last_name = ? AND company = ?',
      [person.first_name, person.last_name, person.organization?.name || '']
    );

    if (fuzzy.length > 0) {
      duplicates.push(person.email);
      continue;
    }

    const [result] = await pool.execute(
      `INSERT INTO prospects (first_name, last_name, title, company, email, phone, linkedin_url, company_size, industry, city, state, apollo_id, assigned_agent_id, list_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence')`,
      [
        person.first_name,
        person.last_name,
        person.title,
        person.organization?.name || '',
        person.email,
        person.phone_numbers?.[0]?.sanitized_number || null,
        person.linkedin_url || null,
        person.organization?.estimated_num_employees?.toString() || null,
        person.organization?.industry || null,
        person.city || null,
        person.state || null,
        person.id,
        agentId,
        listId || null,
      ]
    );

    imported.push({ id: result.insertId, email: person.email });
  }

  return { imported, duplicates };
}

// Log an Apollo pull
export async function logPull({ agentId, query, prospectsPulled, creditsUsed }) {
  await pool.execute(
    `INSERT INTO apollo_pulls (agent_id, query_json, prospects_pulled, credits_used)
     VALUES (?, ?, ?, ?)`,
    [agentId, JSON.stringify(query), prospectsPulled, creditsUsed]
  );
}
