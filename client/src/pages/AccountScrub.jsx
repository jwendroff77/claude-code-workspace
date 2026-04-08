import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  ArrowLeft,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  Users,
  Building2,
  Filter,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';
import { api } from '../api/client';

// No mock data — scrub queue loaded from API

export default function AccountScrub() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [prospects, setProspects] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [agentData, scrubData] = await Promise.allSettled([
          api.getAgent(agentId),
          api.getScrubQueue(agentId),
        ]);
        if (agentData.status === 'fulfilled') setAgent(agentData.value);
        if (scrubData.status === 'fulfilled' && scrubData.value.length > 0) {
          setProspects(scrubData.value);
        }
      } catch {
        // Keep mock data
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [agentId]);

  const filtered = prospects.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.first_name + ' ' + p.last_name).toLowerCase().includes(s) ||
      (p.company || '').toLowerCase().includes(s) ||
      (p.email || '').toLowerCase().includes(s) ||
      (p.industry || '').toLowerCase().includes(s)
    );
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await api.bulkApproveScrub(ids);
      setProspects((prev) => prev.filter((p) => !selected.has(p.id)));
      setActionMessage({ type: 'success', text: `${ids.length} prospect${ids.length > 1 ? 's' : ''} approved` });
      setSelected(new Set());
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve — using mock data' });
      setProspects((prev) => prev.filter((p) => !selected.has(p.id)));
      setSelected(new Set());
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await api.bulkRejectScrub(ids, 'Account ownership conflict');
      setProspects((prev) => prev.filter((p) => !selected.has(p.id)));
      setActionMessage({ type: 'success', text: `${ids.length} prospect${ids.length > 1 ? 's' : ''} removed` });
      setSelected(new Set());
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject — using mock data' });
      setProspects((prev) => prev.filter((p) => !selected.has(p.id)));
      setSelected(new Set());
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const agentName = agent?.name || 'Partner Agent';
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-5 lg:px-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/lists')}
            className="flex items-center gap-1 text-sm text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-3">
            <AgentAvatar name={agentName} status="active" size="md" />
            <div>
              <h1 className="font-display text-xl font-bold text-txt-primary">
                Account Scrub — {agentName}
              </h1>
              <p className="text-xs text-txt-secondary">
                Review and remove any accounts that cannot be worked due to ownership conflicts
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 lg:px-10">
        {/* Action message */}
        {actionMessage && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
              actionMessage.type === 'success'
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-danger/10 text-danger border border-danger/20'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-tertiary" />
              <input
                type="text"
                placeholder="Search name, company, industry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-80 rounded-lg border border-border bg-bg-tertiary py-2 pl-10 pr-4 text-sm text-txt-primary placeholder:text-txt-tertiary focus:border-accent focus:outline-none"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2 text-xs text-txt-secondary">
              <Users className="h-3.5 w-3.5" />
              <span>{prospects.length} pending scrub</span>
            </div>
          </div>

          {/* Bulk actions */}
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <span className="text-xs font-medium text-accent">
                {selected.size} selected
              </span>
            )}
            <Button
              variant="primary"
              onClick={handleApprove}
              disabled={selected.size === 0}
              className="gap-1.5"
            >
              <CheckCircle className="h-4 w-4" />
              Approve {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              disabled={selected.size === 0}
              className="gap-1.5"
            >
              <XCircle className="h-4 w-4" />
              Remove {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-tertiary">
                <th className="w-12 px-4 py-3">
                  <button onClick={toggleAll} className="text-txt-tertiary hover:text-txt-primary">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-accent" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Industry
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-txt-tertiary">
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prospect) => {
                const isSelected = selected.has(prospect.id);
                return (
                  <tr
                    key={prospect.id}
                    onClick={() => toggleSelect(prospect.id)}
                    className={`cursor-pointer border-b border-border transition-colors ${
                      isSelected
                        ? 'bg-accent/5'
                        : 'hover:bg-bg-tertiary/50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-accent" />
                      ) : (
                        <Square className="h-4 w-4 text-txt-tertiary" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-txt-primary">
                        {prospect.first_name} {prospect.last_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-txt-tertiary" />
                        <span className="text-sm text-txt-secondary">{prospect.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-txt-secondary">
                      {prospect.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-txt-secondary">
                        {prospect.industry || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-txt-tertiary">
                      {prospect.city}{prospect.state ? `, ${prospect.state}` : ''}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-txt-tertiary">
                      {prospect.email}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <CheckCircle className="h-10 w-10 text-success/50" />
                      <div>
                        <p className="text-sm font-medium text-txt-primary">All clear</p>
                        <p className="text-xs text-txt-tertiary">
                          {search ? 'No matches for your search' : 'No prospects pending scrub'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-xs text-txt-tertiary">
          Click rows to select • Use Approve to keep prospects • Use Remove to scrub accounts that can't be worked
        </p>
      </div>
    </div>
  );
}
