import express, { Router } from 'express';
import pool from '../db/connection.js';
import { parseTelarusDocx } from '../services/quoteParser.js';
import { renderQuotePdf, countSelected } from '../services/quotePdf.js';
import { sendMail } from '../services/graph.js';

const router = Router();

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

function splitEmails(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/);
  return list.map((e) => String(e).trim()).filter(Boolean);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pdfFilename(quote) {
  const customer = String(quote.customer || 'Customer').replace(/[^\w .-]+/g, '').trim() || 'Customer';
  const date = new Date().toISOString().slice(0, 10);
  return `Pricing Summary - ${customer} - ${date}.pdf`;
}

// Mailboxes a quote can be sent from: QUOTE_FROM_EMAIL (default) plus the sending agents.
async function getSenders() {
  const [rows] = await pool.query(
    "SELECT name, email FROM agents WHERE role <> 'manual' AND email IS NOT NULL AND email <> '' ORDER BY name"
  );
  const senders = rows.map((r) => ({ email: r.email, name: r.name }));
  const fallback = (process.env.QUOTE_FROM_EMAIL || '').trim();
  if (fallback) {
    const rest = senders.filter((s) => s.email.toLowerCase() !== fallback.toLowerCase());
    return [{ email: fallback, name: 'Default' }, ...rest];
  }
  return senders;
}

function validateQuote(quote) {
  if (!quote || !Array.isArray(quote.carriers)) return 'Quote is missing';
  if (!countSelected(quote)) return 'Select at least one option to include';
  return null;
}

// POST /parse - raw .docx body (Telarus quote export) -> quote JSON
router.post(
  '/parse',
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res) => {
    try {
      if (!req.body?.length) return res.status(400).json({ error: 'No file received' });
      const quote = await parseTelarusDocx(req.body);
      if (!quote.carriers.length) {
        return res.status(422).json({ error: 'No carrier pricing tables found in that document' });
      }
      res.json(quote);
    } catch (err) {
      res.status(422).json({ error: err.message });
    }
  }
);

// POST /pdf?download=1 - quote JSON -> PDF (inline for preview unless download=1)
router.post('/pdf', async (req, res) => {
  try {
    const { quote } = req.body;
    const invalid = validateQuote(quote);
    if (invalid) return res.status(400).json({ error: invalid });

    const pdf = await renderQuotePdf(quote);
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${pdfFilename(quote)}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /senders - mailboxes the Email Quote dialog can send from
router.get('/senders', async (req, res) => {
  try {
    res.json(await getSenders());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /email - render the PDF and send it as an attachment via Microsoft Graph
router.post('/email', async (req, res) => {
  try {
    const { quote, from, to, cc, subject, message } = req.body;
    const invalid = validateQuote(quote);
    if (invalid) return res.status(400).json({ error: invalid });

    const toList = splitEmails(to);
    const ccList = splitEmails(cc);
    if (!toList.length) return res.status(400).json({ error: 'Enter at least one recipient' });
    const bad = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e));
    if (bad.length) return res.status(400).json({ error: `Invalid email address: ${bad.join(', ')}` });

    const senders = await getSenders();
    const sender = senders.find((s) => s.email.toLowerCase() === String(from || '').toLowerCase());
    if (!sender) return res.status(400).json({ error: 'Choose a mailbox to send from' });

    const pdf = await renderQuotePdf(quote);
    const html = escapeHtml(message || '')
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`)
      .join('');

    await sendMail({
      fromEmail: sender.email,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      subject: subject || `Pricing Summary - ${quote.customer || ''}`.trim(),
      html: html || '<p>Please see the attached pricing summary.</p>',
      attachments: [{ name: pdfFilename(quote), contentType: 'application/pdf', content: pdf }],
    });

    res.json({ ok: true, from: sender.email, to: toList, cc: ccList });
  } catch (err) {
    console.error('[QUOTES] Email failed:', err.message);
    res.status(500).json({ error: `Send failed: ${err.message}` });
  }
});

export default router;
