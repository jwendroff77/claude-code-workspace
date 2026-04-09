import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Mail,
  Send,
  GitBranch,
  KanbanSquare,
  ListChecks,
  Settings,
  Zap,
  Handshake,
  BarChart3,
  CheckSquare,
} from 'lucide-react';
import clsx from 'clsx';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Command Center' },
  { to: '/agents', icon: Users, label: 'Agent Manager' },
  { to: '/cadences', icon: GitBranch, label: 'Cadences' },
  { to: '/inbox', icon: Mail, label: 'Inbox' },
  { to: '/sent', icon: Send, label: 'Sent Emails' },
  { to: '/partner-cadence', icon: Handshake, label: 'Partner Cadence' },
  { to: '/tasks', icon: CheckSquare, label: 'Task Queue' },
  { to: '/pipeline', icon: KanbanSquare, label: 'Pipeline' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/lists', icon: ListChecks, label: 'Lists' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-bg-secondary">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
          <Zap className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-txt-primary tracking-tight">
            1Cloud
          </h1>
          <p className="text-[11px] text-txt-tertiary font-mono uppercase tracking-widest">
            Sales Platform
          </p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary'
              )
            }
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent font-display">
            JW
          </div>
          <div>
            <p className="text-sm font-medium text-txt-primary">Jonathan Wendroff</p>
            <p className="text-xs text-txt-tertiary">Principal Advisor</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
