import { useState, useEffect } from 'react';
import {
  Radar,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  Linkedin,
  UserPlus,
  Handshake,
  XCircle,
  ChevronRight,
  Flame,
  Zap,
  TrendingUp,
  Eye,
  CheckCircle,
  Ban,
  Building2,
  ArrowRightLeft,
  Users,
  Briefcase,
} from 'lucide-react';
import Button from '../components/shared/Button';
import { api } from '../api/client';

// ── Trigger type config ──────────────────────────────────────────────────────

const TRIGGER_CONFIG = {
  ma_acquisition: { label: 'M&A', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dotColor: 'bg-violet-400', icon: ArrowRightLeft },
  new_facility: { label: 'Expansion', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dotColor: 'bg-emerald-400', icon: Building2 },
  leadership_change: { label: 'Leadership', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dotColor: 'bg-blue-400', icon: Users },
  relocation: { label: 'Relocation', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dotColor: 'bg-amber-400', icon: Briefcase },
};

function TriggerBadge({ type }) {
  const cfg = TRIGGER_CONFIG[type] || TRIGGER_CONFIG.new_facility;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ScoreBadge({ score }) {
  let classes = 'bg-bg-tertiary text-txt-tertiary border-border';
  if (score >= 85) classes = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  else if (score >= 65) classes = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold font-mono ${classes}`}>
      {score}
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    new: 'bg-accent/10 text-accent',
    reviewed: 'bg-blue-500/10 text-blue-400',
    enrolled: 'bg-emerald-500/10 text-emerald-400',
    dismissed: 'bg-bg-tertiary text-txt-tertiary',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status] || styles.new}`}>
      {status}
    </span>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color = 'text-accent' }) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-txt-tertiary">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="mt-1 text-2xl font-bold font-display text-txt-primary">{value}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SignalIntel() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, new: 0, enrolled: 0, dismissed: 0, hot: 0, warm: 0, cool: 0, lastScan: null });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [partnerSeqs, setPartnerSeqs] = useState([]);

  // Filters
  const [triggerFilter, setTriggerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadData() {
    setLoading(true);
    try {
      const params = {};
      if (triggerFilter) params.trigger_type = triggerFilter;
      if (statusFilter) params.status = statusFilter;
      if (minScore > 0) params.min_score = minScore;
      if (searchQuery) params.search = searchQuery;

      const [leadsData, statsData] = await Promise.allSettled([
        api.getSignalIntelLeads(params),
        api.getSignalIntelStats(),
      ]);

      if (leadsData.status === 'fulfilled') {
        setLeads(leadsData.value.leads || []);
      }
      if (statsData.status === 'fulfilled') {
        setStats(statsData.value);
      }
    } catch {
      // API error
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [triggerFilter, statusFilter, minScore, searchQuery]);

  useEffect(() => {
    api.getPartnerSequences().then(rows => setPartnerSeqs(rows || [])).catch(() => {});
  }, []);

  const selected = leads.find(l => l.id === selectedId);

  async function handleScan() {
    setScanning(true);
    try {
      await api.triggerSignalIntelScan();
      await loadData();
      showFeedback('Scan complete');
    } catch {
      showFeedback('Scan failed');
    }
    setScanning(false);
  }

  function showFeedback(msg) {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3000);
  }

  async function handleDismiss(id) {
    try {
      await api.dismissSignalIntelLead(id);
      showFeedback('Lead dismissed');
      if (selectedId === id) setSelectedId(null);
      await loadData();
    } catch {
      showFeedback('Dismiss failed');
    }
  }

  async function handleEnroll(id) {
    try {
      await api.enrollSignalIntelLead(id);
      showFeedback('Enrolled in sequence');
      await loadData();
    } catch (err) {
      showFeedback(err.message || 'Enroll failed');
    }
  }

  async function handleEnrollPartner(id, sequenceId) {
    try {
      await api.enrollSignalIntelPartner(id, sequenceId);
      const seq = partnerSeqs.find(ps => ps.id === Number(sequenceId));
      showFeedback(seq ? `Enrolled — ${seq.partner_name} (${seq.agent_name})` : 'Enrolled in partner cadence');
      await loadData();
    } catch (err) {
      showFeedback(err.message || 'Partner enroll failed');
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // Parse score_factors from JSON string if needed
  function parseFactors(lead) {
    if (!lead.score_factors) return [];
    if (typeof lead.score_factors === 'string') {
      try { return JSON.parse(lead.score_factors); } catch { return []; }
    }
    return lead.score_factors;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <Radar className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-txt-primary">Signal Intel</h1>
              <p className="text-sm text-txt-secondary">
                Real-time lead intelligence from news triggers
                {stats.lastScan && (
                  <span className="text-txt-tertiary ml-2">
                    Last scan: {formatDate(stats.lastScan)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={handleScan} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-6 pt-6 pb-4 lg:px-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Leads" value={stats.total} icon={TrendingUp} />
          <StatCard label="Hot (85+)" value={stats.hot} icon={Flame} color="text-emerald-400" />
          <StatCard label="Warm (65-84)" value={stats.warm} icon={Zap} color="text-yellow-400" />
          <StatCard label="New" value={stats.new} icon={Eye} color="text-accent" />
          <StatCard label="Enrolled" value={stats.enrolled} icon={CheckCircle} color="text-emerald-400" />
          <StatCard label="Dismissed" value={stats.dismissed} icon={Ban} color="text-txt-tertiary" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 pb-4 lg:px-10 flex-wrap">
        <select
          value={triggerFilter}
          onChange={e => setTriggerFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Triggers</option>
          <option value="ma_acquisition">M&A / Acquisition</option>
          <option value="new_facility">Expansion / New Facility</option>
          <option value="leadership_change">Leadership Change</option>
          <option value="relocation">Relocation</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="enrolled">Enrolled</option>
          <option value="dismissed">Dismissed</option>
        </select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-txt-tertiary whitespace-nowrap">Min Score:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={e => setMinScore(parseInt(e.target.value, 10))}
            className="w-24 accent-accent"
          />
          <span className="text-xs font-mono text-txt-secondary w-6">{minScore}</span>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-tertiary" />
          <input
            type="text"
            placeholder="Search companies, contacts, headlines..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-tertiary pl-9 pr-8 py-2 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-primary">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionFeedback && (
        <div className="mx-6 mb-3 lg:mx-10 rounded-lg bg-accent/10 text-accent px-4 py-2 text-sm font-medium">
          {actionFeedback}
        </div>
      )}

      {/* Main content: lead list + detail panel */}
      <div className="flex flex-1 min-h-0 px-6 pb-6 lg:px-10 gap-4">
        {/* Lead list */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-bg-secondary">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-txt-tertiary">
              <Radar className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No leads found</p>
              <p className="text-xs mt-1">Run a scan or adjust your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {leads.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`group p-4 cursor-pointer transition-colors ${
                    selectedId === lead.id ? 'bg-bg-tertiary/50' : 'hover:bg-bg-tertiary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-txt-primary truncate">{lead.company}</span>
                        {lead.city && lead.state && (
                          <span className="text-[11px] text-txt-tertiary shrink-0">{lead.city}, {lead.state}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <TriggerBadge type={lead.trigger_type} />
                        <ScoreBadge score={lead.score} />
                        <StatusBadge status={lead.status} />
                      </div>
                      {lead.trigger_headline && (
                        <p className="text-xs text-txt-secondary truncate mb-1">{lead.trigger_headline}</p>
                      )}
                      {lead.contact_name && (
                        <p className="text-[11px] text-txt-tertiary">
                          {lead.contact_name}{lead.contact_title ? ` - ${lead.contact_title}` : ''}
                          {lead.contact_email ? ` - ${lead.contact_email}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {lead.status === 'new' && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); handleEnroll(lead.id); }}
                            className="rounded-lg p-1.5 text-txt-tertiary hover:text-accent hover:bg-accent/10 transition-colors"
                            title="Enroll in Sequence"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedId(lead.id); }}
                            className="rounded-lg p-1.5 text-txt-tertiary hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            title="Choose Partner Cadence (Jared / Ed / Chad)"
                          >
                            <Handshake className="h-4 w-4" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDismiss(lead.id); }}
                            className="rounded-lg p-1.5 text-txt-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Dismiss"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <ChevronRight className="h-4 w-4 text-txt-tertiary" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="w-96 shrink-0 overflow-y-auto rounded-xl border border-border bg-bg-secondary">
            {/* Company header */}
            <div className="border-b border-border p-5">
              <h2 className="font-display text-lg font-bold text-txt-primary">{selected.company}</h2>
              {selected.city && selected.state && (
                <p className="text-sm text-txt-secondary mt-0.5">{selected.city}, {selected.state}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <TriggerBadge type={selected.trigger_type} />
                <ScoreBadge score={selected.score} />
                <StatusBadge status={selected.status} />
              </div>
              {selected.industry && (
                <p className="text-xs text-txt-tertiary mt-2">Industry: {selected.industry}</p>
              )}
              {selected.employee_count && (
                <p className="text-xs text-txt-tertiary">Employees: {selected.employee_count}</p>
              )}
              {selected.revenue && (
                <p className="text-xs text-txt-tertiary">Revenue: {selected.revenue}</p>
              )}
            </div>

            {/* Trigger details */}
            <div className="border-b border-border p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary mb-2">Trigger Event</h3>
              {selected.trigger_headline && (
                <p className="text-sm text-txt-primary leading-relaxed mb-2">{selected.trigger_headline}</p>
              )}
              {selected.trigger_detail && (
                <p className="text-xs text-txt-secondary leading-relaxed mb-2">{selected.trigger_detail}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-txt-tertiary">
                {selected.trigger_source && <span>{selected.trigger_source}</span>}
                {selected.trigger_date && <span>{formatDate(selected.trigger_date)}</span>}
              </div>
              {selected.trigger_url && (
                <a
                  href={selected.trigger_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
                >
                  View Source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Score breakdown */}
            <div className="border-b border-border p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary mb-2">Score Breakdown</h3>
              <div className="space-y-2">
                {parseFactors(selected).map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-txt-secondary">{f.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-bg-primary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            f.score >= 80 ? 'bg-emerald-400' : f.score >= 60 ? 'bg-yellow-400' : 'bg-txt-tertiary'
                          }`}
                          style={{ width: `${f.score}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-txt-tertiary w-6 text-right">{f.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact info */}
            {selected.contact_name && (
              <div className="border-b border-border p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary mb-2">Contact</h3>
                <p className="text-sm font-medium text-txt-primary">{selected.contact_name}</p>
                {selected.contact_title && (
                  <p className="text-xs text-txt-secondary mt-0.5">{selected.contact_title}</p>
                )}
                {selected.contact_email && (
                  <p className="text-xs text-txt-secondary mt-1">
                    <a href={`mailto:${selected.contact_email}`} className="text-accent hover:underline">
                      {selected.contact_email}
                    </a>
                  </p>
                )}
                {selected.contact_phone && (
                  <p className="text-xs text-txt-tertiary mt-0.5">{selected.contact_phone}</p>
                )}
                {selected.contact_linkedin && (
                  <a
                    href={selected.contact_linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline mt-2"
                  >
                    <Linkedin className="h-3 w-3" /> LinkedIn Profile
                  </a>
                )}
              </div>
            )}

            {/* Actions */}
            {selected.status === 'new' && (
              <div className="p-5 space-y-2">
                <Button variant="primary" className="w-full" onClick={() => handleEnroll(selected.id)}>
                  <UserPlus className="h-4 w-4" /> Enroll in Sequence
                </Button>
                {partnerSeqs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-txt-tertiary mb-1.5 mt-1">
                      Enroll — Partner Cadence
                    </p>
                    <div className="space-y-1.5">
                      {partnerSeqs.map(ps => (
                        <Button
                          key={ps.id}
                          variant="secondary"
                          className="w-full justify-start"
                          onClick={() => handleEnrollPartner(selected.id, ps.id)}
                        >
                          <Handshake className="h-4 w-4" /> {ps.partner_name} <span className="text-txt-tertiary">({ps.agent_name})</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="danger" className="w-full" onClick={() => handleDismiss(selected.id)}>
                  <XCircle className="h-4 w-4" /> Dismiss
                </Button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
