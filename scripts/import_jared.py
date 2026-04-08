"""Import Jared's enriched prospects as partner source with pending_scrub status."""
import json
import sys
import os
import glob

EXCLUDE_INDUSTRIES = {
    'government', 'government administration', 'public safety', 'military',
    'education', 'higher education', 'primary/secondary education', 'e-learning',
    'education management', 'school', 'university', 'college',
    'telecommunications', 'telecom', 'wireless', 'internet service provider',
    'staffing', 'staffing and recruiting', 'human resources',
    'recruiting', 'employment', 'temp agency',
}

EXCLUDE_COMPANY_KEYWORDS = [
    'city of', 'county of', 'state of', 'town of', 'village of',
    'department of', 'bureau of', 'office of',
    'school district', 'public school', 'university', 'college',
    'isd', 'board of education',
    'at&t', 'verizon', 'comcast', 'spectrum', 'cox communications',
    'centurylink', 'lumen', 'frontier communications', 't-mobile',
    'staffing', 'recruiting', 'manpower', 'kelly services',
]

EXCLUDE_EMAIL_DOMAINS = ['.gov', '.edu', '.mil', '.k12.']

def should_exclude(person):
    org = person.get('organization', {}) or {}
    industry = (org.get('industry', '') or '').lower()
    company = (org.get('name', '') or '').lower()
    email = (person.get('email', '') or '').lower()
    country = (person.get('country', '') or '').lower()
    if country and country not in ('united states', 'us', 'usa', ''):
        return True
    if industry in EXCLUDE_INDUSTRIES:
        return True
    for kw in EXCLUDE_COMPANY_KEYWORDS:
        if kw in company:
            return True
    for domain in EXCLUDE_EMAIL_DOMAINS:
        if domain in email:
            return True
    return False

def extract_prospects(filepath):
    prospects = []
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    text = data[0]['text'] if isinstance(data, list) and 'text' in data[0] else json.dumps(data)
    parsed = json.loads(text) if isinstance(text, str) else text
    matches = parsed.get('matches', [])
    for match in matches:
        person = match.get('person') or match
        if not person:
            continue
        email = person.get('email')
        if not email:
            continue
        if should_exclude(person):
            continue
        org = person.get('organization', {}) or {}
        prospects.append({
            'first_name': person.get('first_name', ''),
            'last_name': person.get('last_name', ''),
            'email': email,
            'title': person.get('title', ''),
            'company': org.get('name', ''),
            'industry': org.get('industry', ''),
        })
    return prospects

if __name__ == '__main__':
    results_dir = r'C:\Users\jwend\.claude\projects\C--Users-jwend-OneDrive-Desktop-admin\b026ef68-8eca-4cec-9743-d626c63c8e96\tool-results'

    # Only process the Jared-specific enrichment files (last 10 files)
    all_files = sorted(glob.glob(os.path.join(results_dir, 'mcp-*apollo_people_bulk_match*.txt')))
    # Take the last 10 files (Jared's batches)
    jared_files = all_files[-10:]

    all_prospects = []
    for f in jared_files:
        prospects = extract_prospects(f)
        all_prospects.extend(prospects)

    # Deduplicate
    seen = set()
    unique = []
    for p in all_prospects:
        if p['email'].lower() not in seen:
            seen.add(p['email'].lower())
            unique.append(p)

    for p in unique:
        fn = p['first_name'].replace("'", "''")
        ln = p['last_name'].replace("'", "''")
        em = p['email'].replace("'", "''")
        ti = p['title'].replace("'", "''")
        co = p['company'].replace("'", "''")
        ind = p['industry'].replace("'", "''")

        print(
            f"INSERT INTO prospects (first_name, last_name, email, title, company, industry, source, status) "
            f"SELECT '{fn}', '{ln}', '{em}', '{ti}', '{co}', '{ind}', 'partner', 'pending_scrub' "
            f"FROM dual WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE email = '{em}');"
        )

    print(f"-- Jared prospects: {len(unique)} unique after filtering", file=sys.stderr)
