"""Extract prospect data from Apollo bulk enrichment results and generate SQL.
Filters out government, education, telecom, staffing, and non-US prospects."""
import json
import sys
import os
import glob

# Industries/keywords to EXCLUDE
EXCLUDE_INDUSTRIES = {
    'government', 'government administration', 'public safety', 'military',
    'education', 'higher education', 'primary/secondary education', 'e-learning',
    'education management', 'school', 'university', 'college',
    'telecommunications', 'telecom', 'wireless', 'internet service provider',
    'staffing', 'staffing and recruiting', 'human resources',
    'recruiting', 'employment', 'temp agency',
    'insurance', 'real estate agent',
}

EXCLUDE_COMPANY_KEYWORDS = [
    'city of', 'county of', 'state of', 'town of', 'village of',
    'department of', 'bureau of', 'office of',
    'school district', 'public school', 'university', 'college',
    'isd', 'board of education',
    'at&t', 'verizon', 'comcast', 'spectrum', 'cox communications',
    'centurylink', 'lumen', 'frontier communications', 't-mobile',
    'windstream', 'consolidated communications', 'zayo',
    'staffing', 'recruiting', 'manpower', 'kelly services',
]

EXCLUDE_EMAIL_DOMAINS = [
    '.gov', '.edu', '.mil', '.k12.',
]

def should_exclude(person):
    """Return True if this prospect should be excluded."""
    org = person.get('organization', {}) or {}
    industry = (org.get('industry', '') or '').lower()
    company = (org.get('name', '') or '').lower()
    email = (person.get('email', '') or '').lower()
    country = (person.get('country', '') or '').lower()

    # US only
    if country and country not in ('united states', 'us', 'usa', ''):
        return True

    # Check industry
    if industry in EXCLUDE_INDUSTRIES:
        return True

    # Check company name keywords
    for kw in EXCLUDE_COMPANY_KEYWORDS:
        if kw in company:
            return True

    # Check email domain
    for domain in EXCLUDE_EMAIL_DOMAINS:
        if domain in email:
            return True

    return False

def extract_prospects(filepath):
    """Extract usable prospect data from an Apollo bulk match result file."""
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
        first_name = person.get('first_name', '')
        last_name = person.get('last_name', '')
        title = person.get('title', '')

        org = person.get('organization', {}) or {}
        company = org.get('name', '')

        if not email or not first_name:
            continue

        if should_exclude(person):
            print(f"  EXCLUDED: {first_name} {last_name} - {company} ({org.get('industry', 'n/a')})", file=sys.stderr)
            continue

        prospects.append({
            'first_name': first_name,
            'last_name': last_name,
            'email': email,
            'title': title,
            'company': company,
        })

    return prospects

def generate_sql(prospects, existing_emails):
    """Generate SQL INSERT statements, skipping duplicates."""
    sql_lines = []
    new_count = 0

    for p in prospects:
        if p['email'].lower() in existing_emails:
            continue
        existing_emails.add(p['email'].lower())

        fn = p['first_name'].replace("'", "''")
        ln = p['last_name'].replace("'", "''")
        em = p['email'].replace("'", "''")
        ti = p['title'].replace("'", "''")
        co = p['company'].replace("'", "''")

        sql_lines.append(
            f"INSERT INTO prospects (first_name, last_name, email, title, company, status) "
            f"VALUES ('{fn}', '{ln}', '{em}', '{ti}', '{co}', 'in_sequence');"
        )
        new_count += 1

    return sql_lines, new_count

if __name__ == '__main__':
    results_dir = r'C:\Users\jwend\.claude\projects\C--Users-jwend-OneDrive-Desktop-admin\b026ef68-8eca-4cec-9743-d626c63c8e96\tool-results'

    files = sorted(glob.glob(os.path.join(results_dir, 'mcp-*apollo_people_bulk_match*.txt')))

    # Also get existing prospect emails from the first batch result to skip the original batch
    all_prospects = []
    for f in files:
        prospects = extract_prospects(f)
        all_prospects.extend(prospects)
        print(f"{os.path.basename(f)[-20:]}: {len(prospects)} kept", file=sys.stderr)

    # Also exclude the 19 already in the DB
    existing = {
        'michael.hare@nac-usa.org', 'jpbo@preferredcredit.com', 'doug@kennicott.com',
        'johnw@forwardbank.com', 'calexand@ksmmedia.com', 'mikecaraker@fgmarchitects.com',
        'mflaherty@feedingamerica.org', 'vrajesh.shah@myzinghealth.com', 'cvlad@lightology.com',
        'lmischke@meagher.com', 'drewp@jrschugel.com', 'mgarthwait@sartoricheese.com',
        'glawman@rmhsystems.com', 'kklosiewski@rauschsturm.com', 'wheld@nbplastics.com',
        'ashwin.patel@spmcf.org', 'jwalker@h2igroup.com', 'tfranklin@altimatemedical.com',
        'robin.bjella@northstarfinancial.com',
    }

    sql, count = generate_sql(all_prospects, existing)

    print(f"\n-- Total kept after filtering: {len(all_prospects)}", file=sys.stderr)
    print(f"-- Unique new (deduped, no existing): {count}", file=sys.stderr)

    for line in sql:
        print(line)
