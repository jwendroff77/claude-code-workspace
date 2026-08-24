/**
 * Signal Intel Service
 * =====================
 * Real-time lead intelligence from news triggers + Apollo enrichment.
 * Ported from Python signal_intel_triggers.py to Node.js.
 */

import pool from '../db/connection.js';

// ── RSS Sources ──────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  // Google News - M&A
  {
    name: 'Google News',
    trigger: 'ma_acquisition',
    url: 'https://news.google.com/rss/search?q=company+acquired+acquisition+merger+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['acqui', 'merger', 'acquires', 'buys', 'purchased by', 'strategic combination'],
    exclude: ['album', 'song', 'film', 'movie', 'game', 'app', 'nba', 'nfl', 'nhl', 'mlb'],
  },
  // Google News - Expansion
  {
    name: 'Google News',
    trigger: 'new_facility',
    url: 'https://news.google.com/rss/search?q=new+facility+expansion+headquarters+warehouse+plant+office+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['new facility', 'new headquarters', 'expansion', 'opens new', 'new warehouse', 'new plant', 'new office', 'breaking ground', 'groundbreaking', 'new location', 'new campus', 'opens facility', 'manufacturing plant', 'distribution center', 'data center', 'build new', 'construction of', 'new building'],
    exclude: ['school district', 'university', 'museum', 'national park', 'album', 'film', 'video game', 'ice detention', 'prison'],
  },
  // Google News - Relocation
  {
    name: 'Google News',
    trigger: 'relocation',
    url: 'https://news.google.com/rss/search?q=company+relocating+moving+headquarters+new+office+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['relocat', 'moving headquarters', 'new headquarters', 'moves to', 'signed lease', 'new home'],
    exclude: ['residential', 'apartment', 'home', 'house', 'family'],
  },
  // PR Newswire
  {
    name: 'PR Newswire',
    trigger: 'ma_acquisition',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
    keywords: ['acqui', 'merger', 'acquires', 'completes acquisition', 'strategic combination'],
    exclude: ['album', 'song', 'film', 'game', 'nba', 'nfl'],
  },
  // Business Wire (via Google News)
  {
    name: 'Business Wire',
    trigger: 'ma_acquisition',
    url: 'https://news.google.com/rss/search?q=site:businesswire.com+acquisition+merger+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['acqui', 'merger', 'acquires', 'acquisition', 'strategic combination'],
    exclude: ['album', 'song', 'film', 'game'],
  },
  // GlobeNewswire - M&A
  {
    name: 'GlobeNewswire',
    trigger: 'ma_acquisition',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/25-Mergers%20Acquisitions',
    keywords: ['acqui', 'merger', 'acquires', 'acquisition'],
    exclude: [],
  },
  // GlobeNewswire - Expansion
  {
    name: 'GlobeNewswire',
    trigger: 'new_facility',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/38-Facilities%20Services',
    keywords: ['new facility', 'expansion', 'new office', 'new location', 'opens', 'new plant'],
    exclude: [],
  },
  // Google News - M&A deals (alternate)
  {
    name: 'Google News',
    trigger: 'ma_acquisition',
    url: 'https://news.google.com/rss/search?q=acquires+company+deal+closes+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['acqui', 'closes deal', 'deal closes', 'completes acquisition', 'signs definitive', 'definitive agreement', 'buys'],
    exclude: ['album', 'song', 'film', 'movie', 'game', 'nba', 'nfl', 'nhl', 'mlb'],
  },
  // Google News - Lease / office moves
  {
    name: 'Google News',
    trigger: 'relocation',
    url: 'https://news.google.com/rss/search?q=%22signed+lease%22+OR+%22new+office%22+OR+%22new+headquarters%22+OR+%22moves+headquarters%22+company+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['signed lease', 'new office', 'new headquarters', 'moves headquarters', 'relocat', 'new home', 'new location'],
    exclude: ['residential', 'apartment', 'home for sale', 'family home', 'school district', 'university'],
  },
  // Google News - Groundbreaking
  {
    name: 'Google News',
    trigger: 'new_facility',
    url: 'https://news.google.com/rss/search?q=%22ground+breaking%22+OR+%22breaks+ground%22+OR+%22new+development%22+commercial+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['breaks ground', 'groundbreaking', 'ground breaking', 'new development', 'new facility', 'new building', 'opens new', 'ribbon cutting'],
    exclude: ['affordable housing', 'school district', 'university', 'museum', 'church', 'residential'],
  },
  // Google News - Economic development
  {
    name: 'Google News',
    trigger: 'new_facility',
    url: 'https://news.google.com/rss/search?q=%22economic+development%22+new+jobs+facility+company+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['new jobs', 'new facility', 'expand', 'investment', 'economic development', 'creating jobs', 'new location'],
    exclude: ['school district', 'university', 'prison', 'detention'],
  },

  // ── Vertical-targeted feeds ────────────────────────────────────────────────
  // The generic feeds above surface whatever is in the news; these narrow to the
  // ICP verticals the partner cadences actually sell into, so weekly auto-staging
  // pulls from the right pool. `vertical` routes the lead to a partner sequence.

  {
    name: 'Google News',
    trigger: 'new_facility',
    vertical: 'senior_living',
    url: 'https://news.google.com/rss/search?q=%22senior+living%22+OR+%22assisted+living%22+OR+%22skilled+nursing%22+opens+OR+expands+OR+%22breaks+ground%22+OR+acquires+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['senior living', 'assisted living', 'skilled nursing', 'retirement community', 'memory care', 'continuing care'],
    exclude: ['obituary', 'lawsuit', 'abuse', 'citation', 'fined', 'closure', 'shuts down'],
  },
  {
    name: 'Google News',
    trigger: 'ma_acquisition',
    vertical: 'senior_living',
    url: 'https://news.google.com/rss/search?q=%22senior+living%22+OR+%22assisted+living%22+acquisition+OR+acquires+OR+portfolio+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['senior living', 'assisted living', 'skilled nursing', 'retirement community', 'acqui', 'portfolio'],
    exclude: ['obituary', 'lawsuit', 'abuse', 'citation', 'fined'],
  },
  {
    name: 'Google News',
    trigger: 'new_facility',
    vertical: 'healthcare',
    url: 'https://news.google.com/rss/search?q=%22medical+group%22+OR+%22dental+group%22+OR+%22veterinary+group%22+OR+%22health+system%22+opens+OR+expands+OR+acquires+OR+%22new+clinic%22+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['medical group', 'dental group', 'veterinary', 'health system', 'new clinic', 'physician group', 'urgent care', 'ambulatory', 'multi-site'],
    exclude: ['lawsuit', 'malpractice', 'settlement', 'indicted', 'fraud charges', 'university', 'school district'],
  },
  {
    name: 'Google News',
    trigger: 'ma_acquisition',
    vertical: 'healthcare',
    url: 'https://news.google.com/rss/search?q=%22medical+group%22+OR+%22dental+practice%22+OR+%22veterinary%22+acquisition+OR+%22adds+locations%22+OR+%22partners+with%22+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['medical group', 'dental', 'veterinary', 'physician group', 'acqui', 'adds locations', 'practice management'],
    exclude: ['lawsuit', 'malpractice', 'settlement', 'fraud', 'university'],
  },
  {
    name: 'Google News',
    trigger: 'new_facility',
    vertical: 'hospitality',
    url: 'https://news.google.com/rss/search?q=hotel+OR+resort+%22opens%22+OR+%22breaks+ground%22+OR+%22renovation%22+OR+%22acquires%22+property+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['hotel', 'resort', 'hospitality', 'opens', 'renovation', 'breaks ground', 'property', 'casino resort'],
    exclude: ['review', 'travel guide', 'best hotels', 'things to do', 'tripadvisor', 'deals on'],
  },
  {
    name: 'Google News',
    trigger: 'new_facility',
    vertical: 'restaurant',
    url: 'https://news.google.com/rss/search?q=%22restaurant+group%22+OR+franchisee+OR+%22multi-unit%22+opens+OR+expands+OR+%22new+locations%22+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['restaurant group', 'franchisee', 'multi-unit', 'new locations', 'opens', 'expansion', 'franchise group'],
    exclude: ['recipe', 'review', 'best restaurants', 'where to eat', 'closes permanently', 'bankruptcy'],
  },
  {
    name: 'Google News',
    trigger: 'new_facility',
    vertical: 'property_mgmt',
    url: 'https://news.google.com/rss/search?q=%22property+management%22+OR+%22commercial+real+estate%22+acquires+OR+%22adds+to+portfolio%22+OR+%22breaks+ground%22+when:14d&hl=en-US&gl=US&ceid=US:en',
    keywords: ['property management', 'commercial real estate', 'portfolio', 'acqui', 'breaks ground', 'multifamily', 'industrial park', 'office tower'],
    exclude: ['home for sale', 'housing market', 'mortgage rates', 'residential listing', 'school district'],
  },
];

