import { useState, useEffect } from 'react';
import {
  Send,
  CalendarPlus,
  ArrowRightLeft,
  XCircle,
  PauseCircle,
  PlayCircle,
  Mail,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const agentTabs = ['All', 'Megan', 'Lauren', 'Kate', 'Scott'];

const mockInbox = [
  {
    id: 1,
    agent: 'Megan',
    agentStatus: 'active',
    prospect: { name: 'David Chen', company: 'Meridian Health', title: 'CIO' },
    subject: 'Re: Quick question about Meridian Health telecom spend',
    preview: 'Thanks for reaching out. We are actually reviewing our telecom contracts this quarter...',
    time: '9:14 AM',
    sentiment: 'positive',
    unread: true,
    thread: [
      {
        id: 't1',
        direction: 'outbound',
        from: 'Megan Clarke',
        to: 'David Chen',
        date: 'Apr 1, 2026 8:00 AM',
        subject: 'Quick question about Meridian Health telecom spend',
        body: 'Hi David,\n\nI noticed Meridian Health operates across multiple locations and was curious how you\'re managing telecom costs across sites.\n\nWe helped a similar org save $2.4M last year.\n\nWorth a quick call?\n\nBest,\nMegan',
      },
      {
        id: 't2',
        direction: 'inbound',
        from: 'David Chen',
        to: 'Megan Clarke',
        date: 'Apr 2, 2026 9:14 AM',
        subject: 'Re: Quick question about Meridian Health telecom spend',
        body: 'Thanks for reaching out. We are actually reviewing our telecom contracts this quarter and would be open to learning more.\n\nCan you send over some details on what that audit looked like for the other health system?\n\nDavid Chen\nCIO, Meridian Health',
      },
    ],
    sequencePaused: false,
  },
  {
    id: 2,
    agent: 'Lauren',
    agentStatus: 'active',
    prospect: { name: 'Sarah Kim', company: 'Apex Financial', title: 'VP of Operations' },
    subject: 'Re: The $2.4M question',
    preview: 'Not interested at this time. Please remove me from your list.',
    time: '8:42 AM',
    sentiment: 'negative',
    unread: true,
    thread: [
      {
        id: 't3',
        direction: 'outbound',
        from: 'Lauren Mitchell',
        to: 'Sarah Kim',
        date: 'Mar 30, 2026 9:00 AM',
        subject: 'The $2.4M question',
        body: 'Hi Sarah,\n\nMost financial services firms we audit are overpaying on telecom by 20-40%. That usually means $1-3M in recoverable spend.\n\nWould it be worth 15 minutes to see if Apex Financial falls in that range?\n\nBest,\nLauren',
      },
      {
        id: 't4',
        direction: 'inbound',
        from: 'Sarah Kim',
        to: 'Lauren Mitchell',
        date: 'Apr 2, 2026 8:42 AM',
        subject: 'Re: The $2.4M question',
        body: 'Not interested at this time. Please remove me from your list.\n\nSarah Kim\nVP of Operations, Apex Financial',
      },
    ],
    sequencePaused: true,
  },
  {
    id: 3,
    agent: 'Kate',
    agentStatus: 'active',
    prospect: { name: 'Michael Torres', company: 'Summit Partners', title: 'CFO' },
    subject: 'Re: Cutting telecom costs at Summit Partners',
    preview: 'Interesting timing - we were just discussing this internally. What does the process look like?',
    time: 'Yesterday',
    sentiment: 'positive',
    unread: false,
    thread: [
      {
        id: 't5',
        direction: 'outbound',
        from: 'Kate Anderson',
        to: 'Michael Torres',
        date: 'Mar 29, 2026 10:00 AM',
        subject: 'Cutting telecom costs at Summit Partners',
        body: 'Hi Michael,\n\nI work with CFOs at financial services firms who are looking to reduce operational overhead. Telecom is often the lowest-hanging fruit.\n\nWould you be open to a quick conversation?\n\nBest,\nKate',
      },
      {
        id: 't6',
        direction: 'inbound',
        from: 'Michael Torres',
        to: 'Kate Anderson',
        date: 'Apr 1, 2026 3:22 PM',
        subject: 'Re: Cutting telecom costs at Summit Partners',
        body: 'Interesting timing - we were just discussing this internally. What does the process look like?\n\nMichael Torres\nCFO, Summit Partners',
      },
    ],
    sequencePaused: false,
  },
  {
    id: 4,
    agent: 'Scott',
    agentStatus: 'active',
    prospect: { name: 'Jennifer Walsh', company: 'Northside Medical Group', title: 'IT Director' },
    subject: 'Re: Quick question about Northside Medical Group telecom spend',
    preview: 'Can you clarify what types of telecom services you audit? We have a mix of legacy and VoIP.',
    time: 'Yesterday',
    sentiment: 'neutral',
    unread: false,
    thread: [
      {
        id: 't7',
        direction: 'outbound',
        from: 'Scott Reynolds',
        to: 'Jennifer Walsh',
        date: 'Mar 28, 2026 8:30 AM',
        subject: 'Quick question about Northside Medical Group telecom spend',
        body: 'Hi Jennifer,\n\nI noticed Northside Medical Group operates across multiple locations and was curious how you\'re managing telecom costs across sites.\n\nWe helped a similar org save $2.4M last year.\n\nWorth a quick call?\n\nBest,\nScott',
      },
      {
        id: 't8',
        direction: 'inbound',
        from: 'Jennifer Walsh',
        to: 'Scott Reynolds',
        date: 'Apr 1, 2026 11:05 AM',
        subject: 'Re: Quick question about Northside Medical Group telecom spend',
        body: 'Can you clarify what types of telecom services you audit? We have a mix of legacy and VoIP systems across 8 locations.\n\nJennifer Walsh\nIT Director, Northside Medical Group',
      },
    ],
    sequencePaused: false,
  },
];

const sentimentStyles = {
  positive: 'bg-success/10 text-success',
  neutral: 'bg-bg-tertiary text-txt-tertiary',
  negative: 'bg-danger/10 text-danger',
};

function SentimentBadge({ sentiment }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sentimentStyles[sentiment]}`}
    >
      {sentiment}
    </span>
  );
}

export default function Inbox() {
  const [activeTab, setActiveTab] = useState('All');
  const [inboxItems, setInboxItems] = useState(mockInbox);
  const [selectedId, setSelectedId] = useState(mockInbox[0].id);

  useEffect(() => {
    api.getInbox()
      .then((data) => {
        if (data && data.length > 0) {
          setInboxItems(data);
          setSelectedId(data[0].id);
        }
      })
      .catch(() => {
        // API failed — keep using mock data
      });
  }, []);

  const filtered =
    activeTab === 'All'
      ? inboxItems
      : inboxItems.filter((item) => item.agent === activeTab);

  const selected = inboxItems.find((item) => item.id === selectedId);

  const handleAction = async (action) => {
    if (!selected) return;
    try {
      await api.actionInbox(selected.id, { action });
    } catch {
      // Action failed silently — could add toast notification here
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Agent filter tabs */}
      <div className="flex items-center gap-1 border-b border-border bg-bg-primary px-5 py-3">
        {agentTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              const firstMatch =
                tab === 'All'
                  ? inboxItems[0]
                  : inboxItems.find((i) => i.agent === tab);
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

      <div className="flex flex-1 min-h-0">
        {/* Left panel - Inbox list */}
        <aside className="w-96 shrink-0 border-r border-border overflow-y-auto bg-bg-primary">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left p-4 border-b border-border transition-colors ${
                selectedId === item.id ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <AgentAvatar name={item.agent} status={item.agentStatus} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      {item.unread && (
                        <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${
                          item.unread
                            ? 'font-semibold text-txt-primary'
                            : 'text-txt-primary'
                        }`}
                      >
                        {item.prospect.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-txt-tertiary shrink-0 ml-2">
                      {item.time}
                    </span>
                  </div>
                  <p className="text-xs text-txt-secondary truncate">
                    {item.prospect.company} &middot; {item.prospect.title}
                  </p>
                  <p className="text-xs text-txt-tertiary mt-1 truncate">{item.subject}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-txt-tertiary truncate pr-2">{item.preview}</p>
                    <SentimentBadge sentiment={item.sentiment} />
                  </div>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-txt-tertiary">
              No conversations for this agent
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
                  {selected.prospect.title} at {selected.prospect.company}
                </p>
              </div>

              {/* Thread messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {selected.thread.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl border p-4 ${
                      msg.direction === 'outbound'
                        ? 'border-border bg-bg-secondary ml-8'
                        : 'border-accent/30 bg-accent/5 mr-8'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-txt-primary">
                        {msg.from}
                      </span>
                      <span className="text-[10px] text-txt-tertiary">{msg.date}</span>
                    </div>
                    <p className="text-xs text-txt-tertiary mb-2">
                      To: {msg.to} &middot; {msg.subject}
                    </p>
                    <p className="text-sm text-txt-secondary whitespace-pre-line leading-relaxed">
                      {msg.body}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="border-t border-border px-6 py-3">
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
                  <Button variant="ghost">
                    {selected.sequencePaused ? (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Continue Sequence
                      </>
                    ) : (
                      <>
                        <PauseCircle className="h-4 w-4" />
                        Pause Sequence
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Reply composer */}
              <div className="border-t border-border px-6 py-4 bg-bg-secondary">
                <div className="flex items-end gap-3">
                  <textarea
                    rows={3}
                    placeholder="Write a reply..."
                    className="flex-1 rounded-lg border border-border bg-bg-tertiary px-4 py-3 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  />
                  <Button variant="primary" className="shrink-0">
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-txt-tertiary">
              <Mail className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Select a conversation</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
