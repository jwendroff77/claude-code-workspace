import { useState, useEffect } from 'react';
import {
  Plus,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Layers,
  Users,
} from 'lucide-react';
import StatusBadge from '../components/shared/StatusBadge';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const mockSequences = [
  {
    id: 1,
    name: 'Q1 Healthcare Outreach',
    description: 'Targeting healthcare CIOs and IT Directors',
    status: 'active',
    agents: 3,
    steps: [
      {
        id: 1,
        stepNumber: 1,
        delayDays: 1,
        subject: 'Quick question about {{company}} telecom spend',
        body: 'Hi {{firstName}},\n\nI noticed {{company}} operates across multiple locations and was curious how you\'re managing telecom costs across sites.\n\nWe helped a similar org save $2.4M last year.\n\nWorth a quick call?',
        openRate: 42.3,
        replyRate: 5.1,
        positiveRate: 3.2,
        aiFlag: 'good',
      },
      {
        id: 2,
        stepNumber: 2,
        delayDays: 3,
        subject: 'Re: Quick question about {{company}} telecom spend',
        body: '{{firstName}},\n\nDidn\'t want this to get buried in your inbox. I know telecom isn\'t always top of mind, but the savings are hard to ignore.\n\nHappy to share the audit we did for a 12-location health system.\n\nBest,',
        openRate: 38.1,
        replyRate: 3.8,
        positiveRate: 2.1,
        aiFlag: 'good',
      },
      {
        id: 3,
        stepNumber: 3,
        delayDays: 7,
        subject: 'The $2.4M question',
        body: 'Hi {{firstName}},\n\nMost healthcare systems we audit are overpaying on telecom by 20-40%. That usually means $1-3M in recoverable spend.\n\nWould it be worth 15 minutes to see if {{company}} falls in that range?',
        openRate: 28.5,
        replyRate: 1.2,
        positiveRate: 0.4,
        aiFlag: 'warning',
      },
      {
        id: 4,
        stepNumber: 4,
        delayDays: 14,
        subject: 'Last note',
        body: '{{firstName}},\n\nI\'ll keep this brief \u2014 if telecom cost reduction isn\'t a priority right now, no worries at all.\n\nBut if it is, I\'d love to share what we found for similar orgs.\n\nEither way, wishing you a great quarter.',
        openRate: 31.2,
        replyRate: 4.5,
        positiveRate: 3.1,
        aiFlag: 'good',
      },
    ],
  },
  {
    id: 2,
    name: 'Financial Services - CFO Track',
    description: 'CFOs at mid-market financial institutions',
    status: 'draft',
    agents: 0,
    steps: [
      {
        id: 5,
        stepNumber: 1,
        delayDays: 1,
        subject: 'Cutting telecom costs at {{company}}',
        body: 'Hi {{firstName}},\n\nI work with CFOs at financial services firms who are looking to reduce operational overhead. Telecom is often the lowest-hanging fruit.\n\nWould you be open to a quick conversation?',
        openRate: 0,
        replyRate: 0,
        positiveRate: 0,
        aiFlag: null,
      },
    ],
  },
];

function AiFlagIcon({ flag }) {
  if (flag === 'good') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (flag === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  }
  if (flag === 'alert') {
    return <AlertCircle className="h-4 w-4 text-danger" />;
  }
  return <span className="h-4 w-4 block rounded-full border border-border" />;
}

function StepCard({ step, onRewrite }) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-txt-primary">
          Step {step.stepNumber} &mdash; Day {step.delayDays}
        </h4>
        <div className="flex items-center gap-2 text-xs text-txt-tertiary">
          <span>AI Coaching</span>
          <AiFlagIcon flag={step.aiFlag} />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs text-txt-tertiary mb-1.5">Subject Line</label>
        <input
          type="text"
          defaultValue={step.subject}
          className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs text-txt-tertiary mb-1.5">Email Body</label>
        <textarea
          rows={4}
          defaultValue={step.body}
          className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-none font-body"
        />
      </div>

      {/* Metrics + AI Rewrite */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5 text-xs">
          <div>
            <span className="text-txt-tertiary">Open </span>
            <span className="text-txt-primary font-medium">
              {step.openRate > 0 ? `${step.openRate}%` : '\u2014'}
            </span>
          </div>
          <div>
            <span className="text-txt-tertiary">Reply </span>
            <span className="text-txt-primary font-medium">
              {step.replyRate > 0 ? `${step.replyRate}%` : '\u2014'}
            </span>
          </div>
          <div>
            <span className="text-txt-tertiary">Positive </span>
            <span className={`font-medium ${step.positiveRate >= 2 ? 'text-success' : step.positiveRate > 0 ? 'text-warning' : 'text-txt-tertiary'}`}>
              {step.positiveRate > 0 ? `${step.positiveRate}%` : '\u2014'}
            </span>
          </div>
        </div>
        <Button variant="ghost" className="text-accent text-xs gap-1.5" onClick={() => onRewrite && onRewrite(step)}>
          <Sparkles className="h-3.5 w-3.5" />
          AI Rewrite
        </Button>
      </div>
    </div>
  );
}

