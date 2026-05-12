import { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Server,
  Shield,
  Clock,
  Send,
  Settings,
  Eye,
  EyeOff,
  Plug,
  ChevronRight,
  AlertCircle,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import AgentAvatar from '../components/shared/AgentAvatar';
import StatusBadge from '../components/shared/StatusBadge';
import Button from '../components/shared/Button';
import { api } from '../api/client';

// No mock data — agents loaded from API

function FieldGroup({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-txt-tertiary">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, disabled, type = 'text', placeholder, className = '' }) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      readOnly
      className={`w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-txt-primary placeholder-txt-tertiary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

function PasswordInput({ value, disabled }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        readOnly
        className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 pr-10 text-sm font-mono text-txt-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <button
        onClick={() => setVisible(!visible)}
        disabled={disabled}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-tertiary transition-colors hover:text-txt-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <Icon className="h-4 w-4 text-accent" />
      <h3 className="font-display text-sm font-semibold text-txt-primary">{title}</h3>
    </div>
  );
}

function DayToggle({ days }) {
  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex gap-1.5">
      {allDays.map((day) => (
        <button
          key={day}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            days.includes(day)
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-bg-primary text-txt-tertiary border border-border'
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  );
}

function AgentDetail({ agent, onSave, onTestSmtp, onTestImap, onToggleStatus }) {
  const isDisabled = agent.isCloser;

  return (
    <div className="space-y-8 overflow-y-auto">
      {/* Agent Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <AgentAvatar name={agent.name} status={agent.status} size="lg" />
          <div>
            <h2 className="font-display text-xl font-bold text-txt-primary">{agent.name}</h2>
            <p className="text-sm text-txt-secondary">{agent.title}</p>
            <p className="mt-0.5 font-mono text-xs text-txt-tertiary">{agent.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={agent.status} />
          <Button
            variant={agent.status === 'active' ? 'danger' : 'primary'}
            className="text-xs"
            onClick={onToggleStatus}
          >
            {agent.status === 'active' ? 'Pause Agent' : 'Activate Agent'}
          </Button>
        </div>
      </div>

      {/* Closer Notice */}
      {agent.isCloser && (
        <div className="flex items-start gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium text-accent">Closer - No Outbound</p>
            <p className="mt-0.5 text-xs text-txt-secondary">
              Jonathan handles inbound replies and appointment booking only. SMTP configuration and sending parameters are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Identity & Persona */}
      <div className="space-y-4">
        <SectionHeader icon={User} title="Identity & Persona" />
        <p className="text-sm leading-relaxed text-txt-secondary">{agent.persona}</p>
      </div>

      {/* SMTP Configuration */}
      <div className="space-y-4">
        <SectionHeader icon={Send} title="SMTP Configuration" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="SMTP Host">
            <TextInput value={agent.smtp.host} disabled={isDisabled} placeholder="smtp.example.com" />
          </FieldGroup>
          <FieldGroup label="Port">
            <TextInput value={agent.smtp.port} disabled={isDisabled} placeholder="587" />
          </FieldGroup>
          <FieldGroup label="Username">
            <TextInput value={agent.smtp.username} disabled={isDisabled} placeholder="user@example.com" />
          </FieldGroup>
          <FieldGroup label="Password">
            <PasswordInput value={agent.smtp.password} disabled={isDisabled} />
          </FieldGroup>
        </div>
        <Button variant="secondary" className="text-xs" disabled={isDisabled} onClick={onTestSmtp}>
          <Plug className="h-3.5 w-3.5" />
          Test SMTP Connection
        </Button>
      </div>

      {/* IMAP Configuration */}
      <div className="space-y-4">
        <SectionHeader icon={Mail} title="IMAP Configuration" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="IMAP Host">
            <TextInput value={agent.imap.host} disabled={isDisabled} placeholder="imap.example.com" />
          </FieldGroup>
          <FieldGroup label="Port">
            <TextInput value={agent.imap.port} disabled={isDisabled} placeholder="993" />
          </FieldGroup>
          <FieldGroup label="Username">
            <TextInput value={agent.imap.username} disabled={isDisabled} placeholder="user@example.com" />
          </FieldGroup>
          <FieldGroup label="Password">
            <PasswordInput value={agent.imap.password} disabled={isDisabled} />
          </FieldGroup>
        </div>
        <Button variant="secondary" className="text-xs" disabled={isDisabled} onClick={onTestImap}>
          <Plug className="h-3.5 w-3.5" />
          Test IMAP Connection
        </Button>
      </div>

      {/* Operating Parameters */}
      <div className="space-y-4">
        <SectionHeader icon={Settings} title="Operating Parameters" />
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Daily Send Limit">
            <TextInput value={agent.params.dailySendLimit} disabled={isDisabled} />
          </FieldGroup>
          <FieldGroup label="Send Window Start">
            <TextInput value={agent.params.sendWindowStart} disabled={isDisabled} />
          </FieldGroup>
          <FieldGroup label="Send Window End">
            <TextInput value={agent.params.sendWindowEnd} disabled={isDisabled} />
          </FieldGroup>
          <FieldGroup label="Min Queue Threshold">
            <TextInput value={agent.params.minQueueThreshold} disabled={isDisabled} />
          </FieldGroup>
          <FieldGroup label="Max Daily Pull">
            <TextInput value={agent.params.maxDailyPull} disabled={isDisabled} />
          </FieldGroup>
        </div>
        <FieldGroup label="Sending Days">
          <DayToggle days={agent.params.sendingDays} />
        </FieldGroup>
      </div>

      {/* Persona Voice Profile */}
      <div className="space-y-4">
        <SectionHeader icon={MessageSquare} title="Persona Voice Profile" />
        <textarea
          readOnly
          value={agent.voiceProfile}
          rows={4}
          className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2.5 text-sm leading-relaxed text-txt-primary placeholder-txt-tertiary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
      </div>

      {/* Save Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Button variant="ghost">Discard Changes</Button>
        <Button variant="primary" onClick={onSave}>Save Configuration</Button>
      </div>
    </div>
  );
}

export default function AgentManager() {
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await api.getAgents();
        if (data && data.length > 0) {
          // Map flat DB columns to the nested structure the UI expects
          const mapped = data.filter((a) => a.role !== 'closer').map((a) => ({
            ...a,
            isCloser: a.role === 'closer',
            persona: a.persona_voice || '',
            voiceProfile: a.persona_voice || '',
            smtp: {
              host: a.smtp_host || '',
              port: a.smtp_port || '',
              username: a.smtp_user || '',
              password: a.smtp_pass_encrypted || '',
            },
            imap: {
              host: a.imap_host || '',
              port: a.imap_port || '',
              username: a.imap_user || '',
              password: a.imap_pass_encrypted || '',
            },
            params: {
              dailySendLimit: a.daily_send_limit || 0,
              sendWindowStart: a.send_window_start || '08:00',
              sendWindowEnd: a.send_window_end || '17:00',
              minQueueThreshold: a.queue_threshold || 0,
              maxDailyPull: a.max_daily_pull || 0,
              sendingDays: (a.send_days || 'Mon-Fri').split('-'),
            },
          }));
          setAgents(mapped);
          setSelectedId(mapped[0].id);
        }
      } catch (e) {
        // Keep mock data as fallback
      }
    }
    fetchAgents();
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedId);

  async function handleSave() {
    if (!selectedAgent) return;
    try {
      const updated = await api.updateAgent(selectedAgent.id, selectedAgent);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      // Save failed - could surface error to user in the future
    }
  }

  async function handleTestSmtp() {
    if (!selectedAgent) return;
    try {
      await api.testSmtp(selectedAgent.id);
    } catch (e) {
      // Test failed
    }
  }

  async function handleTestImap() {
    if (!selectedAgent) return;
    try {
      await api.testImap(selectedAgent.id);
    } catch (e) {
      // Test failed
    }
  }

  async function handleToggleStatus() {
    if (!selectedAgent) return;
    const newStatus = selectedAgent.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await api.updateAgent(selectedAgent.id, { status: newStatus });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, status: updated.status } : a)));
    } catch (e) {
      // Toggle failed
    }
  }

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Left Panel - Agent List */}
      <div className="w-80 shrink-0 border-r border-border bg-bg-secondary">
        <div className="border-b border-border px-5 py-5">
          <h1 className="font-display text-lg font-bold text-txt-primary">Agent Manager</h1>
          <p className="mt-1 text-xs text-txt-secondary">{agents.length} agents configured</p>
        </div>

        <div className="divide-y divide-border">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              className={`flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bg-tertiary/50 ${
                selectedId === agent.id ? 'bg-bg-tertiary/70 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
              }`}
            >
              <AgentAvatar name={agent.name} status={agent.status} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="truncate font-display text-sm font-medium text-txt-primary">
                    {agent.name}
                  </p>
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                    selectedId === agent.id ? 'text-accent' : 'text-txt-tertiary'
                  }`} />
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="truncate text-xs text-txt-tertiary">{agent.title}</p>
                  <StatusBadge status={agent.status} />
                </div>
                {agent.isCloser && (
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-accent">
                    Closer - No Outbound
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel - Agent Detail */}
      <div className="flex-1 overflow-y-auto px-8 py-8 lg:px-12">
        {selectedAgent ? (
          <AgentDetail
            agent={selectedAgent}
            onSave={handleSave}
            onTestSmtp={handleTestSmtp}
            onTestImap={handleTestImap}
            onToggleStatus={handleToggleStatus}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-txt-tertiary">Select an agent to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