// Target titles for Apollo enrichment
const TARGET_TITLES = [
  'IT Director', 'Director of IT', 'VP of IT', 'Vice President of IT',
  'CTO', 'Chief Technology Officer', 'Director of Information Technology',
  'IT Manager', 'Information Technology Manager',
  'Director of Operations', 'VP of Operations', 'Vice President of Operations',
  'Operations Manager', 'Operations Director',
  'COO', 'Chief Operating Officer', 'Facilities Director',
  'CEO', 'Chief Executive Officer', 'President',
];

const LOOKBACK_DAYS = 14;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Business signal words for filtering general news
const BIZ_WORDS = [
  'company', 'corp', 'inc', 'llc', 'ltd', 'group', 'firm',
  'business', 'enterprise', 'industries', 'solutions', 'services',
  'partner', 'headquarter', 'billion', 'million', 'deal',
  'agreement', 'stake', 'ceo', 'cto', 'coo', 'cfo',
  'manufacturer', 'acquir', 'merg', 'investor', 'capital',
  'ventures', 'holdings', 'technologies', 'global', 'international',
  'brands', 'associates', 'consulting', 'network', 'systems',
  'pharma', 'health', 'energy', 'financial', 'logistics',
  'aerospace', 'telecom', 'communications', 'realty', 'properties',
];

