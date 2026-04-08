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

// No mock data — sequences loaded from API

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
  const [sequences, setSequences] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    async function loadSequences() {
      try {
        const list = await api.getSequences();
        if (!list || list.length === 0) return;

        // Fetch full detail (with steps) for each sequence
        const full = await Promise.all(
          list.map(async (seq) => {
            try {
              const detail = await api.getSequence(seq.id);
              const steps = (detail.steps || []).map((s) => ({
                id: s.id,
                stepNumber: s.step_number || s.step_order || s.stepNumber,
                delayDays: s.delay_days ?? s.delayDays ?? 0,
                subject: s.subject_line || s.subject_template || s.subject || '',
                body: s.body_html || s.body_template || s.body_text || s.body || '',
                openRate: parseFloat(s.open_rate) || 0,
                replyRate: parseFloat(s.reply_rate) || 0,
                positiveRate: parseFloat(s.positive_reply_rate) || 0,
                aiFlag: s.ai_flag || null,
              }));
              return {
                ...seq,
                steps,
                agents: seq.step_count !== undefined ? (detail.agents || 0) : (seq.agents || 0),
              };
            } catch {
              return { ...seq, steps: [], agents: 0 };
            }
          })
        );

        // Get agent assignment counts
        for (const seq of full) {
          try {
            const res = await fetch(`/api/agents`);
            const agents = await res.json();
            // Count would come from sequence_assignments, but for now use a simple count
            break; // Only need to fetch once
          } catch { /* skip */ }
        }

        setSequences(full);
        setSelectedId(full[0].id);
      } catch {
        // API failed
      }
    }
    loadSequences();
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
                  {(seq.steps || []).length} steps
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
                  {selected.agents || 1} agent{(selected.agents || 1) !== 1 ? 's' : ''} assigned
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
