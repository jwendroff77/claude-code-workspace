import { useState, useEffect } from 'react';
import {
  Send,
  Mail,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Building2,
  Eye,
  CheckCircle2,
  Filter,
  Search,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const agentColors = ['text-cyan-400', 'text-violet-400', 'text-amber-400', 'text-emerald-400'];

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

export default function SentEmails() {
  const [agents, setAgents] = useState([]);
  const [sentByAgent, setSentByAgent] = useState({});
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const agentList = await api.getAgents();
      const outbound = agentList.filter((a) => a.role === 'outbound');
      setAgents(outbound);


      const results = {};
      let firstEmail = null;
      for (const agent of outbound) {
        const res = await fetch(`/api/agents/${agent.id}/sent`);
        const data = await res.json();
        results[agent.id] = data;
        if (!firstEmail && data.length > 0) firstEmail = data[0];
      }
      setSentByAgent(results);
      if (firstEmail) setSelectedEmail(firstEmail);
    } catch (err) {
      console.error('Failed to load sent emails:', err);
    }
    setLoading(false);
  }

  // Helper to look up agent info
  function getAgentInfo(agentId) {
    const id = Number(agentId);
    const agent = agents.find((a) => a.id === id);
    if (agent) {
      const idx = agents.indexOf(agent);
      return { name: agent.name, title: agent.title, color: agentColors[idx % agentColors.length] };
    }
    return { name: 'Unknown', title: '', color: 'text-txt-tertiary' };
  }

  // Flatten all emails across agents and filter
  const allEmails = selectedAgent === 'all'
    ? Object.values(sentByAgent).flat()
    : sentByAgent[selectedAgent] || [];

  const filteredEmails = searchTerm
    ? allEmails.filter(
        (e) =>
          (e.first_name + ' ' + e.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.to_email || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allEmails;

  const sortedEmails = [...filteredEmails].sort(
    (a, b) => new Date(b.sent_at) - new Date(a.sent_at)
  );

  const totalSent = Object.values(sentByAgent).flat().length;

  return (
    <div className="flex flex-col h-full min-h-0 -m-6">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border bg-bg-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <Send className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-txt-primary">Sent Emails</h1>
            <p className="text-xs text-txt-tertiary">
              {totalSent} emails sent across {agents.length} agents
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* Agent filter + search */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-primary px-6 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setSelectedAgent('all');
              const all = Object.values(sentByAgent).flat();
              if (all.length > 0) setSelectedEmail(all[0]);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedAgent === 'all'
                ? 'bg-accent text-bg-primary'
                : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary'
            }`}
          >
            All Agents
            <span className="ml-1.5 text-[10px] opacity-70">{totalSent}</span>
          </button>
          {agents.map((agent) => {
            const count = (sentByAgent[agent.id] || []).length;
            return (
              <button
                key={agent.id}
                onClick={() => {
                  setSelectedAgent(agent.id);
                  const emails = sentByAgent[agent.id] || [];
                  if (emails.length > 0) setSelectedEmail(emails[0]);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedAgent === agent.id
                    ? 'bg-accent text-bg-primary'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary'
                }`}
              >
                {agent.name.split(' ')[0]}
                <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-tertiary" />
          <input
            type="text"
            placeholder="Search prospects, companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-border bg-bg-tertiary pl-9 pr-4 py-1.5 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-txt-tertiary">Loading sent emails...</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Email list */}
          <aside className="w-[420px] shrink-0 border-r border-border overflow-y-auto bg-bg-primary">
            {sortedEmails.map((email) => {
              const agentInfo = getAgentInfo(email.agent_id) || { name: 'Unknown', title: '' };
              const isSelected = selectedEmail?.id === email.id;
              return (
                <button
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`w-full text-left p-4 border-b border-border transition-colors ${
                    isSelected ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AgentAvatar name={agentInfo.name} status="active" size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold text-txt-primary truncate">
                          {email.first_name} {email.last_name}
                        </span>
                        <span className="text-[10px] text-txt-tertiary shrink-0 ml-2">
                          {formatTime(email.sent_at)}
                        </span>
                      </div>
                      <p className="text-xs text-txt-secondary truncate">
                        {email.company} &middot; <span className={agentInfo.color}>{agentInfo.name.split(' ')[0]}</span>
                      </p>
                      <p className="text-xs text-txt-tertiary mt-1 truncate">{email.subject}</p>
                      <p className="text-[11px] text-txt-tertiary mt-1 truncate opacity-60">
                        {stripHtml(email.body).slice(0, 100)}...
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {sortedEmails.length === 0 && (
              <div className="p-8 text-center text-sm text-txt-tertiary">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No sent emails found
              </div>
            )}
          </aside>

          {/* Right panel - Email preview */}
          <main className="flex-1 flex flex-col min-h-0 bg-bg-primary">
            {selectedEmail ? (
              <>
                {/* Email header */}
                <div className="border-b border-border px-6 py-5">
                  <h2 className="font-display text-base font-bold text-txt-primary mb-2">
                    {selectedEmail.subject}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-txt-secondary">
                    <div className="flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-accent" />
                      <span className="font-medium text-txt-primary">
                        {getAgentInfo(selectedEmail.agent_id)?.name || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>
                        {selectedEmail.first_name} {selectedEmail.last_name}
                        <span className="text-txt-tertiary ml-1">
                          &lt;{selectedEmail.to_email}&gt;
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-txt-tertiary mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {selectedEmail.company}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(selectedEmail.sent_at)}
                    </div>
                  </div>
                </div>

                {/* Email body */}
                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="max-w-2xl">
                    <div
                      className="rounded-xl border border-border bg-bg-secondary p-6"
                    >
                      <div
                        className="text-sm text-txt-secondary leading-relaxed [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mb-1 [&_br]:leading-6"
                        dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                      />
                    </div>

                    {/* Delivery status */}
                    <div className="mt-4 flex items-center gap-2 text-xs text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Delivered via Microsoft Graph API
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-txt-tertiary">
                <Mail className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">Select an email to preview</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