const TRUSTED_BIZ_SOURCES = ['PR Newswire', 'Business Wire', 'GlobeNewswire', 'SEC EDGAR'];

// Exclude government and education organizations
const EXCLUDE_ORG_KEYWORDS = [
  'city of', 'county', 'state of', 'government', 'municipality', 'federal',
  'department of', 'bureau of', 'public administration', 'military',
  'university', 'college', 'school district', 'school board', 'institute of',
  'academy', 'public school', 'higher education',
];

// Foreign geographic hints — if a title or description contains any of these
// AND has no US counter-signal, the article is dropped pre-extraction.
const FOREIGN_HINTS = [
  'singapore', 'malaysia', 'kuala lumpur', 'uae', 'abu dhabi', 'dubai',
  'london', 'dublin', 'ireland', 'paris', 'tokyo', 'seoul', 'mumbai',
  'bangalore', 'delhi', 'brazil', 'brazilian', 'danish', 'swedish',
  'norwegian', 'finnish', 'canadian', ' canada ', 'toronto', 'sydney', 'melbourne',
  'wales', 'scotland', 'germany', 'berlin', 'france', 'french', 'italy',
  'italian', 'spain', 'spanish', 'netherlands', 'amsterdam', 'hong kong',
  ' china ', 'chinese', ' japan ', 'japanese', 'south africa',
  'middle east', 'new zealand', 'auckland', 'kuwait', 'saudi arabia',
  'riyadh', 'thailand', 'bangkok', 'vietnam', 'indonesia', 'philippines',
  'russian', 'moscow', 'ukraine', 'poland', 'warsaw',
];

const US_INDICATORS = [
  'u.s.', 'u.s ', ' us ', ' usa ', 'united states', 'america ', 'american ',
  'texas', 'california', 'new york', 'florida', 'georgia', 'illinois',
  'ohio', 'michigan', 'pennsylvania', 'north carolina', 'south carolina',
  'virginia', 'washington', 'massachusetts', 'minnesota', 'wisconsin',
  'tennessee', 'kentucky', 'oklahoma', 'missouri', 'kansas', 'nebraska',
  'colorado', 'arizona', 'nevada', 'oregon', 'utah', 'nashville', 'atlanta',
  'chicago', 'houston', 'dallas', 'austin', 'phoenix', 'boston', 'denver',
  'seattle', 'miami', 'charlotte', 'indianapolis', 'cleveland', 'cincinnati',
  'pittsburgh', 'philadelphia', 'detroit', 'milwaukee', 'louisville',
  'memphis', 'st. louis', 'kansas city', 'syracuse', 'buffalo', 'rochester',
  'salt lake', 'boise', 'portland', 'sacramento', 'san francisco',
  'san diego', 'los angeles', 'san antonio', 'orlando', 'tampa', 'jacksonville',
  'raleigh', 'richmond', 'baltimore', 'washington d.c.', 'minneapolis',
];

// Stop-phrase blocklist for extracted company names — these are headline
// fragments that get mis-identified as company names by the extractor.
const LEADING_PHRASE_BLOCK = [
  'american company', 'new york developer', 'birmingham general contractor',
  'bank acquisition', 'retail watch', 'gowanus', 'danish advanced',
  '103-acre', 'new development', 'acquisition count', 'list of',
  'm&a news', 'update', 'brief', 'corrected', 'uae business',
  'bank ', 'the business journals', 'stocktitan', 'tipranks',
  'breaking news', 'daily wire', 'stock market',
];

const CONTAINS_PHRASE_BLOCK = [
  'closing in on deal', 'stock rises', 'shares tumble', 'closes in on',
  'triggers over', 'stock soars', 'stock plunges', 'shares jump',
  'shares drop', 'stock slides', 'stock surges',
];

/**
 * Decode common HTML entities that survive RSS parsing.
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Does the text contain a foreign hint without a countering US indicator?
 */
function looksForeign(text) {
  const t = ' ' + (text || '').toLowerCase() + ' ';
  const foreign = FOREIGN_HINTS.some((hint) => t.includes(hint));
  if (!foreign) return false;
  const hasUs = US_INDICATORS.some((us) => t.includes(us));
  return !hasUs;
}

/**
 * Is this candidate name actually a headline fragment (not a company)?
 */
