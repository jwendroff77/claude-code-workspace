import JSZip from 'jszip';

// Parses a Telarus multi-carrier quote export (.docx) into a plain quote object.
//
// Telarus layout: a couple of heading paragraphs (customer, agency), then one table
// per carrier. Row 1 of each table is the carrier name (one merged cell), row 2 is
// the column header, and every row after that is a priced option. The footer holds
// "Opportunity ID: ...".

const COLUMN_KEYS = {
  'service location': 'location',
  type: 'type',
  product: 'product',
  description: 'description',
  bandwidth: 'bandwidth',
  qty: 'qty',
  term: 'term',
  mrc: 'mrc',
  nrc: 'nrc',
};

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Text of an XML fragment, with paragraph and line breaks kept as spaces.
function textOf(xml) {
  const withBreaks = xml.replace(/<\/w:p>|<w:br\/>|<w:tab\/>/g, ' ');
  const text = withBreaks.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|\s/g) || [];
  return decodeXml(text.map((t) => t.replace(/<[^>]+>/g, '')).join(''))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoney(s) {
  const n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

let nextId = 1;
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
}

function parseTable(tblXml) {
  const rows = tblXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  const cellRows = rows.map((r) => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(textOf));

  const headerIdx = cellRows.findIndex((cells) =>
    cells.some((c) => c.toLowerCase() === 'service location')
  );
  if (headerIdx === -1) return null;

  const name =
    cellRows
      .slice(0, headerIdx)
      .map((cells) => cells.filter(Boolean).join(' '))
      .find(Boolean) || 'Carrier';
  const keys = cellRows[headerIdx].map((h) => COLUMN_KEYS[h.toLowerCase()] || null);

  const items = [];
  for (const cells of cellRows.slice(headerIdx + 1)) {
    if (cells.every((c) => !c)) continue;
    const item = { id: newId('opt'), included: false };
    keys.forEach((key, i) => {
      if (key) item[key] = cells[i] || '';
    });
    item.mrc = parseMoney(item.mrc);
    item.nrc = parseMoney(item.nrc);
    // Telarus prefixes the type with a one-letter code, e.g. "D - Business Cable".
    item.type = String(item.type || '').replace(/^[A-Z]\s*-\s*/, '');
    item.term = String(item.term || '').trim();
    item.qty = String(item.qty || '').trim();
    items.push(item);
  }

  return { id: newId('car'), name, items };
}

export async function parseTelarusDocx(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("That doesn't look like a Word (.docx) file");
  }
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error("That doesn't look like a Word (.docx) file");
  const doc = await docFile.async('string');

  const bodyStart = doc.indexOf('<w:body>');
  const body = bodyStart === -1 ? doc : doc.slice(bodyStart);

  // Heading paragraphs are the ones before the first table.
  const firstTbl = body.indexOf('<w:tbl>');
  const preamble = firstTbl === -1 ? body : body.slice(0, firstTbl);
  const headings = (preamble.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(textOf).filter(Boolean);

  const carriers = (body.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [])
    .map(parseTable)
    .filter((c) => c && c.items.length);

  let opportunityId = '';
  for (const path of Object.keys(zip.files).filter((p) => /^word\/(footer|header)\d*\.xml$/.test(p))) {
    const m = textOf(await zip.file(path).async('string')).match(/Opportunity ID:\s*(\S+)/i);
    if (m) {
      opportunityId = m[1];
      break;
    }
  }

  const location = carriers.flatMap((c) => c.items).find((i) => i.location)?.location || '';

  return {
    customer: headings[0] || '',
    address: location,
    opportunityId,
    carriers,
  };
}
