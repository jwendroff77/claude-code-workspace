import { useState } from 'react';
import {
  CalendarCheck,
  Mail,
  Reply,
  Users,
  AlertTriangle,
  MessageSquare,
  BarChart3,
  ChevronRight,
  Zap,
  Clock,
  TrendingUp,
  Activity,
  RefreshCw,
} from 'lucide-react';
import MetricCard from '../components/shared/MetricCard';
import StatusBadge from '../components/shared/StatusBadge';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';

const mockAgents = [
  { id: 2, name: 'Megan Barrett', title: 'SDR', email: 'megan@1cloudnow.com', status: 'active', sentToday: 47, limit: 50, replyRate: 4.2, appointmentsWeek: 3, queueSize: 234 },
  { id: 3, name: 'Lauren Mitchell', title: 'Senior Account Executive', email: 'lauren@1cloudnow.com', status: 'active', sentToday: 50, limit: 50, replyRate: 5.1, appointmentsWeek: 4, queueSize: 189 },
  { id: 4, name: 'Kate Harmon', title: 'Business Development Rep', email: 'kate@1cloudnow.com', status: 'active', sentToday: 42, limit: 50, replyRate: 3.8, appointmentsWeek: 2, queueSize: 312 },
  { id: 5, name: 'Scott Mercer', title: 'Enterprise Account Executive', email: 'scott@1cloudnow.com', status: 'paused', sentToday: 0, limit: 50, replyRate: 6.3, appointmentsWeek: 5, queueSize: 67 },
];

const mockAttention = [
  { id: 1, type: 'reply', message: 'New reply from David Chen at Mercy Health', agent: 'Lauren Mitchell', time: '12 min ago' },
  { id: 2, type: 'reply', message: 'Interested reply from Sarah Kim at First Federal', agent: 'Megan Barrett', time: '34 min ago' },
  { id: 3, type: 'queue', message: "Scott's queue below threshold (67 remaining)", agent: 'Scott Mercer', time: '1 hr ago' },
  { id: 4, type: 'performance', message: 'Step 3 underperforming in Q1 Healthcare sequence', agent: 'Kate Harmon', time: '2 hrs ago' },
];

function attentionIcon(type) {
  switch (type) {
    case 'reply':
      return <MessageSquare className="h-4 w-4 text-accent" />;
    case 'queue':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'performance':
      return <BarChart3 className="h-4 w-4 text-danger" />;
    default:
      return <Zap className="h-4 w-4 text-txt-tertiary" />;
  }
}

function SendProgress({ sent, limit }) {
  const pct = Math.round((sent / limit) * 100);
  const barColor = pct >= 100 ? 'bg-success' : pct >= 80 ? 'bg-accent' : 'bg-accent/60';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-txt-secondary">Sends</span>
        <span className="font-mono text-txt-primary">
          {sent}<span className="text-txt-tertiary">/{limit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-primary">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function AgentCard({ agent }) {
  return (
    <div className="group rounded-xl border border-border bg-bg-secondary p-5 transition-colors hover:border-accent/30">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AgentAvatar name={agent.name} status={agent.status} size="md" />
          <div>
            <h3 className="font-display text-sm font-semibold text-txt-primary">{agent.name}</h3>
            <p className="text-xs text-txt-tertiary">{agent.title}</p>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Stats */}
      <div className="mt-5 space-y-3">
        <SendProgress sent={agent.sentToday} limit={agent.limit} />

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-bg-primary px-3 py-2 text-center">
            <p className="font-mono text-lg font-bold text-txt-primary">{agent.replyRate}%</p>
            <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">Reply Rate</p>
          </div>
          <div className="rounded-lg bg-bg-primary px-3 py-2 text-center">
            <p className="font-mono text-lg font-bold text-accent">{agent.appointmentsWeek}</p>
            <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">Appts/Wk</p>
          </div>
          <div className="rounded-lg bg-bg-primary px-3 py-2 text-center">
            <p className={`font-mono text-lg font-bold ${agent.queueSize < 100 ? 'text-warning' : 'text-txt-primary'}`}>
              {agent.queueSize}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">Queue</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-end">
        <button className="flex items-center gap-1 text-xs text-txt-tertiary transition-colors hover:text-accent">
          View Details <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [agents] = useState(mockAgents);
  const [attention] = useState(mockAttention);

  const totalAppointments = agents.reduce((sum, a) => sum + a.appointmentsWeek, 0);
  const totalSentToday = agents.reduce((sum, a) => sum + a.sentToday, 0);
  const avgReplyRate = (agents.reduce((sum, a) => sum + a.replyRate, 0) / agents.length).toFixed(1);
  const totalInSequence = agents.reduce((sum, a) => sum + a.queueSize, 0);

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Page Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-txt-primary">Command Center</h1>
            <p className="mt-1 text-sm text-txt-secondary">
              Good morning, Jonathan. Here is your fleet status.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-txt-secondary transition-colors hover:text-txt-primary">
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
            <div className="flex items-center gap-2 text-xs text-txt-tertiary">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 lg:px-10">
        {/* Hero Metric + Secondary Metrics Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Appointments Booked"
            value={totalAppointments}
            sub="This month across all agents"
            accent
            className="sm:col-span-2 lg:col-span-1 ring-1 ring-accent/20"
          />
          <MetricCard
            label="Emails Sent Today"
            value={totalSentToday}
            sub={`${agents.filter(a => a.status === 'active').length} agents active`}
          />
          <MetricCard
            label="Reply Rate (7-Day)"
            value={`${avgReplyRate}%`}
            sub="Across all sequences"
          />
          <MetricCard
            label="Prospects In Sequence"
            value={totalInSequence.toLocaleString()}
            sub="Total active queue"
          />
        </div>

        {/* Agent Roster + Attention Feed */}
        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
          {/* Agent Cards Grid */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-txt-primary">
                Agent Roster
              </h2>
              <span className="text-xs text-txt-tertiary">
                {agents.filter(a => a.status === 'active').length} of {agents.length} active
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>

          {/* Attention Feed */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-txt-primary">
                Attention Feed
              </h2>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
                {attention.length}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-bg-secondary">
              <div className="divide-y divide-border">
                {attention.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-bg-tertiary/50 cursor-pointer"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-primary">
                      {attentionIcon(item.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-txt-primary leading-snug">{item.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-txt-tertiary">
                        <span>{item.agent}</span>
                        <span className="text-border">|</span>
                        <span>{item.time}</span>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-txt-tertiary" />
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-4 py-3">
                <Button variant="ghost" className="w-full justify-center text-xs">
                  View All Notifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