function isBadCandidate(candidate) {
  if (!candidate) return true;
  const lower = candidate.toLowerCase().trim();

  // Leading-phrase block — candidate starts with one of these
  if (LEADING_PHRASE_BLOCK.some((p) => lower.startsWith(p))) return true;
  // Contains-phrase block — candidate contains one of these anywhere
  if (CONTAINS_PHRASE_BLOCK.some((p) => lower.includes(p))) return true;
  // Digits followed by -acre/-million/-billion/-foot
  if (/\d+[-\s]?(acre|million|billion|foot|square|percent)/i.test(candidate)) return true;
  // Starts with lowercase letter (proper noun check)
  if (/^[a-z]/.test(candidate.trim())) return true;
  // Mostly numeric or mostly punctuation
  if (/^[\d\W]+$/.test(candidate.trim())) return true;
  // Contains common sentence fragments
  const fragments = [' to be ', ' closes ', ' rises ', ' tumble', ' triggers ', ' breaks ground', ' strikes '];
  if (fragments.some((f) => lower.includes(f))) return true;

  // Ends on a dangling verb/auxiliary — the headline got cut mid-clause, so what
  // survived is a sentence fragment, not a company ("Datavault AI Will",
  // "Hanwha Defense USA seeks", "Sunoco LP to").
  if (/\s(will|to|seeks?|plans?|says?|is|are|has|have|may|could|would|plans to|plans on|plans for|eyes|plots|weighs|nears|adds|sets|plans|expects?|reports?|announces?|and|with|after|amid|as|for|in|on|of)$/i.test(candidate.trim())) return true;

  // Editorial/wire labels that survive into the fallback path. Matched only as a
  // whole candidate or before a delimiter, so real names that merely start with
  // one of these words (Live Nation, Analysis Group) still pass.
  const EDITORIAL = '(exclusive|breaking|update|report|opinion|analysis|watch|live|video|photos?|just in|developing)';
  if (new RegExp(`^${EDITORIAL}$`, 'i').test(candidate.trim())) return true;
  if (new RegExp(`^${EDITORIAL}\\s*[:\\-|]`, 'i').test(candidate.trim())) return true;

  return false;
}

/**
 * Normalize a company name for dedup keys — strip entity suffixes + punctuation.
 */
function normalizeCompanyKey(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // Strip trailing entity descriptors
  n = n.replace(/\b(inc|llc|corp|corporation|ltd|co|company|holdings?|group|plc|l\.p\.|lp)\b\.?\s*$/g, '');
  // Strip all punctuation
  n = n.replace(/[^\w\s]/g, ' ');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAge(pubDate) {
  if (!pubDate) return 0;
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return 0;
    const diff = Date.now() - d.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]+>/g, ' ').trim();
}

function isRelevant(title, desc, source) {
  const decodedTitle = decodeHtmlEntities(title);
  const decodedDesc = decodeHtmlEntities(desc);
  const text = (decodedTitle + ' ' + decodedDesc).toLowerCase();

  // Must match at least one keyword
  const hasKeyword = (source.keywords || []).some(kw => text.includes(kw.toLowerCase()));
  if (!hasKeyword) return false;

  // Must not match any exclusion
  const hasExclude = (source.exclude || []).some(ex => text.includes(ex.toLowerCase()));
  if (hasExclude) return false;

  // Foreign geographic pre-filter — skip for trusted biz sources since they
  // often reference US companies' foreign operations.
  if (!TRUSTED_BIZ_SOURCES.includes(source.name) && looksForeign(decodedTitle + ' ' + decodedDesc)) {
    return false;
  }

  // Trusted biz sources pass directly
  if (TRUSTED_BIZ_SOURCES.includes(source.name)) return true;

  // General news needs a business signal word or dollar amount
  if (BIZ_WORDS.some(b => text.includes(b))) return true;
  if (/\$[\d,.]+\s*[bmk]|\$[\d,.]+\s*(billion|million|thousand)/i.test(text)) return true;

  return false;
}

/**
 * Extract a company name from a headline using regex patterns.
 * Falls back to taking the first segment before common delimiters.
 */
export { decodeHtmlEntities, looksForeign, isBadCandidate, normalizeCompanyKey, cleanCompanyName, extractCompanyFromHeadline, isRelevant };

function extractCompanyFromHeadline(title, trigger) {
  if (!title) return '';

  // Decode HTML entities first (e.g., &amp; → &)
  let cleaned = decodeHtmlEntities(title);

  // Clean up common prefixes
  cleaned = cleaned.replace(/^(UPDATE \d+ ?-|BRIEF-|CORRECTED-)/i, '').trim();

  // Pattern: "X acquires Y" / "X to acquire Y" / "X buys Y"
  const acquireMatch = cleaned.match(/^(.+?)\s+(acquires?|to acquire|buys?|purchases?|merges? with)\s+/i);
  if (acquireMatch && trigger === 'ma_acquisition') {
    const candidate = cleanCompanyName(acquireMatch[1]);
    if (candidate && !isBadCandidate(candidate)) return candidate;
  }

  // Pattern: "Y acquired by X" / "Y purchased by X"
  const acquiredByMatch = cleaned.match(/^(.+?)\s+(acquired by|purchased by|bought by)\s+(.+?)[\s,.\-]/i);
  if (acquiredByMatch && trigger === 'ma_acquisition') {
    const candidate = cleanCompanyName(acquiredByMatch[1]);
    if (candidate && !isBadCandidate(candidate)) return candidate;
  }

  // Pattern: "X announces|opens|breaks ground|expands|relocates|establishes"
  const actionMatch = cleaned.match(/^(.+?)\s+(announces?|opens?|breaks ground|expands?|relocat|is relocating|moves?|signs? lease|to build|to open|plans?|unveils?|launches?|establishes?|completes?|is building)/i);
  if (actionMatch) {
    const candidate = cleanCompanyName(actionMatch[1]);
    if (candidate && !isBadCandidate(candidate)) return candidate;
  }

  // Pattern: "New facility for X" / "Expansion at X"
  const forMatch = cleaned.match(/(new facility|expansion|new headquarters|new office|new plant|new warehouse)\s+(for|at|by)\s+(.+?)[\s,.\-]/i);
  if (forMatch) {
    const candidate = cleanCompanyName(forMatch[3]);
    if (candidate && !isBadCandidate(candidate)) return candidate;
  }

  // Fallback: take text before first dash, pipe, or colon
  const fallback = cleaned.split(/\s*[-|:]\s*/)[0].trim();
  if (fallback && fallback.length < 60 && fallback.length > 2) {
    if (isBadCandidate(fallback)) return '';
    const candidate = cleanCompanyName(fallback);
    if (candidate && !isBadCandidate(candidate)) return candidate;
  }

  return '';
}

