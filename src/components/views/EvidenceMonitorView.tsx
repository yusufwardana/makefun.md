import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FolderSearch,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  PanelHeader,
  Select,
  Textarea,
} from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';
import { fetch } from '../../lib/api';
import type {
  BountyRecord,
  EvidenceRecord,
  TranscriptGateReport,
} from '../../types/command-center';

export const EvidenceMonitorView: React.FC<{ initialSlug: string | null; onSubmissions: () => void }> = ({ initialSlug, onSubmissions }) => {
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [permittedPaths, setPermittedPaths] = useState<string[]>([]);
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [selectedItem, setSelectedItem] = useState<EvidenceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);

  // Import form
  const [showImport, setShowImport] = useState(false);
  const [importSlug, setImportSlug] = useState(initialSlug ?? '');
  const [importType, setImportType] = useState<'session_export' | 'local_log' | 'project_artifact'>('session_export');
  const [importName, setImportName] = useState('');
  const [importSessionId, setImportSessionId] = useState('');
  const [importContent, setImportContent] = useState('');
  const [importing, setImporting] = useState(false);

  // Transcript 9-Gate Pre-Check
  const [precheckSlug, setPrecheckSlug] = useState('');
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [precheckReport, setPrecheckReport] = useState<TranscriptGateReport | null>(null);
  const [precheckError, setPrecheckError] = useState<string | null>(null);

  useEffect(() => {
    setPrecheckSlug(selectedItem?.bountySlug || initialSlug || '');
    setPrecheckReport(null);
    setPrecheckError(null);
  }, [selectedItem?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [evRes, bRes] = await Promise.all([
        fetch('/api/evidence'),
        fetch('/api/bounties?status=all'),
      ]);
      const evData = await evRes.json();
      const bData = await bRes.json();
      const items = (evData.evidence || []) as EvidenceRecord[];
      setEvidence(items);
      setPermittedPaths(evData.permittedPaths || []);
      setBounties(bData.items || []);
      if (items.length > 0 && !selectedItem) {
        setSelectedItem(items[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleScanLocal = async () => {
    setScanning(true);
    setScanResultMsg(null);
    try {
      const res = await fetch('/api/evidence/scan-local', { method: 'POST' });
      const data = await res.json();
      const scannedCount = data.scannedFiles?.length || 0;
      const skipped = (data.skippedPaths || []) as Array<{ path: string; reason: string }>;
      if (scannedCount > 0) {
        setScanResultMsg(`Scanned ${scannedCount} permitted file(s) read-only.`);
      } else if (skipped.length > 0) {
        setScanResultMsg(
          `No files imported. ${skipped.map((s) => `${s.path}: ${s.reason}`).join('; ')}`
        );
      } else {
        setScanResultMsg('Permitted directories exist but contain no matching .json/.jsonl/.log/.md/.txt files.');
      }
      await loadData();
    } finally {
      setScanning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportName(file.name);
    setImportContent(text);
    setShowImport(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importName.trim() || !importContent.trim()) return;
    setImporting(true);
    try {
      const res = await fetch('/api/evidence/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountySlug: importSlug || null,
          sourceType: importType,
          sourcePathOrName: importName.trim(),
          sessionId: importSessionId.trim() || null,
          rawContent: importContent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvidence((prev) => [data.item, ...prev]);
        setSelectedItem(data.item);
        setShowImport(false);
        setImportName('');
        setImportSessionId('');
        setImportContent('');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleRunPrecheck = async () => {
    if (!selectedItem) return;
    setPrecheckLoading(true);
    setPrecheckError(null);
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(selectedItem.id)}/precheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountySlug: precheckSlug || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPrecheckError(data.error || 'Failed to evaluate transcript gates.');
        return;
      }
      setPrecheckReport(data.report);
    } catch (err) {
      setPrecheckError(err instanceof Error ? err.message : 'Network error during pre-check');
    } finally {
      setPrecheckLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/[0.07]">
        <div>
          <h1 className="text-xl font-semibold text-[#F3F4F6] tracking-tight">Evidence Monitor</h1>
          {initialSlug && <p className="mt-1 text-xs text-[#D1D5DB]">Handoff bounty · {initialSlug}</p>}
          <Button variant="ghost" size="sm" onClick={onSubmissions}>Track submissions</Button>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Strictly read-only inspection of authorized session exports, logs, and local project evidence
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium bg-[#14181E] text-[#F3F4F6] hover:bg-[#1C212A] border border-white/[0.1] cursor-pointer gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Export File</span>
            <input
              type="file"
              accept=".json,.jsonl,.log,.md,.txt"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={() => setShowImport((v) => !v)}>
            <FileText className="w-3.5 h-3.5" />
            <span>Paste Evidence</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleScanLocal} disabled={scanning}>
            <FolderSearch className="w-3.5 h-3.5" />
            <span>{scanning ? 'Scanning...' : 'Scan Permitted Paths'}</span>
          </Button>
        </div>
      </div>

      {/* Read-only boundary notice */}
      <div className="rounded-md bg-[#0F1216] border border-white/[0.08] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#D1D5DB]">
          <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>
            Read-only boundary enforced: Evidence Monitor never executes prompts, controls agent processes, or infers submission success from local files.
          </span>
        </div>
        <span className="font-mono text-[#9CA3AF]">
          Permitted paths: {permittedPaths.join(', ') || 'None'}
        </span>
      </div>

      {scanResultMsg && (
        <div className="rounded-md bg-[#3B82F6]/10 border border-[#3B82F6]/30 px-4 py-2.5 text-xs text-[#93C5FD]">
          {scanResultMsg}
        </div>
      )}

      {showImport && (
        <Panel>
          <PanelHeader title="Import Session Export or Evidence" />
          <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Evidence Type</label>
                <Select
                  value={importType}
                  onChange={(e) =>
                    setImportType(e.target.value as EvidenceRecord['sourceType'])
                  }
                  className="w-full"
                >
                  <option value="session_export">Session Export (JSON/JSONL)</option>
                  <option value="local_log">Local Execution Log</option>
                  <option value="project_artifact">Project Artifact / Transcript</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Source File / Name</label>
                <Input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="e.g. muse-session.jsonl"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Linked Bounty (Optional)</label>
                <Select
                  value={importSlug}
                  onChange={(e) => setImportSlug(e.target.value)}
                  className="w-full"
                >
                  <option value="">Unlinked</option>
                  {bounties.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Session ID (Optional)</label>
                <Input
                  value={importSessionId}
                  onChange={(e) => setImportSessionId(e.target.value)}
                  placeholder="Optional session identifier"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1">Raw Export / Log Content</label>
              <Textarea
                rows={6}
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder="Paste a Muse or other agent session transcript, JSONL log, or test verification output..."
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={importing}>
                {importing ? 'Importing...' : 'Save Read-Only Evidence'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowImport(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {loading ? (
        <div className="h-64 rounded-lg bg-[#0F1216] border border-white/[0.08] animate-pulse" />
      ) : evidence.length === 0 ? (
        <Panel>
          <EmptyState
            title="No evidence imported yet"
            description="Import an agent session export or configure a permitted local directory in Settings and click Scan Permitted Paths."
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                Import Read-Only Evidence
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <Panel className="xl:col-span-5">
            <PanelHeader
              title={`Captured Evidence (${evidence.length})`}
              subtitle="Click any artifact to inspect raw read-only logs"
            />
            <div className="divide-y divide-white/[0.06]">
              {evidence.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    selectedItem?.id === item.id ? 'bg-[#3B82F6]/10' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="text-sm font-medium text-[#F3F4F6] truncate">
                    {item.sourcePathOrName}
                  </div>
                  <div className="text-xs text-[#9CA3AF] mt-1 font-mono tabular-nums">
                    {item.sourceType} · {item.metadata.turnCount ?? 0} lines ·{' '}
                    {formatDateTime(item.importedAt)}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="xl:col-span-7">
            <PanelHeader
              title={selectedItem?.sourcePathOrName || 'Evidence Inspector'}
              subtitle={
                selectedItem
                  ? `${selectedItem.summary}${selectedItem.bountySlug ? ` · Bounty: ${selectedItem.bountySlug}` : ''}`
                  : 'Select an evidence artifact'
              }
            />
            {selectedItem && (
              <div className="p-5 space-y-4">
                <div className="flex flex-wrap gap-4 text-xs text-[#9CA3AF] font-mono tabular-nums">
                  <span>Lines: {selectedItem.metadata.turnCount ?? 0}</span>
                  <span>Timestamps detected: {selectedItem.metadata.timestampsFound ?? 0}</span>
                  <span>Bytes: {selectedItem.metadata.byteSize ?? 0}</span>
                  {selectedItem.sessionId && <span>Session: {selectedItem.sessionId}</span>}
                </div>

                {/* B3: Read-Only 9-Gate Transcript Pre-Check */}
                <div className="rounded-md bg-[#090B0E] border border-white/[0.08] p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#F3F4F6]">
                        Transcript Gate Pre-Check (9 local checks)
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        Local read-only heuristic pre-check; official validation still runs on make.fun at submit time.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={precheckSlug}
                        onChange={(e) => setPrecheckSlug(e.target.value)}
                        aria-label="Select bounty window for pre-check"
                        className="h-8 text-xs w-48"
                      >
                        <option value="">No bounty window</option>
                        {bounties.map((b) => (
                          <option key={b.slug} value={b.slug}>
                            {b.title}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRunPrecheck}
                        disabled={precheckLoading}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{precheckLoading ? 'Checking...' : 'Run 9-Gate Pre-Check'}</span>
                      </Button>
                    </div>
                  </div>

                  {precheckError && (
                    <div className="text-xs text-[#FCA5A5]">{precheckError}</div>
                  )}

                  {precheckReport && (
                    <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                        <span
                          className={
                            precheckReport.overallReady
                              ? 'text-[#10B981] font-semibold'
                              : 'text-[#FCD34D] font-semibold'
                          }
                        >
                          {precheckReport.overallReady
                            ? 'LOCAL PRE-CHECK PASSED (0 hard failures)'
                            : 'LOCAL PRE-CHECK HAS FAILURES — Review below'}
                        </span>
                        <span className="text-[#9CA3AF]">
                          Records: {precheckReport.parsedRecords} · Assistant turns:{' '}
                          {precheckReport.assistantTextTurns} · Edits: {precheckReport.toolEditTurns} ·
                          Timestamps: {precheckReport.timestampsCount}
                        </span>
                      </div>

                      <div className="divide-y divide-white/[0.05] text-xs">
                        {precheckReport.checks.map((chk) => (
                          <div key={chk.gateId} className="py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-[#F3F4F6] flex items-center gap-1.5">
                                {chk.status === 'pass' && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                )}
                                {chk.status === 'fail' && (
                                  <XCircle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                                )}
                                {chk.status === 'warn' && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                                )}
                                {chk.status === 'manual_at_submit' && (
                                  <Clock className="w-3.5 h-3.5 text-[#93C5FD] shrink-0" />
                                )}
                                <span>{chk.title}</span>
                                <span className="font-mono text-[10px] text-[#6B7280]">
                                  ({chk.gateId})
                                </span>
                              </div>
                              <div className="text-[11px] text-[#9CA3AF] mt-0.5 pl-5">
                                {chk.detail}
                              </div>
                            </div>
                            <span
                              className={`font-mono text-[11px] uppercase shrink-0 ${
                                chk.status === 'pass'
                                  ? 'text-[#10B981]'
                                  : chk.status === 'fail'
                                    ? 'text-[#EF4444]'
                                    : chk.status === 'warn'
                                      ? 'text-[#F59E0B]'
                                      : 'text-[#93C5FD]'
                              }`}
                            >
                              {chk.status === 'manual_at_submit' ? 'AT SUBMIT' : chk.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#090B0E] border border-white/[0.07] rounded-md p-4 text-[#D1D5DB] max-h-[500px] overflow-y-auto">
                  {selectedItem.rawContent}
                </pre>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};
