import { useState, useEffect, useRef } from 'react';
import { Search, X, ShieldOff, AlertCircle, CheckCircle, Loader2, Mail, Building2, User } from 'lucide-react';
import { api } from '../api/client';

const DEAD_STATUSES = ['unsubscribed', 'disqualified', 'bounced', 'booked', 'handed_off'];

function StatusPill({ status }) {
  const dead = DEAD_STATUSES.includes(status);
  const colors = dead
    ? 'bg-bg-tertiary text-txt-tertiary border-border'
    : status === 'replied' || status === 'engaged'
    ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${colors}`}>
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function CadencePill({ row }) {
  const active = (row.active_partner || 0) + (row.active_drip || 0) + (row.active_pse || 0);
  if (!active) {
    return <span className="text-xs text-txt-tertiary">not in a cadence</span>;
  }
  const parts = [];
  if (row.active_partner) parts.push(`Partner${row.step ? ` step ${row.step}` : ''}`);
  if (row.active_drip || row.active_pse) parts.push('Drip');
  return (
    <span className="inline-flex items-center rounded-md border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
      {parts.join(' + ')}
    </span>
  );
}

export default function ProspectSearch() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [confirmId, setConfirmId] = useState(null);
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState(null);
  const [done, setDone] = useState({});

  const debounce = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setData(null); setError(null); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.searchProspects(q));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query]);

  function openConfirm(row) {
    setConfirmId(row.prospect_id);
    setReason('');
  }

  async function handleRemove(row) {
    setRemoving(row.prospect_id);
    try {
      const result = await api.removeFromQueue(row.prospect_id, reason);
      setDone(prev => ({ ...prev, [row.prospect_id]: result }));
      setConfirmId(null);
      setReason('');
    } catch (e) {
      alert('Remove failed: ' + e.message);
    } finally {
      setRemoving(null);
    }
  }

  const rows = data?.results || [];

  return (
    <div className="min-h-screen bg-bg-primary p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-txt-primary">Find a Prospect</h1>
        <p className="mt-1 text-sm text-txt-tertiary">
          Search everyone in the database by person name, email address, or company name, then pull
          them out of every cadence in one click.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-tertiary" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Name, email, or company..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg-secondary py-3 pl-9 pr-10 text-sm text-txt-primary placeholder-txt-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-txt-tertiary" />}
        {!loading && query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="mb-6 text-xs text-txt-tertiary">
        {query.trim().length > 0 && query.trim().length < 2
          ? 'Type at least 2 characters.'
          : data
          ? `${data.count} match${data.count !== 1 ? 'es' : ''}${data.count >= 100 ? ' (showing first 100, narrow your search)' : ''}`
          : 'Matches appear as you type.'}
      </p>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map(row => {
            const result = done[row.prospect_id];
            const active = (row.active_partner || 0) + (row.active_drip || 0) + (row.active_pse || 0);
            return (
              <div
                key={row.prospect_id}
                className="rounded-xl border border-border bg-bg-secondary p-5 transition-colors hover:border-border/80"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-txt-tertiary" />
                      <p className="font-display text-sm font-semibold text-txt-primary">
                        {row.first_name} {row.last_name}
                      </p>
                      {row.title && <span className="text-xs text-txt-tertiary">{row.title}</span>}
                      <StatusPill status={row.status} />
                      {row.excluded ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-tertiary px-2 py-0.5 text-xs text-txt-tertiary">
                          <ShieldOff className="h-3 w-3" /> on exclusion list
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-txt-secondary">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-txt-tertiary" />
                        {row.company || '-'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-txt-tertiary" />
                        {row.email || '-'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-txt-tertiary">
                      <CadencePill row={row} />
                      {row.agent && <span>Agent: {row.agent}</span>}
                      {row.last_sent && (
                        <span>Last email: {new Date(row.last_sent).toLocaleDateString()}</span>
                      )}
                      <span>ID #{row.prospect_id}</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {result ? (
                      <div className="text-right">
                        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-400">
                          <CheckCircle className="h-4 w-4" /> Removed
                        </p>
                        <p className="mt-1 text-xs text-txt-tertiary">
                          {result.partner_cancelled} partner, {result.drip_cancelled} drip cancelled
                          <br />
                          {result.added_to_exclusion_list
                            ? 'added to exclusion list'
                            : 'already on exclusion list'}
                        </p>
                      </div>
                    ) : confirmId === row.prospect_id ? null : (
                      <button
                        onClick={() => openConfirm(row)}
                        className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-txt-secondary transition-colors hover:border-red-500/50 hover:text-red-400"
                      >
                        {active ? 'Remove from cadence' : 'Add to exclusion list'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Confirm drawer */}
                {confirmId === row.prospect_id && !result && (
                  <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                    <p className="text-sm font-medium text-txt-primary">
                      Remove {row.first_name} {row.last_name} from everything?
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-txt-tertiary">
                      <li>Cancels every partner cadence and drip enrollment</li>
                      <li>Marks the prospect unsubscribed</li>
                      <li>Adds {row.email} to the exclusion list so a future import cannot re-enroll them</li>
                    </ul>
                    <input
                      type="text"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Reason (optional, saved to the exclusion list)"
                      className="mt-3 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-txt-primary placeholder-txt-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                      onKeyDown={e => { if (e.key === 'Enter') handleRemove(row); }}
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => handleRemove(row)}
                        disabled={removing === row.prospect_id}
                        className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                      >
                        {removing === row.prospect_id ? 'Removing...' : 'Yes, remove'}
                      </button>
                      <button
                        onClick={() => { setConfirmId(null); setReason(''); }}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-txt-tertiary transition-colors hover:text-txt-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && rows.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-secondary py-20 text-txt-tertiary">
          <Search className="mb-3 h-8 w-8" />
          <p className="text-sm font-medium">No prospect matches that search</p>
          <p className="mt-1 text-xs">Try a company name, a last name, or part of an email address.</p>
        </div>
      )}
    </div>
  );
}