function cleanCompanyName(name) {
  if (!name) return '';
  // Decode HTML entities (in case caller forgot)
  let cleaned = decodeHtmlEntities(name).trim();
  // Strip Inc, LLC, Corp, Ltd, etc.
  cleaned = cleaned.replace(/\b(Inc\.?|LLC|Corp\.?|Ltd\.?|Co\.?|Group|Holdings|PLC|S\.A\.?|N\.V\.?|AG)\b\.?\s*$/i, '').trim();
  // Strip trailing commas/periods
  cleaned = cleaned.replace(/[,.\s]+$/, '').trim();
  // Skip news outlets, TV stations, generic names
  const skipNames = new Set(['AP', 'Reuters', 'Bloomberg', 'CNBC', 'CNN', 'Fox', 'NBC', 'CBS', 'ABC', 'NPR', 'BBC', 'Forbes']);
  if (skipNames.has(cleaned.toUpperCase())) return '';
  if (/^[A-Z]{3,5}(-TV|-FM|-AM)$/i.test(cleaned)) return '';
  if (cleaned.length < 2 || cleaned.length > 80) return '';
  // Final stop-phrase check
  if (isBadCandidate(cleaned)) return '';
  return cleaned;
}

// ── RSS Parser ───────────────────────────────────────────────────────────────

function parseRssXml(xml) {
  const items = [];
  // Simple regex-based RSS parser — handles standard RSS 2.0 items
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
    };

    items.push({
      title: stripHtml(getTag('title')),
      description: stripHtml(getTag('description')),
      link: getTag('link'),
      pubDate: getTag('pubDate'),
    });
  }

  return items;
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Scan all RSS news sources and return raw articles matching trigger criteria.
 */
export async function scanNewsSources() {
  const allArticles = [];
  const errors = [];

  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        errors.push(`${source.name} (${source.trigger}): HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const items = parseRssXml(xml);

      for (const item of items) {
        const age = parseAge(item.pubDate);
        if (age > LOOKBACK_DAYS) continue;
        if (!isRelevant(item.title, item.description, source)) continue;

        allArticles.push({
          title: item.title,
          description: (item.description || '').slice(0, 400),
          url: item.link,
          age,
          sourceName: source.name,
          trigger: source.trigger,
          vertical: source.vertical || null,
        });
      }

      // Small delay between feeds
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors.push(`${source.name} (${source.trigger}): ${err.message}`);
    }
  }

  // Deduplicate by headline prefix
  const seenTitles = new Set();
  const unique = [];
  for (const a of allArticles) {
    const key = a.title.slice(0, 50).toLowerCase().trim();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      unique.push(a);
    }
  }

  // Sort by recency
  unique.sort((a, b) => a.age - b.age);

  return { articles: unique, errors };
}

/**
 * Enrich a company with Apollo — find IT/ops decision makers.
 * Returns enriched contact info or null.
 */
export async function enrichWithApollo(companyName) {
  // Apollo API key from .env
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    // Search for decision makers at this company (new Apollo api_search endpoint)
    const searchRes = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        person_titles: TARGET_TITLES,
        organization_num_employees_ranges: ['21,100', '101,500', '501,1000', '1001,5000'],
        per_page: 5,
        page: 1,
      }),
    });

    if (!searchRes.ok) {
      const errTxt = await searchRes.text();
      console.log(`[Signal Intel] Apollo search failed for ${companyName}: ${searchRes.status} ${errTxt.substring(0,200)}`);
      return null;
    }
    const searchData = await searchRes.json();
    const people = searchData.people || [];

    if (people.length === 0) return null;

    // Find first person with email, or best candidate
    let bestPerson = people.find(p => p.email) || people[0];

    // If no email exposed, try to enrich by ID
    if (!bestPerson.email && bestPerson.id) {
      const enrichRes = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ id: bestPerson.id }),
      });

      if (enrichRes.ok) {
        const enrichData = await enrichRes.json();
        if (enrichData.person) {
          bestPerson = { ...bestPerson, ...enrichData.person };
        }
      }
    }

    const org = bestPerson.organization || {};
    const empCount = org.estimated_num_employees || 0;
    let companySize = '';
    if (empCount < 20) companySize = 'Small (<20)';
    else if (empCount < 100) companySize = 'SMB (20-100)';
    else if (empCount < 500) companySize = 'Mid-Market (100-500)';
    else companySize = 'Enterprise (500+)';

    // Parse name from full name if first/last not present
    const fullName = bestPerson.name || '';
    const nameParts = fullName.split(/\s+/);
    const firstName = bestPerson.first_name || nameParts[0] || '';
    const lastName = bestPerson.last_name || nameParts.slice(1).join(' ') || '';

    return {
      name: fullName || `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      title: bestPerson.title || '',
      email: bestPerson.email || '',
      phone: bestPerson.phone_numbers?.[0]?.sanitized_number || '',
      linkedinUrl: bestPerson.linkedin_url || '',
      apolloId: bestPerson.id || '',
      company: org.name || companyName,
      city: bestPerson.city || '',
      state: bestPerson.state || '',
      industry: org.industry || '',
      companySize,
      employeeCount: empCount ? empCount.toString() : '',
      revenue: org.estimated_annual_revenue
        ? `$${(org.estimated_annual_revenue / 1000000).toFixed(0)}M`
        : '',
    };
  } catch (err) {
    console.error(`Apollo enrichment error for ${companyName}:`, err.message);
    return null;
  }
}

