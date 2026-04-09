import { useState, useEffect } from 'react';
import {
  CheckSquare,
  Linkedin,
  Phone,
  ExternalLink,
  Check,
  SkipForward,
  RefreshCw,
  Filter,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import Button from '../components/shared/Button';
import { api } from '../api/client';

const taskTypeConfig = {
  linkedin_connect: { label: 'LinkedIn Connect', icon: Linkedin, color: 'text-blue-400' },
  linkedin_message: { label: 'LinkedIn Message', icon: Linkedin, color: 'text-blue-400' },
  linkedin_view: { label: 'LinkedIn View', icon: Linkedin, color: 'text-blue-400' },
  phone_call: { label: 'Phone Call', icon: Phone, color: 'text-emerald-400' },
  custom: { label: 'Custom', icon: CheckSquare, color: 'text-txt-secondary' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TaskQueue() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0 });

  async function loadTasks() {
    setLoading(true);
    try {
      const [data, countData] = await Promise.all([
        api.getTasks({ status: filter }),
        api.getTaskCounts(),
      ]);
      setTasks(data);
      setCounts(countData);
    } catch (e) { /* */ }
    setLoading(false);
  }

  useEffect(() => { loadTasks(); }, [filter]);

  const handleComplete = async (id) => {
    try {
      await api.completeTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setCounts(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (e) { /* */ }
  };

  const handleSkip = async (id) => {
    try {
      await api.skipTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setCounts(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } catch (e) { /* */ }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
              <CheckSquare className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-txt-primary">Task Queue</h1>
              <p className="text-sm text-txt-secondary">
                {counts.total} pending tasks across all agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border">
              {['pending', 'completed', 'skipped'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    filter === s ? 'bg-accent text-bg-primary' : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={loadTasks}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-8 lg:px-10">
        {loading ? (
          <div className="text-center py-12">
            <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-txt-tertiary">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckSquare className="h-10 w-10 mx-auto mb-3 text-txt-tertiary opacity-30" />
            <p className="text-sm text-txt-tertiary">No {filter} tasks</p>
            <p className="text-xs text-txt-tertiary mt-1">LinkedIn tasks auto-generate as sequences progress</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => {
              const config = taskTypeConfig[task.task_type] || taskTypeConfig.custom;
              const Icon = config.icon;
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status === 'pending';

              return (
                <div
                  key={task.id}
                  className={`rounded-xl border bg-bg-secondary p-5 transition-colors hover:border-accent/30 ${
                    isOverdue ? 'border-danger/30' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-primary ${config.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-txt-primary">{task.title}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.color} bg-bg-primary`}>
                          {config.label}
                        </span>
                        {isOverdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-danger bg-danger/10">
                            Overdue
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-txt-secondary">
                        {task.first_name} {task.last_name}
                        {task.prospect_title ? ` - ${task.prospect_title}` : ''}
                        {task.company ? ` at ${task.company}` : ''}
                      </p>

                      {task.description && (
                        <p className="text-xs text-txt-tertiary mt-1">{task.description}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[10px] text-txt-tertiary">
                        <span>Agent: {task.agent_name}</span>
                        {task.due_date && <span>Due: {formatDate(task.due_date)}</span>}
                      </div>
                    </div>

                    {task.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        {task.linkedin_url && (
                          <a
                            href={task.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-txt-secondary hover:text-accent transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Profile
                          </a>
                        )}
                        <Button variant="secondary" onClick={() => handleSkip(task.id)}>
                          <SkipForward className="h-3.5 w-3.5" />
                          Skip
                        </Button>
                        <Button variant="primary" onClick={() => handleComplete(task.id)}>
                          <Check className="h-3.5 w-3.5" />
                          Done
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
