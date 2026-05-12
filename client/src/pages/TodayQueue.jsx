import { useState, useEffect } from 'react';
import { RefreshCw, X, Send, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api/client';

function StepBadge({ step }) {
  const label = step === 'drip' ? 'Drip' : `Step ${step}`;
  const colors =
    step === 1 ? 'bg-green-500/15 text-green-400 border-green-500/30' :
    step === 2 ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' :
    step === 'drip' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' :
    'bg-blue-500/15 text-blue-400 border-blue-500/30';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${colors}`}>
      {label}
    </span>
  );
}

export default function TodayQueue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [removed, setRemoved] = useState(new Set());

  async function load() {
    setLoading(true);
    try {
      const result = await api.getQueueToday();
      setData(result);
    } catch (e) {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRemove(prospectId) {
    setRemoving(prospectId);
    try {
      await api.removeFromQueue(prospectId);
      setRemoved(prev => new Set([...prev, prospectId]));
      setConfirmId(null);
    } catch (e) {
      alert('Remove failed: ' + e.message);
    } finally {
      setRemoving(null);
    }
  }

  const allRows = data
    ? [
        ...data.partner_cadence.map(r => ({ ...r, source: 'partner' })),
        ...data.drip.map(r => ({ ...r, source: 'drip' })),
      ].filter(r => !removed.has(r.prospect_id))
    : [];

  return (
    <div className="min-h-screen bg-bg-primary p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-txt-primary">Today's Queue</h1>
          <p className="mt-1 text-sm text-txt-tertiary">All prospects scheduled to receive emails today</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {data && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: 'Sent Today', value: data.sent_today, icon: CheckCircle, color: 'text-green-400' },
            { label: 'Partner Cadence Left', value: data.partner_cadence_remaining - [...removed].filter(id => data.partner_cadence.some(r => r.prospect_id === id)).length, icon: Users, color: 'text-accent' },
            { label: 'Drip Left', value: data.drip_remaining - [...removed].filter(id => data.drip.some(r => r.prospect_id === id)).length, icon: Send, color: 'text-purple-400' },
            { label: 'Total Remaining', value: allRows.length, icon: AlertCircle, color: 'text-yellow-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-bg-secondary p-4">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="text-xs font-medium uppercase tracking-wider text-txt-tertiary">{label}</p>
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-txt-primary">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-secondary">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-sm font-semibold text-txt-primary">
            {allRows.length} prospect{allRows.length !== 1 ? 's' : ''} remaining today
          </h2>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-txt-tertiary" />
          </div>
        ) : allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-txt-tertiary">
            <CheckCircle className="h-8 w-8 mb-3 text-green-400" />
            <p className="text-sm font-medium">Queue is empty</p>
            <p className="text-xs mt-1">All sends for today are complete or the queue hasn't loaded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Column headers */}
            <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_80px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">
              <span>Name</span>
              <span>Company</span>
              <span>Agent</span>
              <span>Step</span>
              <span>Status</span>
              <span></span>
            </div>

            {allRows.map((row) => (
              <div
                key={`${row.source}-${row.prospect_id}-${row.enrollment_id}`}
                className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_80px] gap-4 items-center px-6 py-3.5 hover:bg-bg-tertiary/40 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {row.first_name} {row.last_name}
                  </p>
                  {row.title && (
                    <p className="text-xs text-txt-tertiary truncate">{row.title}</p>
                  )}
                </div>
                <p className="text-sm text-txt-secondary truncate">{row.company || '—'}</p>
                <p className="text-sm text-txt-secondary">{row.agent}</p>
                <StepBadge step={row.step} />
                <p className="text-xs text-txt-tertiary capitalize">{row.status || 'in_sequence'}</p>

                <div className="flex justify-end">
                  {confirmId === row.prospect_id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRemove(row.prospect_id)}
                        disabled={removing === row.prospect_id}
                        className="rounded-md bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        {removing === row.prospect_id ? '...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="rounded-md px-1.5 py-1 text-xs text-txt-tertiary hover:text-txt-primary transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(row.prospect_id)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-txt-tertiary border border-border hover:border-red-500/50 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