/**
 * Score a lead 0-100 based on contact seniority, company size, trigger type, recency, etc.
 * Returns { score, factors }.
 */
export function scoreLead(contact, triggerType, age = 0) {
  let score = 50;
  const factors = [];

  // Title seniority
  const title = (contact?.title || '').toLowerCase();
  if (['vp', 'vice president', 'cto', 'coo', 'ceo', 'chief'].some(t => title.includes(t))) {
    score += 18;
    factors.push({ label: 'Senior Title', score: 95 });
  } else if (['director', 'head of'].some(t => title.includes(t))) {
    score += 12;
    factors.push({ label: 'Director Title', score: 82 });
  } else if (title.includes('manager')) {
    score += 6;
    factors.push({ label: 'Manager Title', score: 68 });
  } else {
    factors.push({ label: 'Title Match', score: 60 });
  }

  // Company size - mid-market is sweet spot
  const size = contact?.companySize || '';
  if (size.includes('Mid-Market')) {
    score += 10;
    factors.push({ label: 'Company Size Fit', score: 90 });
  } else if (size.includes('SMB')) {
    score += 6;
    factors.push({ label: 'Company Size Fit', score: 72 });
  } else if (size.includes('Enterprise')) {
    score += 4;
    factors.push({ label: 'Company Size Fit', score: 65 });
  } else {
    factors.push({ label: 'Company Size Fit', score: 55 });
  }

  // Email confirmed
  if (contact?.email) {
    score += 8;
    factors.push({ label: 'Email Confirmed', score: 95 });
  } else {
    score -= 10;
    factors.push({ label: 'Email Confirmed', score: 20 });
  }

  // LinkedIn present
  if (contact?.linkedinUrl) {
    score += 4;
    factors.push({ label: 'LinkedIn Present', score: 85 });
  }

  // Trigger recency
  const recencyMap = { 0: 12, 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3 };
  const recency = recencyMap[age] ?? 2;
  score += recency;
  factors.push({ label: 'Trigger Recency', score: Math.min(100, 60 + recency * 3) });

  // Trigger type urgency boost
  const triggerBoost = {
    ma_acquisition: 10,
    relocation: 9,
    leadership_change: 8,
    new_facility: 8,
  };
  const boost = triggerBoost[triggerType] || 5;
  score += boost;
  factors.push({ label: 'Trigger Signal', score: Math.min(95, 60 + boost * 3) });

  return { score: Math.min(100, Math.max(0, score)), factors };
}

/**
 * Map trigger display text to DB enum value.
 */
function normalizeTrigger(trigger) {
  const map = {
    'M&A / Acquisition': 'ma_acquisition',
    'ma_acquisition': 'ma_acquisition',
    'New Facility / Expansion': 'new_facility',
    'new_facility': 'new_facility',
    'Building Permit / New Construction': 'new_facility',
    'Business Relocation': 'relocation',
    'relocation': 'relocation',
    'Leadership Change': 'leadership_change',
    'leadership_change': 'leadership_change',
  };
  return map[trigger] || 'new_facility';
}

/**
 * Run a full scan: fetch news -> extract companies -> enrich via Apollo -> score -> store.
 * Returns summary stats.
 */
