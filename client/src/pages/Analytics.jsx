import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, GitBranch, RefreshCw } from 'lucide-react';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const periods = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: 'All', days: 365 },
];

function FunnelBar({ label, value, maxValue, color }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <span className="w-20 text-xs text-txt-secondary text-right shrink-0">{label}</span>
      <div className="flex-1 h-8 bg-bg-primary rounded-lg overflow-hidden">
        <div
          className={`h-full rounded-lg transition-all duration-500 ${color} flex items-center px-3`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        >
          <span className="text-xs font-bold text-white">{value.toLocaleString()}</span>
        </div>
      </div>
      <span className="w-14 text-xs text-txt-tertiary text-right shrink-0">
        {maxValue > 0 ? `${((value / maxValue) * 100).toFixed(1)}%` : '0%'}
      </span>
    </div>
  );
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return <p className="text-xs text-txt-tertiary">No data</p>;

  const maxSent = Math.max(...data.map(d => d.sent), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.sent} sent, ${d.opened} opened, ${d.replied} replied`}>
          <div className="w-full flex flex-col justify-end h-24 gap-px">
            <div
              className="w-full bg-bg-tertiary rounded-t-sm"
              style={{ height: `${(d.sent / maxSent) * 100}%`, minHeight: d.sent > 0 ? '2px' : '0' }}
            />
          </div>
          {i % 5 === 0 && (
            <span className="text-[8px] text-txt-tertiary">{new Date(d.date).getDate()}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState(30);
  const [funnel, setFunnel] = useState({ sent: 0, opened: 0, clicked: 0, replied: 0, booked: 0 });
  const [agents, setAgents] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('sent');

  async function loadData() {
    setLoading(true);
    try {
      const [f, a, s, t] = await Promise.allSettled([
        api.getAnalyticsFunnel({ days: period }),
        api.getAnalyticsAgents({ days: period }),
        api.getAnalyticsSequences({ days: period }),
        api.getAnalyticsTrends({ days: period }),
      ]);
      if (f.status === 'fulfilled') setFunnel(f.value);
      if (a.status === 'fulfilled') setAgents(a.value);
      if (s.status === 'fulfilled') setSequences(s.value);
      if (t.status === 'fulfilled') setTrends(t.value);
    } catch (e) { /* */ }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [period]);

  const sortedAgents = [...agents].sort((a, b) => {
    if (sortBy === 'reply_rate') return parseFloat(b.reply_rate) - parseFloat(a.reply_rate);
    if (sortBy === 'open_rate') return parseFloat(b.open_rate) - parseFloat(a.open_rate);
    return b[sortBy] - a[sortBy];
  });

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-txt-primary">Analytics</h1>
              <p className="text-sm text-txt-secondary">Performance metrics across all agents and sequences</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border">
              {periods.map(p => (
                <button
                  key={p.days}
                  onClick={() => setPeriod(p.days)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p.days ? 'bg-accent text-bg-primary' : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={loadData}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 lg:px-10 space-y-8">
        {/* Funnel */}
        <div className="rounded-xl border border-border bg-bg-secondary p-6">
          <h2 className="font-display text-lg font-semibold text-txt-primary mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-accent" /> Engagement Funnel
          </h2>
          <div className="space-y-3">
            <FunnelBar label="Sent" value={funnel.sent} maxValue={funnel.sent} color="bg-txt-tertiary" />
            <FunnelBar label="Opened" value={funnel.opened} maxValue={funnel.sent} color="bg-blue-500" />
            <FunnelBar label="Clicked" value={funnel.clicked} maxValue={funnel.sent} color="bg-violet-500" />
            <FunnelBar label="Replied" value={funnel.replied} maxValue={funnel.sent} color="bg-emerald-500" />
            <FunnelBar label="Booked" value={funnel.booked} maxValue={funnel.sent} color="bg-accent" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Agent Performance */}
          <div className="rounded-xl border border-border bg-bg-secondary p-6">
            <h2 className="font-display text-lg font-semibold text-txt-primary mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" /> Agent Performance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-txt-tertiary font-medium">Agent</th>
                    {['sent', 'open_rate', 'click_rate', 'reply_rate', 'booked'].map(col => (
                      <th
                        key={col}
                        onClick={() => setSortBy(col)}
                        className={`text-right py-2 font-medium cursor-pointer transition-colors ${sortBy === col ? 'text-accent' : 'text-txt-tertiary hover:text-txt-secondary'}`}
                      >
                        {col === 'open_rate' ? 'Open%' : col === 'click_rate' ? 'Click%' : col === 'reply_rate' ? 'Reply%' : col.charAt(0).toUpperCase() + col.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAgents.map(a => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                      <td className="py-2.5 font-medium text-txt-primary">{a.name}</td>
                      <td className="text-right py-2.5 text-txt-secondary font-mono">{a.sent}</td>
                      <td className="text-right py-2.5 text-txt-secondary font-mono">{a.open_rate}%</td>
                      <td className="text-right py-2.5 text-txt-secondary font-mono">{a.click_rate}%</td>
                      <td className="text-right py-2.5 font-mono font-bold text-accent">{a.reply_rate}%</td>
                      <td className="text-right py-2.5 text-txt-secondary font-mono">{a.booked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="rounded-xl border border-border bg-bg-secondary p-6">
            <h2 className="font-display text-lg font-semibold text-txt-primary mb-4">Daily Activity</h2>
            <TrendChart data={trends} />
            <div className="flex items-center gap-4 mt-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-bg-tertiary" /> Sent</span>
            </div>
          </div>
        </div>

        {/* Sequence Performance */}
        <div className="rounded-xl border border-border bg-bg-secondary p-6">
          <h2 className="font-display text-lg font-semibold text-txt-primary mb-4 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-accent" /> Sequence Step Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-txt-tertiary font-medium">Sequence</th>
                  <th className="text-left py-2 text-txt-tertiary font-medium">Step</th>
                  <th className="text-left py-2 text-txt-tertiary font-medium">Subject</th>
                  <th className="text-right py-2 text-txt-tertiary font-medium">Sent</th>
                  <th className="text-right py-2 text-txt-tertiary font-medium">Opened</th>
                  <th className="text-right py-2 text-txt-tertiary font-medium">Open%</th>
                  <th className="text-right py-2 text-txt-tertiary font-medium">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                    <td className="py-2 text-txt-primary">{s.sequence_name}</td>
                    <td className="py-2 text-txt-secondary">Step {s.step_number}</td>
                    <td className="py-2 text-txt-secondary truncate max-w-[200px]">{s.subject_line}</td>
                    <td className="text-right py-2 text-txt-secondary font-mono">{s.sent}</td>
                    <td className="text-right py-2 text-txt-secondary font-mono">{s.opened}</td>
                    <td className="text-right py-2 font-mono text-accent">{s.sent > 0 ? ((s.opened / s.sent) * 100).toFixed(1) : '0'}%</td>
                    <td className="text-right py-2 text-txt-secondary font-mono">{s.clicked}</td>
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
