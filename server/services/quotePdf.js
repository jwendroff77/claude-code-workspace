import PDFDocument from 'pdfkit';

// Renders a multi-carrier pricing summary as a landscape PDF.
//
// quote = {
//   customer, address, opportunityId, notes, showComparison,
//   carriers: [{ name, items: [{ included, location, type, product, description,
//                               bandwidth, qty, term, mrc, nrc }] }]
// }
// Only items with included === true are rendered; carriers with none are skipped.

const BLUE = '#1F5FE0';
const NAVY = '#0B1F44';
const INK = '#1F2433';
const MUTED = '#6B7280';
const RULE = '#D9DEE8';
const ZEBRA = '#F5F7FB';
const BEST = '#E7F6EE';
const BEST_INK = '#0F7A43';

const MARGIN = 36;
const FOOTER_H = 40;

const DISCLAIMER =
  "The information contained in this document is provided on an 'as is' basis, with no guarantees of " +
  'completeness, accuracy, usefulness or timeliness. Pricing is valid as of the date of this document and ' +
  'may change based on supplier practice and/or unforeseen circumstance.';

const DETAIL_COLUMNS = [
  { key: 'location', label: 'Service Location', width: 130 },
  { key: 'type', label: 'Type', width: 80 },
  { key: 'product', label: 'Product', width: 160 },
  { key: 'description', label: 'Description', width: 230 },
  { key: 'bandwidth', label: 'Bandwidth', width: 70 },
  { key: 'qty', label: 'Qty', width: 32, align: 'center' },
  { key: 'term', label: 'Term', width: 46, align: 'center' },
  { key: 'mrc', label: 'MRC', width: 62, align: 'right', money: true },
  { key: 'nrc', label: 'NRC', width: 62, align: 'right', money: true },
];

