import { useState, useEffect } from 'react';
import {
  Send,
  CalendarPlus,
  ArrowRightLeft,
  XCircle,
  PauseCircle,
  PlayCircle,
  Mail,
  RefreshCw,
  Inbox as InboxIcon,
  Trash2,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const agentTabs = ['All', 'Megan', 'Lauren', 'Kate', 'Scott'];

const sentimentStyles = {
  positive: 'bg-success/10 text-success',
  neutral: 'bg-bg-tertiary text-txt-tertiary',
  negative: 'bg-danger/10 text-danger',
};

function SentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sentimentStyles[sentiment] || sentimentStyles.neutral}`}
    >
      {sentiment}
    </span>
  );
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export default function Inbox() {
  const [activeTab, setActiveTab] = useState('All');
  const [inboxItems, setInboxItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [aiDraft, setAiDraft] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  async function loadInbox() {
    setLoading(true);
    try {
      const data = await api.getInbox();
      if (data && data.length > 0) {
        // Map API data to component shape
        const mapped = data.map((item) => ({
          id: item.id,
          agentName: item.agent_name || 'Unknown',
          agentFirstName: (item.agent_name || '').split(' ')[0],
          agentId: item.agent_id,
          prospect: {
            name: [item.first_name, item.last_name].filter(Boolean).join(' ') || item.from_email,
            company: item.company || '',
            title: item.title || '',
            email: item.prospect_email || item.from_email,
          },
          prospectId: item.prospect_id,
          fromEmail: item.from_email,
          subject: item.subject,
          preview: stripHtml(item.body || item.body_text || '').slice(0, 120),
          time: formatTime(item.received_at),
          sentiment: item.sentiment,
          actioned: item.actioned,
          actionType: item.action_type,
          unread: !item.actioned,
        }));
        setInboxItems(mapped);
        setSelectedId(mapped[0].id);
      } else {
        setInboxItems([]);
      }
    } catch {
      // API failed
    }
    setLoading(false);
  }

  useEffect(() => {
    loadInbox();
  }, []);

  // Load thread when selection changes
  useEffect(() => {
    if (!selectedId) {
      setSelectedThread(null);
      setAiDraft(null);
      return;
    }
    api.getThread(selectedId)
      .then((data) => {
        if (data && data.thread) {
          setSelectedThread(data.thread);
        } else {
          setSelectedThread([]);
        }
        // Pre-fill reply with AI draft if available
        if (data?.ai_draft_reply) {
          setAiDraft(data.ai_draft_reply);
          // Only pre-fill if reply box is empty
          if (!replyText.trim()) {
            setReplyText(data.ai_draft_reply);
          }
        } else {
          setAiDraft(null);
        }
      })
      .catch(() => {
        setSelectedThread([]);
        setAiDraft(null);
      });
  }, [selectedId]);

  const filtered =
    activeTab === 'All'
      ? inboxItems
      : inboxItems.filter((item) => item.agentFirstName === activeTab);

  const selected = inboxItems.find((item) => item.id === selectedId);

  const [actionFeedback, setActionFeedback] = useState(null);

  const handleAction = async (actionType) => {
    if (!selected) return;
    try {
      const result = await api.actionInbox(selected.id, { action_type: actionType });
      const labels = {
        book_appointment: 'Appointment booked',
        hand_off: 'Handed off to Jonathan',
        disqualify: 'Prospect disqualified',
      };
      setActionFeedback(labels[actionType] || 'Action applied');
      setTimeout(() => setActionFeedback(null), 3000);
      await loadInbox();
    } catch {
      setActionFeedback('Action failed');
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation(); // Don't select the email when clicking delete
    try {
      await fetch(`/api/inbox/${id}`, { method: 'DELETE' });
      // If we deleted the selected email, clear selection
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedThread(null);
      }
      await loadInbox();
    } catch {
      // Delete failed
    }
  };

  const handleRegenerateDraft = async () => {
    if (!selected || regenerating) return;
    setRegenerating(true);
    try {
      const result = await api.regenerateDraft(selected.id);
      if (result?.ai_draft_reply) {
        setAiDraft(result.ai_draft_reply);
        setReplyText(result.ai_draft_reply);
      }
    } catch {
      // Regeneration failed
    }
    setRegenerating(false);
  };

  const handleSendReply = async () => {
    if (!selected || !replyText.trim()) return;
    try {
      await fetch(`/api/inbox/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      setReplyText('');
      // Reload thread
      const data = await api.getThread(selected.id);
      if (data?.thread) setSelectedThread(data.thread);
    } catch {
      // Send failed
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Agent filter tabs + refresh */}
      <div className="flex items-center justify-between border-b border-border bg-bg-primary px-5 py-3">
        <div className="flex items-center gap-1">
          {agentTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                const firstMatch =
                  tab === 'All'
                    ? inboxItems[0]
                    : inboxItems.find((i) => i.agentFirstName === tab);
                if (firstMatch) setSelectedId(firstMatch.id);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-accent text-bg-primary'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={loadInbox}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left panel - Inbox list */}
        <aside className="w-96 shrink-0 border-r border-border overflow-y-auto bg-bg-primary">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`group w-full text-left p-4 border-b border-border transition-colors cursor-pointer ${
                selectedId === item.id ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <AgentAvatar name={item.agentName} status="active" size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      {item.unread && (
                        <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${
                          item.unread ? 'font-semibold text-txt-primary' : 'text-txt-primary'
                        }`}
                      >
                        {item.prospect.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-txt-tertiary">
                        {item.time}
                      </span>
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="text-txt-tertiary hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-txt-secondary truncate">
                    {item.prospect.company}{item.prospect.company && item.prospect.title ? ' \u00B7 ' : ''}{item.prospect.title}
                  </p>
                  <p className="text-xs text-txt-tertiary mt-1 truncate">{item.subject}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-txt-tertiary truncate pr-2">{item.preview}</p>
                    <SentimentBadge sentiment={item.sentiment} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="p-8 text-center">
              <InboxIcon className="h-10 w-10 mx-auto mb-3 text-txt-tertiary opacity-30" />
              <p className="text-sm text-txt-tertiary">No replies yet</p>
              <p className="text-xs text-txt-tertiary mt-1">Replies from prospects will appear here</p>
            </div>
          )}
          {loading && (
            <div className="p-8 text-center">
              <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-txt-tertiary">Loading inbox...</p>
            </div>
          )}
        </aside>

        {/* Right panel - Conversation thread */}
        <main className="flex-1 flex flex-col min-h-0 bg-bg-primary">
          {selected ? (
            <>
              {/* Thread header */}
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-bold text-txt-primary">
                  {selected.prospect.name}
                </h2>
                <p className="text-xs text-txt-secondary mt-0.5">
                  {selected.prospect.title}{selected.prospect.title && selected.prospect.company ? ' at ' : ''}{selected.prospect.company}
                </p>
                <p className="text-xs text-txt-tertiary mt-0.5">
                  {selected.fromEmail} &middot; Agent: {selected.agentName}
                </p>
              </div>

              {/* Thread messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {selectedThread && selectedThread.length > 0 ? (
                  selectedThread.map((msg, idx) => (
                    <div
                      key={`${msg.direction}-${msg.id || idx}`}
                      className={`rounded-xl border p-4 ${
                        msg.direction === 'sent'
                          ? 'border-border bg-bg-secondary ml-8'
                          : 'border-accent/30 bg-accent/5 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-txt-primary">
                          {msg.direction === 'sent' ? selected.agentName : selected.prospect.name}
                        </span>
                        <span className="text-[10px] text-txt-tertiary">
                          {formatDate(msg.sent_at)}
                        </span>
                      </div>
                      <p className="text-xs text-txt-tertiary mb-2">{msg.subject}</p>
                      <div
                        className="text-sm text-txt-secondary leading-relaxed [&_p]:mb-2"
                        dangerouslySetInnerHTML={{ __html: msg.body_html || msg.body_text || msg.body || '' }}
                      />
                    </div>
                  ))
                ) : (
                  <div
                    className="rounded-xl border border-accent/30 bg-accent/5 mr-8 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-txt-primary">
                        {selected.prospect.name}
                      </span>
                      <span className="text-[10px] text-txt-tertiary">{selected.time}</span>
                    </div>
                    <p className="text-xs text-txt-tertiary mb-2">{selected.subject}</p>
                    <p className="text-sm text-txt-secondary leading-relaxed">
                      {selected.preview}
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="border-t border-border px-6 py-3">
                {actionFeedback && (
                  <div className="mb-2 rounded-lg bg-success/10 text-success px-4 py-2 text-sm font-medium">
                    {actionFeedback}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="primary" onClick={() => handleAction('book_appointment')}>
                    <CalendarPlus className="h-4 w-4" />
                    Book Appointment
                  </Button>
                  <Button variant="secondary" onClick={() => handleAction('hand_off')}>
                    <ArrowRightLeft className="h-4 w-4" />
                    Hand off to Jonathan
                  </Button>
                  <Button variant="danger" onClick={() => handleAction('disqualify')}>
                    <XCircle className="h-4 w-4" />
                    Disqualify
                  </Button>
                  <Button variant="ghost" onClick={(e) => handleDelete(selected.id, e)} className="text-danger">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Reply composer */}
              <div className="border-t border-border px-6 py-4 bg-bg-secondary">
                {aiDraft && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span className="text-[11px] font-medium text-accent">AI Draft</span>
                    <button
                      onClick={handleRegenerateDraft}
                      disabled={regenerating}
                      className="flex items-center gap-1 text-[11px] text-txt-tertiary hover:text-accent transition-colors ml-auto"
                    >
                      <RotateCcw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
                      {regenerating ? 'Generating...' : 'Regenerate'}
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <textarea
                    rows={4}
                    placeholder="Write a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-bg-tertiary px-4 py-3 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  />
                  <Button variant="primary" className="shrink-0" onClick={handleSendReply}>
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-txt-tertiary">
              <Mail className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">
                {inboxItems.length === 0 ? 'No replies yet' : 'Select a conversation'}
              </p>
              {inboxItems.length === 0 && (
                <p className="text-xs mt-1">When prospects reply, they'll appear here</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
