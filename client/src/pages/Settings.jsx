import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Key,
  Send,
  Bell,
  Gauge,
  BarChart3,
  Save,
  Eye,
  EyeOff,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Button from '../components/shared/Button';

const defaultSettings = {
  apolloApiKey: 'apo_k1_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  anthropicApiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  globalDailyLimit: 200,
  sendWindowStart: '08:00',
  sendWindowEnd: '17:00',
  alertEmail: 'jonathan@1cloudnow.com',
  apolloCreditWarning: 500,
  minReplyRateFlag: 2.0,
};

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <h2 className="font-display text-base font-semibold text-txt-primary">{title}</h2>
      </div>
      {description && (
        <p className="mt-2 ml-10 text-sm text-txt-secondary">{description}</p>
      )}
    </div>
  );
}

function FieldGroup({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-txt-tertiary">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-txt-tertiary">{hint}</p>}
    </div>
  );
}

function ApiKeyInput({ value, onChange }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2.5 pr-10 font-mono text-sm text-txt-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      />
      <button
        onClick={() => setVisible(!visible)}
        type="button"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-tertiary transition-colors hover:text-txt-primary"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function TextInput({ value, onChange, type = 'text', placeholder, className = '' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2.5 text-sm text-txt-primary placeholder-txt-tertiary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${className}`}
    />
  );
}

function NumberInput({ value, onChange, min, max, unit }) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2.5 font-mono text-sm text-txt-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-txt-tertiary">
          {unit}
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  useEffect(() => {
    api
      .getSettings()
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {
        // keep defaultSettings as fallback
      })
      .finally(() => setLoading(false));
  }, []);

  const update = (key) => (e) => {
    setSettings((prev) => ({ ...prev, [key]: e.target.value }));
    setSaved(false);
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
      setTimeout(() => {
        setSaved(false);
        setMessage(null);
      }, 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Page Header */}
      <div className="border-b border-border bg-bg-secondary/50 px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-txt-primary">Settings</h1>
            <p className="mt-1 text-sm text-txt-secondary">
              Platform configuration, API keys, and global thresholds.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </div>
            )}
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`mx-auto mt-4 max-w-3xl px-6 lg:px-10`}
        >
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-success/20 bg-success/5 text-success'
                : 'border-error/20 bg-error/5 text-error'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-sm text-txt-secondary">
          Loading settings...
        </div>
      )}

      <div className={`mx-auto max-w-3xl px-6 py-8 lg:px-10 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="space-y-12">
          {/* API Keys */}
          <section>
            <SectionHeader
              icon={Key}
              title="API Keys"
              description="Credentials for external service integrations. Keys are encrypted at rest."
            />
            <div className="space-y-5 ml-10">
              <FieldGroup
                label="Apollo API Key"
                hint="Used for prospect enrichment and lead sourcing."
              >
                <ApiKeyInput
                  value={settings.apolloApiKey}
                  onChange={update('apolloApiKey')}
                />
              </FieldGroup>
              <FieldGroup
                label="Anthropic API Key"
                hint="Powers AI-driven email generation and reply classification."
              >
                <ApiKeyInput
                  value={settings.anthropicApiKey}
                  onChange={update('anthropicApiKey')}
                />
              </FieldGroup>
            </div>
          </section>

          <hr className="border-border" />

          {/* Sending Defaults */}
          <section>
            <SectionHeader
              icon={Send}
              title="Sending Defaults"
              description="Global sending parameters applied to all agents unless overridden."
            />
            <div className="space-y-5 ml-10">
              <div className="grid gap-5 sm:grid-cols-3">
                <FieldGroup
                  label="Global Daily Limit"
                  hint="Max emails across all agents per day."
                >
                  <NumberInput
                    value={settings.globalDailyLimit}
                    onChange={update('globalDailyLimit')}
                    min={0}
                    max={1000}
                    unit="emails"
                  />
                </FieldGroup>
                <FieldGroup label="Send Window Start">
                  <TextInput
                    type="time"
                    value={settings.sendWindowStart}
                    onChange={update('sendWindowStart')}
                    className="font-mono"
                  />
                </FieldGroup>
                <FieldGroup label="Send Window End">
                  <TextInput
                    type="time"
                    value={settings.sendWindowEnd}
                    onChange={update('sendWindowEnd')}
                    className="font-mono"
                  />
                </FieldGroup>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-txt-tertiary" />
                <p className="text-xs text-txt-secondary">
                  Send windows are in the agent's configured timezone. Emails are distributed randomly within the window to mimic human sending patterns.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* Notification Preferences */}
          <section>
            <SectionHeader
              icon={Bell}
              title="Notification Preferences"
              description="Configure where platform alerts and reports are delivered."
            />
            <div className="space-y-5 ml-10">
              <FieldGroup
                label="Alert Email Address"
                hint="Receives system alerts, reply notifications, and daily summaries."
              >
                <TextInput
                  type="email"
                  value={settings.alertEmail}
                  onChange={update('alertEmail')}
                  placeholder="you@example.com"
                />
              </FieldGroup>
            </div>
          </section>

          <hr className="border-border" />

          {/* Apollo Credit Thresholds */}
          <section>
            <SectionHeader
              icon={Gauge}
              title="Apollo Credit Thresholds"
              description="Set warning levels for Apollo enrichment credit consumption."
            />
            <div className="space-y-5 ml-10">
              <FieldGroup
                label="Warning Threshold"
                hint="Alert when remaining Apollo credits fall below this number."
              >
                <NumberInput
                  value={settings.apolloCreditWarning}
                  onChange={update('apolloCreditWarning')}
                  min={0}
                  max={10000}
                  unit="credits"
                />
              </FieldGroup>
              <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-txt-secondary">
                  When credits drop below the threshold, all agents will pause queue replenishment until credits are topped up.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* Sequence Performance Thresholds */}
          <section>
            <SectionHeader
              icon={BarChart3}
              title="Sequence Performance Thresholds"
              description="Flag underperforming sequences for review."
            />
            <div className="space-y-5 ml-10">
              <FieldGroup
                label="Minimum Reply Rate Before Flag"
                hint="Sequences with reply rates below this percentage will appear in the Attention Feed."
              >
                <NumberInput
                  value={settings.minReplyRateFlag}
                  onChange={update('minReplyRateFlag')}
                  min={0}
                  max={100}
                  unit="%"
                />
              </FieldGroup>
            </div>
          </section>

          {/* Bottom Save */}
          <div className="flex items-center justify-end border-t border-border pt-8">
            <div className="flex items-center gap-3">
              {saved && (
                <div className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Settings saved
                </div>
              )}
              <Button variant="ghost">Reset to Defaults</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
