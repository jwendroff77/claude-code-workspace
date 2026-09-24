import { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FilePlus2,
  Eye,
  Download,
  Mail,
  Plus,
  Copy,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import Button from '../components/shared/Button';

let idCounter = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

const blankItem = (overrides = {}) => ({
  id: uid('opt'),
  included: true,
  location: '',
  type: '',
  product: '',
  description: '',
  bandwidth: '',
  qty: '',
  term: '36',
  mrc: 0,
  nrc: 0,
  ...overrides,
});

const blankCarrier = () => ({ id: uid('car'), name: '', items: [blankItem()] });

const blankQuote = () => ({
  customer: '',
  address: '',
  opportunityId: '',
  notes: '',
  showComparison: true,
  carriers: [blankCarrier()],
});

const inputCls =
  'w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary transition-colors placeholder:text-txt-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

// Table cells look like plain text until hovered or focused.
const cellCls =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-txt-primary placeholder:text-txt-tertiary hover:border-border focus:border-accent focus:bg-bg-tertiary focus:outline-none';

const money = (n) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pdfFilename(quote) {
  const customer = (quote.customer || 'Customer').replace(/[^\w .-]+/g, '').trim() || 'Customer';
  return `Pricing Summary - ${customer} - ${new Date().toISOString().slice(0, 10)}.pdf`;
}

function Checkbox({ checked, indeterminate, onChange, title }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      title={title}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-border bg-bg-tertiary accent-[#00C8E8]"
    />
  );
}

function Field({ label, children, className }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-txt-tertiary">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={clsx(
          'flex max-h-full w-full flex-col rounded-xl border border-border bg-bg-secondary shadow-2xl',
          wide ? 'h-[92vh] max-w-6xl' : 'max-w-xl'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-base font-semibold text-txt-primary">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StartPanel({ onFile, onBlank, loading, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-6">
      <div>
        <h2 className="font-display text-xl font-bold text-txt-primary">Build a pricing summary</h2>
        <p className="mt-1 text-sm text-txt-secondary">
          Upload a Telarus quote to pull in every carrier and option, then choose which ones to send.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !loading && inputRef.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-border bg-bg-secondary hover:border-accent/50'
        )}
      >
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        ) : (
          <Upload className="h-8 w-8 text-accent" />
        )}
        <p className="mt-3 text-sm font-medium text-txt-primary">
          {loading ? 'Reading quote…' : 'Drop a Telarus quote (.docx) here, or click to choose'}
        </p>
        <p className="mt-1 text-xs text-txt-tertiary">Nothing is selected until you tick it.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 text-sm text-txt-tertiary">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="text-center">
        <Button variant="secondary" onClick={onBlank}>
          <FilePlus2 className="h-4 w-4" />
          Start from scratch
        </Button>
      </div>
    </div>
  );
}

