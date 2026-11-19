import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Award,
  ClipboardList,
  Compass,
  FileCheck2,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
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

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: NavId; label: string; Icon: React.ComponentType<{ className?: string }> }>;
}> = [
  { label: 'Workspace', items: [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'explorer', label: 'Bounty Explorer', Icon: Compass },
    { id: 'intelligence', label: 'Bounty Intelligence', Icon: ClipboardList },
  ] },
  { label: 'Tracking', items: [
    { id: 'monitor', label: 'Evidence Monitor', Icon: Activity },
    { id: 'submissions', label: 'Submissions', Icon: FileCheck2 },
    { id: 'rewards', label: 'Rewards Analytics', Icon: Award },
  ] },
  { label: 'Configuration', items: [
    { id: 'settings', label: 'Settings', Icon: Settings },
  ] },
];

const iconButton = 'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink';

function Navigation({ active, collapsed = false, onNavigate }: {
  active: NavId;
  collapsed?: boolean;
  onNavigate: (id: NavId) => void;
}) {
  return (
    <nav aria-label="Main navigation" className="space-y-6 px-3 py-5">
      {NAV_GROUPS.map(({ label, items }) => (
        <div key={label} role="group" aria-label={label} className="space-y-1">
          {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-muted">{label}</p>}
          {items.map(({ id, label: itemLabel, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={itemLabel}
              aria-current={active === id ? 'page' : undefined}
              title={collapsed ? itemLabel : undefined}
              onClick={() => onNavigate(id)}
              className={`relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg text-left text-[13px] transition-colors ${collapsed ? 'justify-center' : 'px-3'} ${active === id ? 'bg-accent-wash font-semibold text-accent before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-accent' : 'font-medium text-muted hover:bg-hover hover:text-ink'}`}
            >
              <Icon className="size-[17px] shrink-0" />
              {!collapsed && <span>{itemLabel}</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const [explorerStart, setExplorerStart] = useState({ query: '', watchlist: false });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('makefun-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeDrawer = () => { if (desktop.matches) mobileMenu.current?.close(); };
    desktop.addEventListener('change', closeDrawer);
    return () => desktop.removeEventListener('change', closeDrawer);
  }, []);

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

  const navigate = (tab: NavId) => {
    setActiveTab(tab);
    mobileMenu.current?.close();
  };

  const openExplorer = (query = '', watchlist = false) => {
    setExplorerStart({ query, watchlist });
    navigate('explorer');
  };

  const inspectBounty = (slug: string) => {
    if (slug) setIntelligenceSlug(slug);
    navigate('intelligence');
  };

  const activeNavLabel = NAV_GROUPS.flatMap(group => group.items).find(item => item.id === activeTab)?.label;
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex min-h-16 min-w-0 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" className={iconButton + ' lg:hidden'} aria-label="Open navigation"
              aria-haspopup="dialog" onClick={() => mobileMenu.current?.showModal()}>
              <Menu className="size-5" />
            </button>
            <button type="button" className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold tracking-tight"
              onClick={() => navigate('overview')} aria-label="Make.fun overview">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-quiet">
                <Compass className="size-[18px] text-accent" aria-hidden="true" />
              </span>
              <span>Make.fun</span>
            </button>
            <span className="hidden border-l border-line pl-3 text-sm text-muted sm:block">{activeNavLabel}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-xs text-muted md:block">{settings?.accountHandle}</span>
            <button type="button" className={iconButton} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <ThemeIcon className="size-[19px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <dialog ref={mobileMenu} aria-labelledby="navigation-title"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,90vw)] max-w-none border-r border-line bg-surface p-0 text-ink"
        onClick={event => { if (event.target === event.currentTarget) mobileMenu.current?.close(); }}>
        <div className="min-h-full">
          <div className="flex min-h-16 items-center justify-between border-b border-line px-4">
            <h2 id="navigation-title" className="font-semibold">Make.fun</h2>
            <button type="button" className={iconButton} aria-label="Close navigation" autoFocus
              onClick={() => mobileMenu.current?.close()}>
              <X className="size-5" />
            </button>
          </div>
          <Navigation active={activeTab} onNavigate={navigate} />
        </div>
      </dialog>

      <div className="flex items-start">
        <aside className={`sticky top-16 hidden max-h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface lg:flex ${sidebarCollapsed ? 'w-[4.25rem]' : 'w-56'}`}>
          <div className={`flex min-h-14 items-center border-b border-line ${sidebarCollapsed ? 'justify-center' : 'justify-between pl-5 pr-3'}`}>
            {!sidebarCollapsed && <span className="text-xs font-semibold text-muted">COSMICLABS</span>}
            <button type="button" className={iconButton} aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? <PanelLeftOpen className="size-[17px]" /> : <PanelLeftClose className="size-[17px]" />}
            </button>
          </div>
          <Navigation active={activeTab} collapsed={sidebarCollapsed} onNavigate={navigate} />
          {!sidebarCollapsed && <p className="mt-auto border-t border-line px-5 py-4 text-xs text-muted">Read-only make.fun access · Local SQLite</p>}
        </aside>

        <main className="mx-auto w-full min-w-0 max-w-[1240px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {activeTab === 'overview' && (
            <OverviewView
              data={overviewData}
              loading={overviewLoading}
              syncing={syncing}
              error={overviewError}
              onSyncNow={handleGlobalSync}
              onOpenExplorer={openExplorer}
              onInspectBounty={inspectBounty}
            />
          )}

          {activeTab === 'explorer' && (
            <BountyExplorerView
              initialQuery={explorerStart.query}
              initialWatchlist={explorerStart.watchlist}
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
