import { useLocation } from 'react-router-dom';
import { Activity } from 'lucide-react';

const titles = {
  '/': 'Command Center',
  '/agents': 'Agent Manager',
  '/cadences': 'Cadence Builder',
  '/inbox': 'Unified Inbox',
  '/pipeline': 'Pipeline',
  '/lists': 'List Manager',
  '/settings': 'Settings',
};

export default function Topbar() {
  const { pathname } = useLocation();
  const title = titles[pathname] || 'Command Center';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg-secondary/50 px-6 py-3">
      <div>
        <h2 className="font-display text-xl font-bold text-txt-primary">{title}</h2>
        <p className="text-xs text-txt-tertiary">{dateStr}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5">
        <Activity className="h-3.5 w-3.5 text-success animate-pulse" />
        <span className="text-xs font-medium text-success">All Agents Active</span>
      </div>
    </header>
  );
}