function CarrierCard({ carrier, onChange, onRemove }) {
  const items = carrier.items;
  const selected = items.filter((i) => i.included).length;
  const locations = [...new Set(items.map((i) => i.location || ''))];

  const setItems = (next) => onChange({ ...carrier, items: next });
  const updateItem = (id, patch) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="rounded-xl border border-border bg-bg-secondary">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Checkbox
          title="Select all options for this carrier"
          checked={selected > 0 && selected === items.length}
          indeterminate={selected > 0 && selected < items.length}
          onChange={(v) => setItems(items.map((i) => ({ ...i, included: v })))}
        />
        <input
          value={carrier.name}
          onChange={(e) => onChange({ ...carrier, name: e.target.value })}
          placeholder="Carrier name"
          className={clsx(cellCls, 'max-w-xs font-display text-base font-semibold')}
        />
        <span className="text-xs text-txt-tertiary">
          {selected} of {items.length} selected
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={locations.length === 1 ? locations[0] : ''}
            placeholder={locations.length > 1 ? 'Multiple locations' : 'Service location (defaults to address above)'}
            onChange={(e) => setItems(items.map((i) => ({ ...i, location: e.target.value })))}
            className={clsx(cellCls, 'w-80 text-xs text-txt-secondary')}
            title="Service location for every option from this carrier"
          />
          <button
            onClick={onRemove}
            title="Remove carrier"
            className="rounded p-1.5 text-txt-tertiary hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-txt-tertiary">
              <th className="w-10 px-4 py-2" />
              <th className="w-36 px-1 py-2 font-medium">Type</th>
              <th className="px-1 py-2 font-medium">Product</th>
              <th className="px-1 py-2 font-medium">Description</th>
              <th className="w-28 px-1 py-2 font-medium">Bandwidth</th>
              <th className="w-20 px-1 py-2 font-medium">Term (mo)</th>
              <th className="w-28 px-1 py-2 text-right font-medium">MRC</th>
              <th className="w-28 px-1 py-2 text-right font-medium">NRC</th>
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={clsx(
                  'border-t border-border align-top transition-colors',
                  item.included ? 'bg-accent/[0.04]' : 'opacity-60 hover:opacity-100'
                )}
              >
                <td className="px-4 py-2.5">
                  <Checkbox checked={item.included} onChange={(v) => updateItem(item.id, { included: v })} />
                </td>
                {['type', 'product', 'description', 'bandwidth', 'term'].map((key) => (
                  <td key={key} className="px-1 py-1">
                    {key === 'product' || key === 'description' ? (
                      <textarea
                        rows={1}
                        value={item[key]}
                        onChange={(e) => updateItem(item.id, { [key]: e.target.value })}
                        className={clsx(cellCls, 'resize-none [field-sizing:content]')}
                      />
                    ) : (
                      <input
                        value={item[key]}
                        onChange={(e) => updateItem(item.id, { [key]: e.target.value })}
                        className={cellCls}
                      />
                    )}
                  </td>
                ))}
                {['mrc', 'nrc'].map((key) => (
                  <td key={key} className="px-1 py-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item[key]}
                      onChange={(e) => updateItem(item.id, { [key]: e.target.value === '' ? '' : Number(e.target.value) })}
                      className={clsx(
                        cellCls,
                        'text-right font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                      )}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-0.5">
                    <button
                      title="Duplicate option"
                      onClick={() => {
                        const idx = items.findIndex((i) => i.id === item.id);
                        const copy = { ...item, id: uid('opt') };
                        setItems([...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)]);
                      }}
                      className="rounded p-1.5 text-txt-tertiary hover:bg-bg-tertiary hover:text-txt-primary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Delete option"
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                      className="rounded p-1.5 text-txt-tertiary hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-4 py-2">
        <button
          onClick={() =>
            setItems([...items, blankItem({ location: locations.length === 1 ? locations[0] : '', type: items.at(-1)?.type || '' })])
          }
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Add option
        </button>
      </div>
    </div>
  );
}

function EmailDialog({ quote, onClose }) {
  const carrierNames = quote.carriers
    .filter((c) => c.items.some((i) => i.included))
    .map((c) => c.name || 'Carrier');

  const [senders, setSenders] = useState(null);
  const [form, setForm] = useState({
    from: '',
    to: '',
    cc: '',
    subject: ['Pricing Summary', quote.customer, quote.address].filter(Boolean).join(' – '),
    message:
      `Hi,\n\nAttached is a pricing summary${quote.customer ? ` for ${quote.customer}` : ''}` +
      `${quote.address ? ` at ${quote.address}` : ''}, covering ${carrierNames.join(', ')}.\n\n` +
      'Let me know if you have any questions.\n\nThanks,',
  });
  const [stage, setStage] = useState('edit'); // edit | confirm | sending | sent
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getQuoteSenders()
      .then((list) => {
        setSenders(list);
        setForm((f) => ({ ...f, from: f.from || list[0]?.email || '' }));
      })
      .catch((e) => setError(e.message));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toList = form.to.split(/[,;\s]+/).filter(Boolean);
  const ccList = form.cc.split(/[,;\s]+/).filter(Boolean);

  async function send() {
    setStage('sending');
    setError(null);
    try {
      await api.emailQuote({ quote, ...form });
      setStage('sent');
    } catch (e) {
      setError(e.message);
      setStage('edit');
    }
  }

  if (stage === 'sent') {
    return (
      <Modal title="Email Quote" onClose={onClose}>
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <CheckCircle className="h-10 w-10 text-success" />
          <p className="mt-3 text-sm text-txt-primary">
            Sent to <span className="font-medium">{toList.join(', ')}</span>
          </p>
          <p className="mt-1 text-xs text-txt-tertiary">A copy is in the Sent Items of {form.from}.</p>
          <Button className="mt-6" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Email Quote" onClose={onClose}>
      <div className="space-y-4 overflow-y-auto px-5 py-4">
        <Field label="From">
          <select value={form.from} onChange={set('from')} className={inputCls} disabled={!senders}>
            {!senders && <option>Loading…</option>}
            {senders?.length === 0 && <option value="">No sending mailboxes set up</option>}
            {senders?.map((s) => (
              <option key={s.email} value={s.email}>
                {s.name} &lt;{s.email}&gt;
              </option>
            ))}
          </select>
        </Field>
        <Field label="To">
          <input
            value={form.to}
            onChange={set('to')}
            placeholder="name@company.com — separate multiple with commas"
            className={inputCls}
            autoFocus
          />
        </Field>
        <Field label="CC (optional)">
          <input value={form.cc} onChange={set('cc')} className={inputCls} />
        </Field>
        <Field label="Subject">
          <input value={form.subject} onChange={set('subject')} className={inputCls} />
        </Field>
        <Field label="Message">
          <textarea value={form.message} onChange={set('message')} rows={7} className={inputCls} />
        </Field>
        <p className="flex items-center gap-2 text-xs text-txt-tertiary">
          <FilePlus2 className="h-3.5 w-3.5" />
          Attachment: {pdfFilename(quote)}
        </p>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 [&_button]:whitespace-nowrap">
        {stage === 'edit' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => setStage('confirm')} disabled={!toList.length || !form.from}>
              <Mail className="h-4 w-4" />
              Send
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto min-w-0 break-words text-sm text-txt-secondary">
              Send to {toList.join(', ')}
              {ccList.length ? ` (cc ${ccList.join(', ')})` : ''}?
            </span>
            <Button variant="ghost" onClick={() => setStage('edit')} disabled={stage === 'sending'}>
              Back
            </Button>
            <Button onClick={send} disabled={stage === 'sending'}>
              {stage === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {stage === 'sending' ? 'Sending…' : 'Yes, send it'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function QuoteSummary() {
  const [quote, setQuote] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'preview' | 'download'
  const [previewUrl, setPreviewUrl] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  async function handleFile(file) {
    setParsing(true);
    setError(null);
    try {
      const parsed = await api.parseQuoteFile(file);
      setQuote({ notes: '', showComparison: true, ...parsed });
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }

  if (!quote) {
    return <StartPanel onFile={handleFile} onBlank={() => setQuote(blankQuote())} loading={parsing} error={error} />;
  }

  const set = (k) => (e) => setQuote((q) => ({ ...q, [k]: e.target.value }));
  const selectedCarriers = quote.carriers.filter((c) => c.items.some((i) => i.included));
  const selectedCount = selectedCarriers.reduce((n, c) => n + c.items.filter((i) => i.included).length, 0);
  const lowest = Math.min(
    ...selectedCarriers.flatMap((c) => c.items.filter((i) => i.included).map((i) => Number(i.mrc) || 0))
  );

  // Normalize before sending: numeric prices, carrier names filled in.
  const payload = () => ({
    ...quote,
    carriers: quote.carriers.map((c) => ({
      ...c,
      name: c.name.trim() || 'Carrier',
      items: c.items.map((i) => ({ ...i, mrc: Number(i.mrc) || 0, nrc: Number(i.nrc) || 0 })),
    })),
  });

  async function preview() {
    setBusy('preview');
    setError(null);
    try {
      const blob = await api.getQuotePdf(payload());
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy('download');
    setError(null);
    try {
      saveBlob(await api.getQuotePdf(payload(), { download: true }), pdfFilename(quote));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    if (window.confirm('Clear this summary and start over?')) {
      setQuote(null);
      setError(null);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-txt-primary">Pricing summary</h2>
          <p className="mt-1 text-sm text-txt-secondary">
            Tick the options to include. Click any cell to edit it. Only ticked options appear in the PDF.
          </p>
        </div>
        <Button variant="ghost" onClick={startOver}>
          <RotateCcw className="h-4 w-4" />
          Start over
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-bg-secondary p-4 md:grid-cols-3">
        <Field label="Customer">
          <input value={quote.customer} onChange={set('customer')} placeholder="Customer name" className={inputCls} />
        </Field>
        <Field label="Service address">
          <input value={quote.address} onChange={set('address')} placeholder="Street, city, state" className={inputCls} />
        </Field>
        <Field label="Opportunity ID (optional)">
          <input value={quote.opportunityId} onChange={set('opportunityId')} className={inputCls} />
        </Field>
        <Field label="Note at the top of the PDF (optional)" className="md:col-span-2">
          <textarea
            value={quote.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="e.g. All options include 5 static IPs."
            className={inputCls}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border border-border bg-bg-tertiary px-3 py-2.5">
          <Checkbox
            checked={quote.showComparison}
            onChange={(v) => setQuote((q) => ({ ...q, showComparison: v }))}
          />
          <span className="text-sm text-txt-primary">
            Include "At a Glance" comparison
            <span className="block text-xs text-txt-tertiary">Price by term, lowest per speed highlighted</span>
          </span>
        </label>
      </div>

      {quote.carriers.map((carrier) => (
        <CarrierCard
          key={carrier.id}
          carrier={carrier}
          onChange={(next) => setQuote((q) => ({ ...q, carriers: q.carriers.map((c) => (c.id === next.id ? next : c)) }))}
          onRemove={() => {
            if (!carrier.items.length || window.confirm(`Remove ${carrier.name || 'this carrier'} and its options?`)) {
              setQuote((q) => ({ ...q, carriers: q.carriers.filter((c) => c.id !== carrier.id) }));
            }
          }}
        />
      ))}

      <Button variant="secondary" onClick={() => setQuote((q) => ({ ...q, carriers: [...q.carriers, blankCarrier()] }))}>
        <Plus className="h-4 w-4" />
        Add carrier
      </Button>

      <div className="fixed bottom-0 left-64 right-0 z-40 border-t border-border bg-bg-secondary/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto text-sm">
            {selectedCount ? (
              <span className="text-txt-primary">
                <span className="font-semibold">{selectedCount}</span> option{selectedCount === 1 ? '' : 's'} from{' '}
                <span className="font-semibold">{selectedCarriers.length}</span> carrier
                {selectedCarriers.length === 1 ? '' : 's'}
                <span className="ml-2 text-txt-tertiary">· from {money(lowest)}/mo</span>
              </span>
            ) : (
              <span className="text-txt-tertiary">Tick at least one option to build the PDF</span>
            )}
            {error && <span className="ml-3 text-danger">{error}</span>}
          </div>
          <Button variant="secondary" onClick={preview} disabled={!selectedCount || !!busy}>
            {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview
          </Button>
          <Button variant="secondary" onClick={download} disabled={!selectedCount || !!busy}>
            {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
          <Button onClick={() => setEmailOpen(true)} disabled={!selectedCount || !!busy}>
            <Mail className="h-4 w-4" />
            Email Quote
          </Button>
        </div>
      </div>

      {previewUrl && (
        <Modal
          wide
          title="Preview"
          onClose={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }}
        >
          <iframe title="Pricing summary preview" src={previewUrl} className="h-full w-full flex-1 rounded-b-xl bg-white" />
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="secondary" onClick={download} disabled={!!busy}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              onClick={() => {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setEmailOpen(true);
              }}
            >
              <Mail className="h-4 w-4" />
              Email Quote
            </Button>
          </div>
        </Modal>
      )}

      {emailOpen && <EmailDialog quote={payload()} onClose={() => setEmailOpen(false)} />}
    </div>
  );
}