function money(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function termLabel(term) {
  const t = String(term || '').trim();
  return /^\d+$/.test(t) ? `${t} mo` : t;
}

// "Up to 1.25G", "600M/300M", "2G/300M" -> download speed in Mbps, for sorting.
function bandwidthMbps(bw) {
  const m = String(bw || '').match(/([\d.]+)\s*([GMK])/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  return unit === 'G' ? n * 1000 : unit === 'K' ? n / 1000 : n;
}

function selectedCarriers(quote) {
  return (quote.carriers || [])
    .map((c) => ({
      ...c,
      items: (c.items || [])
        .filter((i) => i.included)
        .map((i) => ({ ...i, location: String(i.location || '').trim() || quote.address || '' })),
    }))
    .filter((c) => c.items.length);
}

export function countSelected(quote) {
  return selectedCarriers(quote).reduce((n, c) => n + c.items.length, 0);
}

export function renderQuotePdf(quote) {
  const carriers = selectedCarriers(quote);
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + FOOTER_H },
    bufferPages: true,
    info: {
      Title: `Pricing Summary - ${quote.customer || 'Customer'}`,
      Author: '1Cloud Communications',
    },
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - FOOTER_H;

  drawHeader(doc, quote, left, width);
  if (quote.showComparison !== false && carriers.length) {
    drawComparison(doc, carriers, left, width, bottom);
  }
  for (const carrier of carriers) {
    drawCarrierTable(doc, carrier, left, width, bottom);
  }

  drawFooters(doc, quote, left, width);
  doc.end();
  return done;
}

function drawHeader(doc, quote, left, width) {
  const top = MARGIN;
  doc.rect(left, top, width, 46).fill(BLUE);
  doc.rect(left + width * 0.62, top, width * 0.38, 46).fill(NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('1Cloud Communications', left + 16, top + 14);
  doc
    .font('Helvetica')
    .fontSize(11)
    .text('Multi-Carrier Pricing Summary', left, top + 18, { width: width - 16, align: 'right' });

  let y = top + 62;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(quote.customer || 'Customer', left, y);
  y = doc.y + 2;
  const details = [
    quote.address,
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  ].filter(Boolean);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(details.join('   |   '), left, y);
  if (quote.notes) {
    doc.moveDown(0.6).fillColor(INK).fontSize(10).text(quote.notes, left, doc.y, { width });
  }
  doc.y += 14;
}

function sectionTitle(doc, title, left, bottom) {
  if (doc.y + 60 > bottom()) doc.addPage();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(title, left, doc.y);
  doc.y += 4;
}

// One row per carrier/type/bandwidth, one column per term, cheapest MRC in each
// column of a bandwidth group highlighted.
function drawComparison(doc, carriers, left, width, bottom) {
  const terms = [...new Set(carriers.flatMap((c) => c.items.map((i) => String(i.term).trim())))]
    .filter(Boolean)
    .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  if (!terms.length) return;

  const rows = new Map();
  for (const c of carriers) {
    for (const i of c.items) {
      const key = [c.name, i.type, i.bandwidth].join('|');
      if (!rows.has(key)) {
        rows.set(key, { carrier: c.name, type: i.type, bandwidth: i.bandwidth, byTerm: {} });
      }
      const row = rows.get(key);
      const t = String(i.term).trim();
      if (!row.byTerm[t] || i.mrc < row.byTerm[t].mrc) row.byTerm[t] = { mrc: i.mrc, nrc: i.nrc };
    }
  }
  const list = [...rows.values()].sort(
    (a, b) => bandwidthMbps(a.bandwidth) - bandwidthMbps(b.bandwidth) || a.carrier.localeCompare(b.carrier)
  );

  // Lowest MRC per term among rows with the same download speed.
  const best = new Map();
  for (const r of list) {
    for (const t of terms) {
      const v = r.byTerm[t];
      if (!v) continue;
      const k = bandwidthMbps(r.bandwidth) + '|' + t;
      if (!best.has(k) || v.mrc < best.get(k)) best.set(k, v.mrc);
    }
  }
  const competing = new Map();
  for (const r of list) {
    const k = bandwidthMbps(r.bandwidth);
    competing.set(k, (competing.get(k) || 0) + 1);
  }

  sectionTitle(doc, 'At a Glance', left, bottom);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      'Monthly recurring cost by term. Where more than one carrier offers the same speed, the lowest price is highlighted.',
      left,
      doc.y
    );
  doc.y += 6;

  const fixed = [
    { label: 'Carrier', width: 170 },
    { label: 'Type', width: 150 },
    { label: 'Bandwidth', width: 110 },
  ];
  const termWidth = (width - fixed.reduce((s, c) => s + c.width, 0)) / terms.length;
  const cols = [
    ...fixed,
    ...terms.map((t) => ({ label: termLabel(t), width: termWidth, align: 'right' })),
  ];

  const drawHead = () => tableHeader(doc, cols, left, width);
  drawHead();

  list.forEach((r, idx) => {
    const h = 20;
    if (doc.y + h > bottom()) {
      doc.addPage();
      drawHead();
    }
    const y = doc.y;
    if (idx % 2) doc.rect(left, y, width, h).fill(ZEBRA);
    let x = left;
    const cells = [r.carrier, r.type, r.bandwidth];
    cells.forEach((text, i) => {
      doc
        .fillColor(INK)
        .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(text || '', x + 6, y + 6, { width: cols[i].width - 12, lineBreak: false, ellipsis: true });
      x += cols[i].width;
    });
    terms.forEach((t) => {
      const v = r.byTerm[t];
      const isBest =
        v && competing.get(bandwidthMbps(r.bandwidth)) > 1 && v.mrc === best.get(bandwidthMbps(r.bandwidth) + '|' + t);
      if (isBest) doc.rect(x + 2, y + 2, termWidth - 4, h - 4).fill(BEST);
      doc
        .fillColor(v ? (isBest ? BEST_INK : INK) : MUTED)
        .font(isBest ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(v ? money(v.mrc) : '—', x + 6, y + 6, { width: termWidth - 12, align: 'right', lineBreak: false });
      x += termWidth;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.y = y + h;
  });
  doc.y += 18;
}

function tableHeader(doc, cols, left, width) {
  const y = doc.y;
  const h = 20;
  doc.rect(left, y, width, h).fill(NAVY);
  let x = left;
  for (const c of cols) {
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(c.label, x + 6, y + 6, { width: c.width - 12, align: c.align || 'left', lineBreak: false });
    x += c.width;
  }
  doc.y = y + h;
}

function drawCarrierTable(doc, carrier, left, width, bottom) {
  const items = [...carrier.items].sort(
    (a, b) =>
      bandwidthMbps(a.bandwidth) - bandwidthMbps(b.bandwidth) || (parseFloat(a.term) || 0) - (parseFloat(b.term) || 0)
  );

  // A location shared by every row moves under the carrier name; an all-blank Qty is dropped.
  const locations = new Set(items.map((i) => String(i.location || '').trim()));
  const sharedLocation = locations.size === 1 ? [...locations][0] : '';
  const hasQty = items.some((i) => String(i.qty || '').trim());
  const base = DETAIL_COLUMNS.filter(
    (c) => !(c.key === 'location' && locations.size === 1) && !(c.key === 'qty' && !hasQty)
  );
  const scale = width / base.reduce((s, c) => s + c.width, 0);
  const cols = base.map((c) => ({ ...c, width: c.width * scale }));

  doc.font('Helvetica').fontSize(8.5);
  const rows = items.map((item) => {
    const texts = cols.map((c) => {
      if (c.money) return money(item[c.key]);
      if (c.key === 'term') return termLabel(item.term);
      return String(item[c.key] ?? '');
    });
    const h = Math.max(...texts.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i].width - 12 }))) + 12;
    return { texts, h };
  });

  const titleH = sharedLocation ? 40 : 26;
  const drawTitle = (cont) => {
    const y = doc.y;
    doc.rect(left, y, 4, 18).fill(BLUE);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(carrier.name + (cont ? ' (continued)' : ''), left + 12, y + 3, { lineBreak: false });
    if (sharedLocation) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(sharedLocation, left + 12, y + 22, { lineBreak: false });
    }
    doc.y = y + titleH;
    tableHeader(doc, cols, left, width);
  };

  // Start on a fresh page if the table would otherwise split but fits on one page,
  // or if not even the first two rows fit here.
  const pageTop = MARGIN;
  const total = titleH + 20 + rows.reduce((s, r) => s + r.h, 0);
  const firstRows = titleH + 20 + rows.slice(0, 2).reduce((s, r) => s + r.h, 0);
  const remaining = bottom() - doc.y;
  if (doc.y > pageTop + 1 && ((total > remaining && total <= bottom() - pageTop) || firstRows > remaining)) {
    doc.addPage();
  }
  drawTitle(false);

  rows.forEach(({ texts, h }, idx) => {
    if (doc.y + h > bottom()) {
      doc.addPage();
      drawTitle(true);
    }
    const y = doc.y;
    if (idx % 2) doc.rect(left, y, width, h).fill(ZEBRA);
    let x = left;
    texts.forEach((t, i) => {
      doc
        .fillColor(INK)
        .font(cols[i].key === 'mrc' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8.5)
        .text(t, x + 6, y + 6, { width: cols[i].width - 12, align: cols[i].align || 'left' });
      x += cols[i].width;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.y = y + h;
  });
  doc.y += 20;
}

function drawFooters(doc, quote, left, width) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise trigger an automatic page break.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN - FOOTER_H + 10;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(DISCLAIMER, left, y + 6, { width: width - 150 });
    const right = [quote.opportunityId ? `Opportunity ID: ${quote.opportunityId}` : '', `Page ${i - range.start + 1} of ${range.count}`]
      .filter(Boolean)
      .join('\n');
    doc.fontSize(7.5).text(right, left + width - 140, y + 6, { width: 140, align: 'right' });
    doc.page.margins.bottom = savedBottom;
  }
}
