import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Panel, PanelHeader, Textarea } from '../ui/primitives';
import { fetch } from '../../lib/api';
import type { AppSettings } from '../../types/command-center';

interface SettingsViewProps {
  settings: AppSettings | null;
  onSettingsSaved: (settings: AppSettings) => void;
}

export function SettingsView({ settings, onSettingsSaved }: SettingsViewProps) {
  const [accountHandle, setAccountHandle] = useState('');
  const [paths, setPaths] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('cosmiclabs_op_token') || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (settings) {
      setAccountHandle(settings.accountHandle);
      setPaths(settings.permittedEvidencePaths.join('\n'));
    }
  }, [settings]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountHandle,
          permittedEvidencePaths: paths.split(/\r?\n/).map(path => path.trim()).filter(Boolean),
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

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">Manage the tracked make.fun account and local evidence sources.</p>
      </div>
      {!settings && <p role="status" className="text-sm text-[#D1D5DB]">Settings are currently unavailable.</p>}
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
          <p className="text-sm text-[#9CA3AF]">Used for changes and Muse downloads during this browser session.</p>
        </div>
      </Panel>}
      {settings && <Panel>
        <PanelHeader title="Account and evidence sources" />
        <form className="space-y-4 p-4" onSubmit={save}>
          <label className="block space-y-2 text-sm">
            <span>Tracked make.fun handle</span>
            <Input className="w-full" value={accountHandle} required onChange={event => setAccountHandle(event.target.value)} />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Permitted evidence directories</span>
            <Textarea className="w-full" rows={4} value={paths} onChange={event => setPaths(event.target.value)} />
          </label>
          <p className="text-sm text-[#9CA3AF]">Enter one workspace directory per line. Evidence Monitor scans these directories on demand.</p>
          <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
          {status && <p className="text-sm text-[#D1D5DB]" role="status">{status}</p>}
        </form>
      </Panel>}
    </div>
  );
}
