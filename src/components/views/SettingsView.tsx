import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Panel, PanelHeader } from '../ui/primitives';
import { fetch } from '../../lib/api';
import type { AppSettings } from '../../types/command-center';
import { MakefunConnectionPanel } from './MakefunMonitor';

interface SettingsViewProps {
  settings: AppSettings | null;
  onSettingsSaved: (settings: AppSettings) => void;
  onMakefunConnected: () => void;
}

export function SettingsView({ settings, onSettingsSaved, onMakefunConnected }: SettingsViewProps) {
  const [syncInterval, setSyncInterval] = useState('30');
  const [token, setToken] = useState(() => sessionStorage.getItem('cosmiclabs_op_token') || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState('');
  const savedSyncInterval = settings?.syncIntervalMinutes;

  useEffect(() => {
    if (savedSyncInterval !== undefined) setSyncInterval(String(savedSyncInterval));
  }, [savedSyncInterval]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncIntervalMinutes: Number(syncInterval),
        }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error || 'Could not save settings.');
      onSettingsSaved(updated);
      setStatus('Settings saved.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveGeminiKey(value: string | null) {
    setSavingGeminiKey(true);
    setGeminiStatus('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhanceGeminiApiKey: value }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error || 'Could not update the Gemini API key.');
      onSettingsSaved(updated);
      setGeminiKey('');
      setGeminiStatus(value === null ? 'Gemini API key removed.' : 'Gemini API key saved.');
    } catch (error) {
      setGeminiStatus((error as Error).message);
    } finally {
      setSavingGeminiKey(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your make.fun account, sync interval, and Enhance AI API key.</p>
      </div>
      {!settings && <p role="status" className="text-sm text-secondary">Settings are currently unavailable.</p>}
      {settings?.authRequired && <Panel>
        <PanelHeader title="Operator access" />
        <div className="space-y-2 p-4">
          <label className="block space-y-2 text-sm">
            <span>Operator session token</span>
            <Input className="w-full" type="password" autoComplete="off" value={token} onChange={event => {
              setToken(event.target.value);
              sessionStorage.setItem('cosmiclabs_op_token', event.target.value);
            }} />
          </label>
          <p className="text-sm text-muted">Used for changes and Muse downloads during this browser session.</p>
        </div>
      </Panel>}
      {settings && <MakefunConnectionPanel sessionToken={settings.authRequired ? token : ''} onConnected={onMakefunConnected} />}
      {settings?.enhanceAi && <Panel>
        <PanelHeader title="Enhance AI" />
        <form className="space-y-4 p-4" onSubmit={event => {
          event.preventDefault();
          void saveGeminiKey(geminiKey.trim());
        }}>
          <p className="text-sm text-secondary">{settings.enhanceAi.provider} · <code>{settings.enhanceAi.model}</code></p>
          <label className="block space-y-2 text-sm">
            <span>Gemini API key</span>
            <Input className="w-full" type="password" autoComplete="new-password" value={geminiKey}
              disabled={savingGeminiKey} maxLength={512} required onChange={event => setGeminiKey(event.target.value)} />
          </label>
          <p className="text-sm text-muted">
            {settings.enhanceAi.configured ? 'Key saved. Enter a new key to replace it.' : 'No API key saved.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" type="submit" disabled={savingGeminiKey || saving || !geminiKey.trim()}>Save API key</Button>
            {settings.enhanceAi.configured && <Button variant="ghost" type="button" disabled={savingGeminiKey || saving}
              onClick={() => void saveGeminiKey(null)}>Remove API key</Button>}
          </div>
          {geminiStatus && <p className="text-sm text-secondary" role="status">{geminiStatus}</p>}
        </form>
      </Panel>}
      {settings && <Panel>
        <PanelHeader title="Sync schedule" />
        <form className="space-y-4 p-4" onSubmit={save}>
          <label className="block space-y-2 text-sm">
            <span>make.fun sync interval (minutes)</span>
            <Input type="number" min={5} max={1440} required value={syncInterval} onChange={event => setSyncInterval(event.target.value)} />
          </label>
          <p className="text-sm text-muted">The account and watchlist sync while the server is running.</p>
          <Button variant="primary" type="submit" disabled={saving || savingGeminiKey}>{saving ? 'Saving…' : 'Save settings'}</Button>
          {status && <p className="text-sm text-secondary" role="status">{status}</p>}
        </form>
      </Panel>}
    </div>
  );
}