export async function runFullScan({ limit = 50 } = {}) {
  console.log('[Signal Intel] Starting full scan...');

  // Step 1: Scan news sources
  const { articles, errors } = await scanNewsSources();
  console.log(`[Signal Intel] Found ${articles.length} articles from news sources`);
  if (errors.length > 0) {
    console.log(`[Signal Intel] Source errors: ${errors.join('; ')}`);
  }

  // Step 2: Get existing prospect emails for dedup
  const [existingProspects] = await pool.query('SELECT email FROM prospects WHERE email IS NOT NULL');
  const existingEmails = new Set(existingProspects.map(p => p.email?.toLowerCase()));

  // Get existing signal intel emails for dedup
  const [existingLeads] = await pool.query('SELECT contact_email FROM signal_intel_leads WHERE contact_email IS NOT NULL');
  const existingLeadEmails = new Set(existingLeads.map(l => l.contact_email?.toLowerCase()));

  // Get existing signal intel companies for dedup (normalized keys)
  const [existingCompanies] = await pool.query('SELECT company FROM signal_intel_leads WHERE status != "dismissed"');
  const existingCompanySet = new Set(existingCompanies.map(c => normalizeCompanyKey(c.company || '')).filter(Boolean));

  const seenCompanies = new Set();
  let leadsCreated = 0;
  let enriched = 0;
  let skippedDupe = 0;

  // Step 3: Process articles
  for (const article of articles) {
    if (leadsCreated >= limit) break;

    // Extract company name from headline
    const companyName = extractCompanyFromHeadline(article.title, article.trigger);
    if (!companyName) continue;

    // Dedup by normalized company name
    const companyKey = normalizeCompanyKey(companyName);
    if (!companyKey) continue;
    if (seenCompanies.has(companyKey) || existingCompanySet.has(companyKey)) {
      skippedDupe++;
      continue;
    }
    seenCompanies.add(companyKey);

    const triggerType = normalizeTrigger(article.trigger);

    // Step 4: Enrich with Apollo
    const contact = await enrichWithApollo(companyName);

    if (contact) {
      // EXCLUDE government and education
      const companyLower = (contact.company || companyName || '').toLowerCase();
      const industryLower = (contact.industry || '').toLowerCase();
      if (EXCLUDE_ORG_KEYWORDS.some(kw => companyLower.includes(kw) || industryLower.includes(kw))) {
        console.log(`[Signal Intel] Skipping gov/edu: ${contact.company}`);
        continue;
      }

      // US-ONLY FILTER: Skip any non-US contacts
      const US_STATES = new Set([
        'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia',
        'Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland',
        'Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
        'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
        'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming',
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
        'District of Columbia',
      ]);
      if (contact.state && !US_STATES.has(contact.state)) {
        console.log(`[Signal Intel] Skipping non-US: ${contact.company} (${contact.state})`);
        continue;
      }

      // Dedup against prospects and existing leads
      if (contact.email) {
        const emailLower = contact.email.toLowerCase();
        if (existingEmails.has(emailLower) || existingLeadEmails.has(emailLower)) {
          skippedDupe++;
          continue;
        }
        existingLeadEmails.add(emailLower);
      }

      const { score, factors } = scoreLead(contact, triggerType, article.age);
      enriched++;

      await pool.execute(
        `INSERT INTO signal_intel_leads
         (company, city, state, industry, vertical, trigger_type, trigger_detail, trigger_headline, trigger_source, trigger_url, trigger_date, score, score_factors, contact_name, contact_title, contact_email, contact_phone, contact_linkedin, apollo_id, employee_count, revenue, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contact.company || companyName,
          contact.city || null,
          contact.state || null,
          contact.industry || null,
          article.vertical || null,
          triggerType,
          article.description || null,
          article.title || null,
          article.sourceName || null,
          article.url || null,
          new Date(),
          score,
          JSON.stringify(factors),
          contact.name || null,
          contact.title || null,
          contact.email || null,
          contact.phone || null,
          contact.linkedinUrl || null,
          contact.apolloId || null,
          contact.employeeCount || null,
          contact.revenue || null,
          `${article.sourceName} - Signal Intel`,
        ]
      );
    } else {
      // No Apollo contact — apply headline-based foreign filter before insert.
      // We still allow inserts when the headline is geographically neutral
      // (many legit US SMB leads return no Apollo match), but we drop anything
      // that explicitly references a foreign locale without US counter-signals.
      if (looksForeign(article.title + ' ' + (article.description || ''))) {
        console.log(`[Signal Intel] Skipping non-US (no Apollo): ${companyName}`);
        continue;
      }

      // Store without enrichment — still valuable as a trigger signal
      const { score, factors } = scoreLead(null, triggerType, article.age);

      await pool.execute(
        `INSERT INTO signal_intel_leads
         (company, vertical, trigger_type, trigger_detail, trigger_headline, trigger_source, trigger_url, trigger_date, score, score_factors, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyName,
          article.vertical || null,
          triggerType,
          article.description || null,
          article.title || null,
          article.sourceName || null,
          article.url || null,
          new Date(),
          score,
          JSON.stringify(factors),
          `${article.sourceName} - Signal Intel`,
        ]
      );
    }

    leadsCreated++;

    // Rate limit Apollo calls
    await new Promise(r => setTimeout(r, 1000));
  }

  const summary = {
    articlesFound: articles.length,
    leadsCreated,
    enriched,
    skippedDupe,
    errors: errors.length,
    scannedAt: new Date().toISOString(),
  };

  console.log(`[Signal Intel] Scan complete:`, summary);
  return summary;
}

// ── Weekly auto-staging ──────────────────────────────────────────────────────