export default function CadenceBuilder() {
  const [sequences, setSequences] = useState(mockSequences);
  const [selectedId, setSelectedId] = useState(mockSequences[0].id);

  useEffect(() => {
    api.getSequences()
      .then((data) => {
        if (data && data.length > 0) {
          setSequences(data);
          setSelectedId(data[0].id);
        }
      })
      .catch(() => {
        // API failed — keep using mock data
      });
  }, []);

  const selected = sequences.find((s) => s.id === selectedId);

  const handleRewrite = async (step) => {
    try {
      const result = await api.rewriteStep({ stepId: step.id, subject: step.subject, body: step.body });
      if (result) {
        setSequences((prev) =>
          prev.map((seq) => ({
            ...seq,
            steps: seq.steps.map((s) =>
              s.id === step.id ? { ...s, ...result } : s
            ),
          }))
        );
      }
    } catch {
      // Rewrite failed silently
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel - Sequence list */}
      <aside className="w-80 shrink-0 border-r border-border bg-bg-primary overflow-y-auto">
        <div className="p-5 border-b border-border">
          <h2 className="font-display text-lg font-bold text-txt-primary">Cadences</h2>
          <p className="text-xs text-txt-tertiary mt-1">Manage your email sequences</p>
        </div>
        <div className="p-3 space-y-1">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              onClick={() => setSelectedId(seq.id)}
              className={`w-full text-left rounded-lg p-3 transition-colors ${
                selectedId === seq.id
                  ? 'bg-bg-tertiary border border-border'
                  : 'hover:bg-bg-secondary border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display text-sm font-semibold text-txt-primary truncate pr-2">
                  {seq.name}
                </span>
                <ChevronRight className="h-4 w-4 text-txt-tertiary shrink-0" />
              </div>
              <div className="flex items-center gap-3 text-xs text-txt-tertiary">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {seq.steps.length} steps
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {seq.agents} agents
                </span>
                <StatusBadge status={seq.status} />
              </div>
            </button>
          ))}
        </div>
        <div className="p-3">
          <Button variant="secondary" className="w-full">
            <Plus className="h-4 w-4" />
            New Cadence
          </Button>
        </div>
      </aside>

      {/* Right panel - Sequence editor */}
      <main className="flex-1 overflow-y-auto bg-bg-primary">
        {selected ? (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Sequence header */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-txt-tertiary">
                  {selected.agents} agent{selected.agents !== 1 ? 's' : ''} assigned
                </span>
              </div>
              <div>
                <label className="block text-xs text-txt-tertiary mb-1.5">Sequence Name</label>
                <input
                  type="text"
                  defaultValue={selected.name}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-2.5 font-display text-lg font-bold text-txt-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-txt-tertiary mb-1.5">Description</label>
                <input
                  type="text"
                  defaultValue={selected.description}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm text-txt-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Steps flow */}
            <div className="space-y-3">
              {selected.steps.map((step, idx) => (
                <div key={step.id}>
                  {idx > 0 && (
                    <div className="flex items-center justify-center py-2">
                      <div className="h-6 w-px bg-border" />
                    </div>
                  )}
                  <StepCard step={step} onRewrite={handleRewrite} />
                </div>
              ))}
            </div>

            {/* Add Step */}
            <div className="flex justify-center pt-2">
              <Button variant="secondary">
                <Plus className="h-4 w-4" />
                Add Step
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-txt-tertiary text-sm">Select a cadence to edit</p>
          </div>
        )}
      </main>
    </div>
  );
}
