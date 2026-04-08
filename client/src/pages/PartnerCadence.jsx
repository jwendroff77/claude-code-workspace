import { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  RefreshCw,
  Mail,
  ArrowRight,
  Handshake,
  Search,
  Download,
  List,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';

const statusColors = {
  active: 'bg-success/10 text-success',
  waiting_partner: 'bg-warning/10 text-warning',
  completed: 'bg-bg-tertiary text-txt-tertiary',
  cancelled: 'bg-danger/10 text-danger',
  paused: 'bg-bg-tertiary text-txt-tertiary',
};

const statusLabels = {
  active: 'Active',
  waiting_partner: 'Waiting for Partner',
  completed: 'Completed',
  cancelled: 'Cancelled',
  paused: 'Paused',
};

const stepTypeLabels = {
  agent_send_cc: 'Agent Sends (CC Partner)',
  partner_reply: 'Partner Replies',
  agent_followup: 'Agent Follow-up',
};

const stepTypeIcons = {
  agent_send_cc: Mail,
  partner_reply: Handshake,
  agent_followup: ArrowRight,
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusColors[status] || statusColors.active}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PartnerCadence() {
  const [sequences, setSequences] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Right panel tabs
  const [rightTab, setRightTab] = useState('enrollments'); // 'enrollments' | 'import'

  // Apollo search state
  const [searchTitle, setSearchTitle] = useState('IT Director');
  const [searchLocation, setSearchLocation] = useState('United States');
  const [searchCompanySize, setSearchCompanySize] = useState('51,200');
  const [searchVertical, setSearchVertical] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedResults, setSelectedResults] = useState(new Set());
  const [importing, setImporting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [seqRes, enrollRes] = await Promise.all([
        fetch('/api/partner-cadence').then(r => r.json()),
        fetch('/api/partner-cadence/enrollments/all').then(r => r.json()),
      ]);
      setSequences(seqRes);
      setEnrollments(enrollRes);
      if (seqRes.length > 0 && !selectedSeq) {
        const detail = await fetch(`/api/partner-cadence/${seqRes[0].id}`).then(r => r.json());
        setSelectedSeq(detail);
      }
    } catch (err) {
      console.error('Failed to load partner cadence data:', err);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleApolloSearch() {
    if (!searchTitle.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSelectedResults(new Set());
    try {
      const body = {
        person_titles: searchTitle.split(',').map(t => t.trim()),
        person_locations: [searchLocation],
        organization_num_employees_ranges: [searchCompanySize],
        contact_email_status: ['verified'],
        per_page: 25,
        page: 1,
      };
      if (searchVertical) {
        body.q_organization_keyword_tags = searchVertical.split(',').map(t => t.trim());
      }
      const res = await fetch('/api/partner-cadence/search-apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSearchResults(data.people || []);
    } catch {
      setFeedback('Apollo search failed');
      setTimeout(() => setFeedback(null), 3000);
    }
    setSearching(false);
  }

  async function handleImportAndEnroll() {
    if (!selectedSeq || selectedResults.size === 0) return;
    setImporting(true);
    try {
      const prospects = searchResults
        .filter(p => selectedResults.has(p.id))
        .map(p => ({
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          title: p.title,
          organization_name: p.organization?.name,
          industry: p.organization?.industry,
          phone: p.phone_numbers?.[0]?.sanitized_number,
          linkedin_url: p.linkedin_url,
        }))
        .filter(p => p.email); // Only those with emails

      const res = await fetch('/api/partner-cadence/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects, sequence_id: selectedSeq.id }),
      });
      const result = await res.json();
      setFeedback(`Imported ${result.imported} new, enrolled ${result.enrolled} (${result.duplicates} duplicates skipped)`);
      setTimeout(() => setFeedback(null), 5000);
      setSearchResults([]);
      setSelectedResults(new Set());
      setRightTab('enrollments');
      await loadData();
    } catch {
      setFeedback('Import failed');
      setTimeout(() => setFeedback(null), 3000);
    }
    setImporting(false);
  }

  async function handleCancel(enrollmentId) {
    try {
      await fetch(`/api/partner-cadence/enrollments/${enrollmentId}/cancel`, { method: 'PUT' });
      await loadData();
    } catch { /* skip */ }
  }

  function toggleSelectAll() {
    if (selectedResults.size === searchResults.filter(p => p.email).length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(searchResults.filter(p => p.email).map(p => p.id)));
    }
  }

  const seqEnrollments = selectedSeq
    ? enrollments.filter(e => e.sequence_id === selectedSeq.id)
    : [];

  return (
    <div className="flex flex-col h-full min-h-0 -m-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-bg-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <Handshake className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-txt-primary">Partner Cadences</h1>
            <p className="text-xs text-txt-tertiary">AI agent + partner collaborative outreach</p>
          </div>
        </div>
        <Button variant="secondary" onClick={loadData}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {feedback && (
        <div className="mx-6 mt-3 rounded-lg bg-success/10 text-success px-4 py-2 text-sm font-medium">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Sequence + steps */}
          <aside className="w-96 shrink-0 border-r border-border overflow-y-auto bg-bg-primary">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                onClick={async () => {
                  const detail = await fetch(`/api/partner-cadence/${seq.id}`).then(r => r.json());
                  setSelectedSeq(detail);
                }}
                className={`w-full text-left p-4 border-b border-border transition-colors ${
                  selectedSeq?.id === seq.id ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <AgentAvatar name={seq.agent_name} status="active" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-txt-primary truncate">{seq.name}</p>
                    <p className="text-xs text-txt-secondary">{seq.agent_name} + {seq.partner_name}</p>
                  </div>
                  <StatusBadge status={seq.status} />
                </div>
                <div className="flex gap-3 text-xs text-txt-tertiary">
                  <span>{seq.step_count} steps</span>
                  <span>{seq.enrollment_count} active</span>
                </div>
              </button>
            ))}

            {/* Steps detail */}
            {selectedSeq?.steps && (
              <div className="p-4 border-t border-border">
                <h3 className="text-xs font-medium uppercase tracking-wider text-txt-tertiary mb-3">Cadence Steps</h3>
                <div className="space-y-2">
                  {selectedSeq.steps.map((step) => {
                    const Icon = stepTypeIcons[step.step_type] || Mail;
                    return (
                      <div key={step.id} className="flex items-start gap-2 p-2 rounded-lg bg-bg-secondary">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 shrink-0 mt-0.5">
                          <Icon className="h-3.5 w-3.5 text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-txt-primary">Step {step.step_number} - Day {step.delay_days}</p>
                          <p className="text-[10px] text-txt-tertiary">{stepTypeLabels[step.step_type]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>

          {/* Right panel - Tabs: Enrollments | Import */}
          <main className="flex-1 flex flex-col min-h-0 bg-bg-primary">
            {selectedSeq ? (
              <>
                {/* Tab bar */}
                <div className="flex items-center gap-1 border-b border-border px-6 py-3">
                  <button
                    onClick={() => setRightTab('enrollments')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      rightTab === 'enrollments' ? 'bg-accent text-bg-primary' : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <List className="h-4 w-4" />
                    Enrollments ({seqEnrollments.length})
                  </button>
                  <button
                    onClick={() => setRightTab('import')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      rightTab === 'import' ? 'bg-accent text-bg-primary' : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <Download className="h-4 w-4" />
                    Import from Apollo
                  </button>
                </div>

                {/* TAB: Enrollments */}
                {rightTab === 'enrollments' && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-4">
                      <h2 className="font-display text-lg font-bold text-txt-primary">{selectedSeq.name}</h2>
                      <p className="text-sm text-txt-secondary mt-1">{selectedSeq.description}</p>
                    </div>

                    {seqEnrollments.length > 0 ? (
                      <div className="space-y-2">
                        {seqEnrollments.map((e) => (
                          <div key={e.id} className="rounded-lg border border-border bg-bg-secondary p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <AgentAvatar name={`${e.first_name} ${e.last_name}`} size="sm" />
                                <div>
                                  <p className="text-sm font-medium text-txt-primary">{e.first_name} {e.last_name}</p>
                                  <p className="text-xs text-txt-secondary">{e.title} at {e.company}</p>
                                  <p className="text-[10px] text-txt-tertiary">{e.prospect_email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <StatusBadge status={e.status} />
                                  <p className="text-[10px] text-txt-tertiary mt-1">Step {e.current_step}/6</p>
                                </div>
                                {e.status !== 'cancelled' && e.status !== 'completed' && (
                                  <button onClick={() => handleCancel(e.id)} className="text-txt-tertiary hover:text-danger transition-colors" title="Cancel">
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-4 mt-2 text-[10px] text-txt-tertiary">
                              <span>Enrolled: {formatDate(e.enrolled_at)}</span>
                              {e.partner_replied_at && <span className="text-success">Partner replied: {formatDate(e.partner_replied_at)}</span>}
                              {e.status === 'waiting_partner' && !e.partner_replied_at && (
                                <span className="text-warning flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Waiting for {e.partner_name} to reply-all
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Users className="h-10 w-10 mx-auto mb-3 text-txt-tertiary opacity-30" />
                        <p className="text-sm text-txt-tertiary">No prospects enrolled yet</p>
                        <p className="text-xs text-txt-tertiary mt-1">Switch to the "Import from Apollo" tab to add prospects</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Import from Apollo */}
                {rightTab === 'import' && (
                  <div className="flex-1 overflow-y-auto p-6">
                    <h2 className="font-display text-base font-bold text-txt-primary mb-4">
                      Import Prospects for {selectedSeq.name}
                    </h2>

                    {/* Search form */}
                    <div className="rounded-xl border border-border bg-bg-secondary p-4 mb-4">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs text-txt-tertiary mb-1">Job Titles (comma separated)</label>
                          <input
                            type="text" value={searchTitle}
                            onChange={(e) => setSearchTitle(e.target.value)}
                            placeholder="IT Director, CIO, VP of IT"
                            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-txt-tertiary mb-1">Industry / Vertical</label>
                          <select
                            value={searchVertical}
                            onChange={(e) => setSearchVertical(e.target.value)}
                            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          >
                            <option value="">All Industries</option>
                            <option value="healthcare">Healthcare</option>
                            <option value="financial services">Financial Services</option>
                            <option value="manufacturing">Manufacturing</option>
                            <option value="logistics,transportation">Logistics / Transportation</option>
                            <option value="real estate,property management">Real Estate / Property Management</option>
                            <option value="legal">Legal</option>
                            <option value="construction">Construction</option>
                            <option value="retail">Retail</option>
                            <option value="hospitality,restaurants,food service">Hospitality / Food Service</option>
                            <option value="nonprofit">Nonprofit</option>
                            <option value="professional services,consulting">Professional Services / Consulting</option>
                            <option value="energy,oil,utilities">Energy / Utilities</option>
                            <option value="automotive">Automotive</option>
                            <option value="agriculture">Agriculture</option>
                            <option value="media,entertainment">Media / Entertainment</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs text-txt-tertiary mb-1">Location</label>
                          <input
                            type="text" value={searchLocation}
                            onChange={(e) => setSearchLocation(e.target.value)}
                            placeholder="United States"
                            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-txt-tertiary mb-1">Company Size</label>
                          <select
                            value={searchCompanySize}
                            onChange={(e) => setSearchCompanySize(e.target.value)}
                            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          >
                            <option value="1,50">1-50</option>
                            <option value="51,200">51-200</option>
                            <option value="201,500">201-500</option>
                            <option value="501,1000">501-1,000</option>
                            <option value="1001,5000">1,001-5,000</option>
                            <option value="5001,10000">5,001-10,000</option>
                          </select>
                        </div>
                      </div>
                      <Button variant="primary" onClick={handleApolloSearch} disabled={searching}>
                        <Search className="h-4 w-4" />
                        {searching ? 'Searching...' : 'Search Apollo'}
                      </Button>
                    </div>

                    {/* Results */}
                    {searchResults.length > 0 && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-txt-secondary">
                              {searchResults.length} results
                            </span>
                            <button onClick={toggleSelectAll} className="text-xs text-accent hover:underline">
                              {selectedResults.size === searchResults.filter(p => p.email).length ? 'Deselect all' : 'Select all with email'}
                            </button>
                          </div>
                          <Button
                            variant="primary"
                            onClick={handleImportAndEnroll}
                            disabled={selectedResults.size === 0 || importing}
                          >
                            <UserPlus className="h-4 w-4" />
                            {importing ? 'Importing...' : `Import & Enroll ${selectedResults.size} Prospect(s)`}
                          </Button>
                        </div>

                        <div className="space-y-1">
                          {searchResults.map((person) => {
                            const hasEmail = !!person.email;
                            const isSelected = selectedResults.has(person.id);
                            return (
                              <button
                                key={person.id}
                                disabled={!hasEmail}
                                onClick={() => {
                                  if (!hasEmail) return;
                                  const next = new Set(selectedResults);
                                  if (isSelected) next.delete(person.id); else next.add(person.id);
                                  setSelectedResults(next);
                                }}
                                className={`w-full text-left rounded-lg p-3 transition-colors flex items-center gap-3 ${
                                  !hasEmail ? 'opacity-40 cursor-not-allowed' :
                                  isSelected ? 'bg-accent/10 border border-accent/30' : 'hover:bg-bg-tertiary border border-transparent'
                                }`}
                              >
                                <div className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${
                                  isSelected ? 'bg-accent border-accent' : 'border-border'
                                }`}>
                                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-bg-primary" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-txt-primary truncate">
                                    {person.first_name} {person.last_name || ''}
                                    {!hasEmail && <span className="text-danger text-xs ml-2">(no email)</span>}
                                  </p>
                                  <p className="text-xs text-txt-tertiary truncate">
                                    {person.title} at {person.organization?.name || 'Unknown'}
                                  </p>
                                  {person.organization?.industry && (
                                    <p className="text-[10px] text-accent/70 truncate">{person.organization.industry}</p>
                                  )}
                                </div>
                                {hasEmail && (
                                  <span className="text-[10px] text-success shrink-0">verified</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {searchResults.length === 0 && !searching && (
                      <div className="text-center py-8">
                        <Search className="h-8 w-8 mx-auto mb-2 text-txt-tertiary opacity-30" />
                        <p className="text-sm text-txt-tertiary">Search Apollo to find prospects for this partner cadence</p>
                        <p className="text-xs text-txt-tertiary mt-1">Imported prospects are tagged as "partner" and kept separate from direct prospecting</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-txt-tertiary">
                <p className="text-sm">Select a partner cadence</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