// Which partner cadence each vertical belongs to. Lanes are kept separate so two
// reps never work the same account: property/CRE is Jared's, the operational
// multi-site verticals are Ed's. Chad's MN gov/ed/childcare lane is deliberately
// absent — these feeds don't source it, and gov/edu is filtered out upstream.
const VERTICAL_TO_PARTNER_SEQUENCE = {
  property_mgmt: 1,   // Megan + Jared
  healthcare: 2,      // Lauren + Ed
  senior_living: 2,
  hospitality: 2,
  restaurant: 2,
};

const AUTO_STAGE_MIN_SCORE = 85;

/**
 * Stage high-scoring signal-intel leads into their partner cadence as PAUSED
 * step-1 enrollments. Nothing sends until a human releases them.
 */
export async function autoStageQualifiedLeads({ minScore = AUTO_STAGE_MIN_SCORE, limit = 40, dryRun = false } = {}) {
  const [leads] = await pool.query(
    `SELECT * FROM signal_intel_leads
     WHERE status = 'new'
       AND score >= ?
       AND contact_email IS NOT NULL AND contact_email != ''
       AND vertical IS NOT NULL
     ORDER BY score DESC, created_at DESC
     LIMIT ?`,
    [minScore, limit]
  );

  const staged = [];
  const skipped = [];

  for (const lead of leads) {
    const sequenceId = VERTICAL_TO_PARTNER_SEQUENCE[lead.vertical];
    if (!sequenceId) {
      skipped.push({ id: lead.id, company: lead.company, reason: `no partner lane for vertical ${lead.vertical}` });
      continue;
    }

    const [[seq]] = await pool.query(
      "SELECT id, agent_id, partner_agent_id FROM partner_sequences WHERE id = ? AND status = 'active'",
      [sequenceId]
    );
    if (!seq) {
      skipped.push({ id: lead.id, company: lead.company, reason: `sequence ${sequenceId} not active` });
      continue;
    }

    const emailLower = lead.contact_email.toLowerCase();
    const [[existing]] = await pool.query('SELECT id, status FROM prospects WHERE LOWER(email) = ?', [emailLower]);

    // Never re-touch someone already suppressed or already being worked.
    if (existing) {
      const dead = ['disqualified', 'unsubscribed', 'bounced', 'booked', 'handed_off', 'replied', 'engaged'];
      if (dead.includes(existing.status)) {
        skipped.push({ id: lead.id, company: lead.company, reason: `prospect status ${existing.status}` });
        continue;
      }
      const [[partnerEnr]] = await pool.query(
        'SELECT id FROM partner_enrollments WHERE prospect_id = ? AND status != "cancelled"',
        [existing.id]
      );
      // A prospect in both a drip and a partner cadence gets two near-identical
      // intros (the 2026-07 dual-track incident), so a live drip blocks staging.
      const [[dripEnr]] = await pool.query(
        'SELECT id FROM prospect_sequence_enrollment WHERE prospect_id = ? AND status = "active"',
        [existing.id]
      );
      if (partnerEnr || dripEnr) {
        skipped.push({ id: lead.id, company: lead.company, reason: partnerEnr ? 'already in a partner cadence' : 'active drip enrollment' });
        continue;
      }
    }

    if (dryRun) {
      staged.push({ id: lead.id, company: lead.company, score: lead.score, vertical: lead.vertical, sequenceId });
      continue;
    }

    let prospectId = existing?.id;
    if (!prospectId) {
      const nameParts = (lead.contact_name || '').split(' ');
      const triggerNote = `SIGNAL INTEL -- Trigger: ${lead.trigger_type} | ${(lead.trigger_headline || '').slice(0, 150)} | Source: ${lead.trigger_source || ''} | Score: ${lead.score}`;
      const [result] = await pool.execute(
        `INSERT INTO prospects (first_name, last_name, email, company, title, phone, linkedin_url, company_size, industry, city, state, apollo_id, source, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_sequence')`,
        [
          nameParts[0] || '', nameParts.slice(1).join(' ') || '',
          lead.contact_email, lead.company || null, lead.contact_title || null,
          lead.contact_phone || null, lead.contact_linkedin || null,
          lead.employee_count || null, lead.industry || null,
          lead.city || null, lead.state || null, lead.apollo_id || null,
          `signal-intel-partner: ${triggerNote}`,
        ]
      );
      prospectId = result.insertId;
    }

    await pool.execute(
      `INSERT INTO partner_enrollments (prospect_id, sequence_id, agent_id, partner_agent_id, status, current_step)
       VALUES (?, ?, ?, ?, 'paused', 1)`,
      [prospectId, seq.id, seq.agent_id, seq.partner_agent_id]
    );
    await pool.execute(
      "UPDATE signal_intel_leads SET status = 'enrolled', enrolled_prospect_id = ? WHERE id = ?",
      [prospectId, lead.id]
    );

    staged.push({ id: lead.id, company: lead.company, score: lead.score, vertical: lead.vertical, sequenceId, prospectId });
  }

  return { staged, skipped, stagedCount: staged.length, skippedCount: skipped.length, dryRun };
}
