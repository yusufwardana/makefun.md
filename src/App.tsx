import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  ClipboardList,
  Compass,
  FileCheck2,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from 'lucide-react';
import { OverviewView, type OverviewData } from './components/views/OverviewView';
import { BountyExplorerView } from './components/views/BountyExplorerView';
import { BountyIntelligenceView } from './components/views/BountyIntelligenceView';
import { EvidenceMonitorView } from './components/views/EvidenceMonitorView';
import { SubmissionsView } from './components/views/SubmissionsView';
import { RewardsAnalyticsView } from './components/views/RewardsAnalyticsView';
import { SettingsView } from './components/views/SettingsView';
import { fetch } from './lib/api';
import type { AppSettings } from './types/command-center';

type NavId =
  | 'overview'
  | 'explorer'
  | 'intelligence'
  | 'monitor'
  | 'submissions'
  | 'rewards'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'explorer', label: 'Bounty Explorer', Icon: Compass },
  { id: 'intelligence', label: 'Bounty Intelligence', Icon: ClipboardList },
  { id: 'monitor', label: 'Evidence Monitor', Icon: Activity },
  { id: 'submissions', label: 'Submissions', Icon: FileCheck2 },
  { id: 'rewards', label: 'Rewards Analytics', Icon: Award },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [intelligenceSlug, setIntelligenceSlug] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const fetchOverviewAndSettings = async () => {
    try {
      const [ovRes, setRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/settings'),
      ]);
      if (ovRes.ok) {
        setOverviewData(await ovRes.json());
        setOverviewError(null);
      } else {
        setOverviewError('Failed to load overview data.');
      }
      if (setRes.ok) {
        setSettings(await setRes.json());
      }
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Server unreachable');
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewAndSettings();
  }, []);

  const handleGlobalSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/bounties/sync', { method: 'POST' });
      const result = await response.json();
      await fetchOverviewAndSettings();
      if (!response.ok || result.error) setOverviewError(result.error || 'Could not sync bounties.');
    } catch (error) {
      setOverviewError((error as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const inspectBounty = (slug: string) => {
    if (slug) setIntelligenceSlug(slug);
    setActiveTab('intelligence');
    setMobileMenuOpen(false);
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#F3F4F6] flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-white/[0.08] bg-[#0B0D11] transition-all duration-200 shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="h-14 px-4 border-b border-white/[0.08] flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <span className="font-display font-semibold text-sm tracking-tight text-[#F3F4F6] whitespace-nowrap truncate">
              COSMICLABS
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.05] cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 p-2.5 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                title={sidebarCollapsed ? label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#14181E] text-[#F3F4F6] border border-white/[0.08]'
                    : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#3B82F6]' : ''}`} />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="p-4 border-t border-white/[0.07] text-[11px] text-[#6B7280] space-y-1">
            <div className="text-[#9CA3AF] font-medium">make.fun Command Center</div>
            <div>Account: {settings?.accountHandle || '@0xkeinara'}</div>
            <div>Mode: Read-Only · Local SQLite</div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" onKeyDown={event => { if (event.key === 'Escape') setMobileMenuOpen(false); }}>
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 bg-[#0B0D11] border-r border-white/[0.08] flex flex-col h-full">
            <div className="h-14 px-4 border-b border-white/[0.08] flex items-center justify-between">
              <span className="font-display font-semibold text-sm text-[#F3F4F6]">COSMICLABS</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#9CA3AF] hover:text-[#F3F4F6]"
                aria-label="Close navigation"
                autoFocus
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setActiveTab(id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-[#14181E] text-[#F3F4F6] border border-white/[0.08]'
                        : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#3B82F6]' : ''}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-5 border-b border-white/[0.08] bg-[#0B0D11] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-[#9CA3AF] hover:text-[#F3F4F6]"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap">
              <span className="text-[#6B7280]">COSMICLABS</span>
              <span className="text-[#4B5563]">/</span>
              <span className="truncate text-[#F3F4F6] font-medium">{activeNavLabel}</span>
            </div>
          </div>

        </header>

        <main className="flex-1 p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              data={overviewData}
              loading={overviewLoading}
              syncing={syncing}
              error={overviewError}
              onSyncNow={handleGlobalSync}
              onOpenExplorer={() => setActiveTab('explorer')}
              onInspectBounty={inspectBounty}
            />
          )}

          {activeTab === 'explorer' && (
            <BountyExplorerView
              onInspectBounty={inspectBounty}
              onDataMutated={fetchOverviewAndSettings}
            />
          )}

          {activeTab === 'intelligence' && (
            <BountyIntelligenceView
              initialSlug={intelligenceSlug}
              onSelect={setIntelligenceSlug}
              onBack={() => setActiveTab('explorer')}
              onEvidence={() => setActiveTab('monitor')}
              onDataMutated={fetchOverviewAndSettings}
            />
          )}

          {activeTab === 'monitor' && <EvidenceMonitorView initialSlug={intelligenceSlug} onSubmissions={() => setActiveTab('submissions')} />}
          {activeTab === 'submissions' && <SubmissionsView onRewards={() => setActiveTab('rewards')} />}

          {activeTab === 'rewards' && <RewardsAnalyticsView />}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSettingsSaved={(updated) => {
                setSettings(updated);
                fetchOverviewAndSettings();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
