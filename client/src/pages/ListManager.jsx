import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  Link2,
  UserPlus,
  Ban,
  Users,
  Play,
  Clock,
  XCircle,
} from 'lucide-react';
import MetricCard from '../components/shared/MetricCard';
import StatusBadge from '../components/shared/StatusBadge';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';

const mockProspects = [
  { id: 1, name: 'David Chen', company: 'Meridian Health', title: 'CIO', email: 'dchen@meridianhealth.com', agent: 'Megan', agentStatus: 'active', status: 'active', imported: 'Mar 15, 2026' },
  { id: 2, name: 'Sarah Kim', company: 'Apex Financial', title: 'VP of Operations', email: 'skim@apexfinancial.com', agent: 'Lauren', agentStatus: 'active', status: 'active', imported: 'Mar 15, 2026' },
  { id: 3, name: 'Michael Torres', company: 'Summit Partners', title: 'CFO', email: 'mtorres@summitpartners.com', agent: 'Kate', agentStatus: 'active', status: 'active', imported: 'Mar 18, 2026' },
  { id: 4, name: 'Jennifer Walsh', company: 'Northside Medical Group', title: 'IT Director', email: 'jwalsh@northsidemedical.com', agent: 'Scott', agentStatus: 'active', status: 'active', imported: 'Mar 18, 2026' },
  { id: 5, name: 'Robert Huang', company: 'Valley Medical Center', title: 'CIO', email: 'rhuang@valleymed.org', agent: 'Lauren', agentStatus: 'active', status: 'active', imported: 'Mar 20, 2026' },
  { id: 6, name: 'Amanda Foster', company: 'Horizon Health', title: 'VP of Technology', email: 'afoster@horizonhealth.com', agent: 'Kate', agentStatus: 'active', status: 'paused', imported: 'Mar 20, 2026' },
  { id: 7, name: 'Brian Wright', company: 'Atlas Financial', title: 'CFO', email: 'bwright@atlasfinancial.com', agent: 'Scott', agentStatus: 'active', status: 'active', imported: 'Mar 22, 2026' },
  { id: 8, name: 'Lisa Park', company: 'Crestview Capital', title: 'Director of Finance', email: 'lpark@crestviewcap.com', agent: 'Megan', agentStatus: 'active', status: 'active', imported: 'Mar 22, 2026' },
  { id: 9, name: 'Carlos Mendez', company: 'Unity Healthcare', title: 'VP Operations', email: 'cmendez@unityhc.org', agent: 'Lauren', agentStatus: 'active', status: 'draft', imported: 'Mar 25, 2026' },
  { id: 10, name: 'Nina Patel', company: 'Cornerstone Health', title: 'IT Director', email: 'npatel@cornerstonehealth.com', agent: 'Kate', agentStatus: 'active', status: 'active', imported: 'Mar 25, 2026' },
];

const mockExclusions = [
  { id: 101, name: 'Mark Thompson', company: 'Regional Care LLC', title: 'IT Manager', email: 'mthompson@regionalcare.com', reason: 'Opted out', excludedOn: 'Mar 28, 2026' },
  { id: 102, name: 'Diana Ruiz', company: 'Westfield Group', title: 'Controller', email: 'druiz@westfieldgroup.com', reason: 'Bad email', excludedOn: 'Mar 30, 2026' },
  { id: 103, name: 'Paul Stevens', company: 'Lakewood Systems', title: 'CFO', email: 'pstevens@lakewood.com', reason: 'Competitor', excludedOn: 'Apr 1, 2026' },
];

const statusMap = {
  active: 'active',
  paused: 'paused',
  draft: 'draft',
};

export default function ListManager() {
  const [prospects, setProspects] = useState(mockProspects);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    api.getProspects()
      .then((data) => setProspects(data))
      .catch(() => {
        // Keep mock data as fallback
      });
  }, []);

  const filtered = prospects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.company.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const totalProspects = prospects.length;
  const inSequence = prospects.filter((p) => p.status === 'active').length;
  const available = prospects.filter((p) => p.status === 'draft').length;
  const excluded = mockExclusions.length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <div className="max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-xl font-bold text-txt-primary">List Manager</h1>
          <p className="text-xs text-txt-secondary mt-1">
            Import, manage, and assign prospects to your AI agents
          </p>
        </div>

        {/* Import panel */}
        <div className="rounded-xl border border-border bg-bg-secondary p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">
              <Link2 className="h-4 w-4" />
              Connect Apollo
            </Button>
            <Button variant="secondary">
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <div className="flex-1 min-w-[240px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-tertiary" />
                <input
                  type="text"
                  placeholder="Search prospects by name, company, or email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-border bg-bg-tertiary py-2 pl-10 pr-4 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Total Prospects" value={totalProspects} icon={Users} sub="All imported contacts" />
          <MetricCard label="In Sequence" value={inSequence} accent sub="Currently being emailed" />
          <MetricCard label="Available" value={available} sub="Ready to assign" />
          <MetricCard label="Excluded" value={excluded} sub="Opted out or invalid" />
        </div>

        {/* Main prospect table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg-tertiary">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Name</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Company</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Title</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Email</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Agent</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Status</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Imported</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((prospect, idx) => (
                  <tr
                    key={prospect.id}
                    className="border-b border-border bg-bg-secondary hover:bg-bg-tertiary/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-txt-primary">{prospect.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-txt-secondary">{prospect.company}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-txt-secondary">{prospect.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-txt-secondary">{prospect.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AgentAvatar name={prospect.agent} status={prospect.agentStatus} size="sm" />
                        <span className="text-sm text-txt-secondary">{prospect.agent}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={statusMap[prospect.status]} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-txt-tertiary">{prospect.imported}</span>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-txt-tertiary">
                      No prospects match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border bg-bg-secondary px-4 py-3">
            <p className="text-xs text-txt-tertiary">
              Showing {paged.length} of {filtered.length} prospects
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-1.5 text-txt-secondary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    page === p
                      ? 'bg-accent text-bg-primary'
                      : 'text-txt-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg p-1.5 text-txt-secondary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Exclusion list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-danger" />
            <h2 className="font-display text-base font-bold text-txt-primary">Exclusion List</h2>
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-mono text-danger">
              {mockExclusions.length}
            </span>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg-tertiary">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Name</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Company</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Email</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Reason</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary">Excluded On</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-txt-tertiary"></th>
                </tr>
              </thead>
              <tbody>
                {mockExclusions.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border bg-bg-secondary hover:bg-bg-tertiary/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-txt-primary">{item.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-txt-secondary">{item.company}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-txt-secondary">{item.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                        {item.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-txt-tertiary">{item.excludedOn}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors">
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
