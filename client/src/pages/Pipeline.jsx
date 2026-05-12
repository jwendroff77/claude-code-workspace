import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Mail,
  Reply,
  MessageSquare,
  CalendarCheck,
  ArrowRightLeft,
  XCircle,
  Clock,
  GripVertical,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';

const columns = [
  { key: 'in_sequence', label: 'In Sequence', icon: Mail, accentClass: 'text-txt-tertiary' },
  { key: 'replied', label: 'Replied', icon: Reply, accentClass: 'text-accent' },
  { key: 'engaged', label: 'Engaged', icon: MessageSquare, accentClass: 'text-warning' },
  { key: 'appointment', label: 'Appointment Booked', icon: CalendarCheck, accentClass: 'text-success' },
  { key: 'handed_off', label: 'Handed to Jonathan', icon: ArrowRightLeft, accentClass: 'text-accent' },
  { key: 'disqualified', label: 'Disqualified', icon: XCircle, accentClass: 'text-danger' },
];

// No mock data — pipeline loaded from API
const emptyPipeline = {
  in_sequence: [],
  replied: [],
  engaged: [],
  appointment: [],
  handed_off: [],
  disqualified: [],
};

function ProspectCard({ prospect }) {
  const name = [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || '—';
  const daysInStage = prospect.updated_at
    ? Math.floor((Date.now() - new Date(prospect.updated_at)) / 86400000)
    : 0;
  const lastTouch = prospect.updated_at
    ? new Date(prospect.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const score = prospect.intent_score;
  const isHot = score != null && score >= 60;

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-3 space-y-2.5 hover:border-accent/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-medium text-txt-primary truncate">{name}</p>
            {isHot && (
              <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold text-success uppercase tracking-wide">
                Hot
              </span>
            )}
          </div>
          <p className="text-xs text-txt-secondary truncate">{prospect.title}</p>
          <p className="text-xs text-txt-tertiary truncate">{prospect.company}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <AgentAvatar name={prospect.agent_name} status="active" size="sm" />
          {score != null && (
            <span className={`text-[10px] font-mono font-bold tabular-nums ${score >= 60 ? 'text-success' : score >= 30 ? 'text-warning' : 'text-txt-tertiary'}`}>
              {score}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-txt-tertiary">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {daysInStage}d in stage
        </span>
        <span>{lastTouch}</span>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [pipelineData, setPipelineData] = useState(emptyPipeline);

  useEffect(() => {
    api.getPipeline()
      .then((data) => setPipelineData(data))
      .catch(() => {
        // Keep mock data as fallback
      });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-bg-primary px-6 py-4">
        <h1 className="font-display text-xl font-bold text-txt-primary">Pipeline</h1>
        <p className="text-xs text-txt-secondary mt-1">
          Track prospects through every stage of the sales process
        </p>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max gap-4 p-5">
          {columns.map((col) => {
            const Icon = col.icon;
            const cards = (pipelineData[col.key] || []).slice().sort((a, b) => (b.intent_score || 0) - (a.intent_score || 0));
            return (
              <div
                key={col.key}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-bg-primary"
              >
                {/* Column header */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Icon className={`h-4 w-4 ${col.accentClass}`} />
                  <h3 className="text-sm font-semibold text-txt-primary">{col.label}</h3>
                  <span className="ml-auto rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-mono text-txt-secondary">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {cards.map((prospect) => (
                    <ProspectCard key={prospect.id} prospect={prospect} />
                  ))}
                  {cards.length === 0 && (
                    <p className="py-8 text-center text-xs text-txt-tertiary">No prospects</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
