import { useState } from 'react';
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

const mockPipeline = {
  in_sequence: [
    { id: 1, name: 'Rachel Green', title: 'VP of IT', company: 'Baystate Health', agent: 'Megan', agentStatus: 'active', daysInStage: 2, lastTouch: 'Apr 2, 2026' },
    { id: 2, name: 'Tom Bradley', title: 'CTO', company: 'Lakewood Systems', agent: 'Lauren', agentStatus: 'active', daysInStage: 5, lastTouch: 'Mar 30, 2026' },
    { id: 3, name: 'Nina Patel', title: 'IT Director', company: 'Cornerstone Health', agent: 'Kate', agentStatus: 'active', daysInStage: 1, lastTouch: 'Apr 3, 2026' },
    { id: 4, name: 'Greg Olsen', title: 'CFO', company: 'Pacific Mutual', agent: 'Scott', agentStatus: 'active', daysInStage: 8, lastTouch: 'Mar 27, 2026' },
  ],
  replied: [
    { id: 5, name: 'David Chen', title: 'CIO', company: 'Meridian Health', agent: 'Megan', agentStatus: 'active', daysInStage: 1, lastTouch: 'Apr 2, 2026' },
    { id: 6, name: 'Jennifer Walsh', title: 'IT Director', company: 'Northside Medical', agent: 'Scott', agentStatus: 'active', daysInStage: 2, lastTouch: 'Apr 1, 2026' },
    { id: 7, name: 'Carlos Mendez', title: 'VP Operations', company: 'Unity Healthcare', agent: 'Lauren', agentStatus: 'active', daysInStage: 3, lastTouch: 'Mar 31, 2026' },
  ],
  engaged: [
    { id: 8, name: 'Michael Torres', title: 'CFO', company: 'Summit Partners', agent: 'Kate', agentStatus: 'active', daysInStage: 2, lastTouch: 'Apr 1, 2026' },
    { id: 9, name: 'Lisa Park', title: 'Director of Finance', company: 'Crestview Capital', agent: 'Megan', agentStatus: 'active', daysInStage: 4, lastTouch: 'Mar 30, 2026' },
  ],
  appointment: [
    { id: 10, name: 'Robert Huang', title: 'CIO', company: 'Valley Medical Center', agent: 'Lauren', agentStatus: 'active', daysInStage: 1, lastTouch: 'Apr 3, 2026' },
    { id: 11, name: 'Amanda Foster', title: 'VP of Technology', company: 'Horizon Health', agent: 'Kate', agentStatus: 'active', daysInStage: 3, lastTouch: 'Apr 1, 2026' },
    { id: 12, name: 'Brian Wright', title: 'CFO', company: 'Atlas Financial', agent: 'Scott', agentStatus: 'active', daysInStage: 5, lastTouch: 'Mar 29, 2026' },
  ],
  handed_off: [
    { id: 13, name: 'Sandra Miller', title: 'COO', company: 'Pinnacle Health', agent: 'Megan', agentStatus: 'active', daysInStage: 2, lastTouch: 'Apr 2, 2026' },
    { id: 14, name: 'Jason Lee', title: 'CTO', company: 'Riverbank Financial', agent: 'Lauren', agentStatus: 'active', daysInStage: 6, lastTouch: 'Mar 28, 2026' },
  ],
  disqualified: [
    { id: 15, name: 'Sarah Kim', title: 'VP of Operations', company: 'Apex Financial', agent: 'Lauren', agentStatus: 'active', daysInStage: 1, lastTouch: 'Apr 2, 2026' },
    { id: 16, name: 'Mark Thompson', title: 'IT Manager', company: 'Regional Care LLC', agent: 'Kate', agentStatus: 'active', daysInStage: 4, lastTouch: 'Mar 30, 2026' },
    { id: 17, name: 'Diana Ruiz', title: 'Controller', company: 'Westfield Group', agent: 'Scott', agentStatus: 'active', daysInStage: 7, lastTouch: 'Mar 27, 2026' },
  ],
};

function ProspectCard({ prospect }) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-3 space-y-2.5 hover:border-accent/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-txt-primary truncate">{prospect.name}</p>
          <p className="text-xs text-txt-secondary truncate">{prospect.title}</p>
          <p className="text-xs text-txt-tertiary truncate">{prospect.company}</p>
        </div>
        <AgentAvatar name={prospect.agent} status={prospect.agentStatus} size="sm" />
      </div>
      <div className="flex items-center justify-between text-[10px] text-txt-tertiary">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {prospect.daysInStage}d in stage
        </span>
        <span>{prospect.lastTouch}</span>
      </div>
    </div>
  );
}

export default function Pipeline() {
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
            const cards = mockPipeline[col.key] || [];
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
