/**
 * Admin Page
 * Verification management + data sync for BuildBoard administrators.
 *
 * Auth: accepts either WA SSO session (JWT cookie) OR ADMIN_SECRET bearer token.
 * When not logged in via SSO, shows a secret entry form.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AdminAPI } from '../api/api';
import type { SyncStatus, EnrichStatus } from '../api/api';
import type { Company } from '../api/types';
import {
  ShieldCheck, Award, Search, Loader2,
  RefreshCw, CheckCircle2, XCircle, Database,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import VerificationBadge from '../components/VerificationBadge';
import { usePageTitle } from '../hooks/usePageTitle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VerificationStatus = 'unverified' | 'verified' | 'hcc_member';
type FilterTab = 'all' | VerificationStatus;

interface StateLicenseSource {
  stateCode: string;
  stateName: string;
  agency: string;
  agencyUrl: string;
  format: string;
  estimatedRecords: number;
  requiresFirecrawl: boolean;
}

interface AdminStats {
  unverified: number;
  verified: number;
  hcc_member: number;
  total: number;
  dataSources?: Record<string, number>;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'verified', label: 'Verified' },
  { key: 'hcc_member', label: 'HCC Member' },
];

const STATUS_OPTIONS: { value: VerificationStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'unverified', label: 'Unverified', icon: null },
  { value: 'verified', label: 'Verified', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { value: 'hcc_member', label: 'HCC Member', icon: <Award className="w-3.5 h-3.5" /> },
];

// ---------------------------------------------------------------------------
// Sync status helpers
// ---------------------------------------------------------------------------

function SyncStatusBadge({ status }: { status: SyncStatus['status'] }) {
  if (status === 'running') return (
    <span className="inline-flex items-center gap-1.5 text-yellow-400 text-sm font-semibold">
      <Loader2 className="w-4 h-4 animate-spin" /> Running
    </span>
  );
  if (status === 'complete') return (
    <span className="inline-flex items-center gap-1.5 text-[#7DCA69] text-sm font-semibold">
      <CheckCircle2 className="w-4 h-4" /> Complete
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1.5 text-red-400 text-sm font-semibold">
      <XCircle className="w-4 h-4" /> Error
    </span>
  );
  return <span className="text-text-muted text-sm">Idle</span>;
}

// ── Ads Admin Section ─────────────────────────────────────────────────────────

type AdsScreen = 'sponsors' | 'slots' | 'analytics';

interface SponsorRow {
  id: string; name: string; website: string; accent_color: string;
  logo_path: string; is_active: number; slotCount: number;
}

interface SlotRow {
  id: string; name: string; label: string; description: string;
  assignmentId?: string; sponsorName?: string; sponsorId?: string;
  headline?: string; creativeId?: string;
}

interface AnalyticsRow {
  slotName: string; slotLabel: string; sponsorName: string;
  impressions: number; clicks: number; ctr: string; lastClick?: string;
}

const AdsAdminSection: React.FC = () => {
  const [screen, setScreen] = useState<AdsScreen>('sponsors');
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [analyticsRange, setAnalyticsRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [loading, setLoading] = useState(false);

  const fetchData = React.useCallback(async (s: AdsScreen, range?: '7d' | '30d' | 'all') => {
    setLoading(true);
    try {
      if (s === 'sponsors') {
        const r = await fetch('/api/admin/sponsors', { credentials: 'include' });
        setSponsors(await r.json());
      } else if (s === 'slots') {
        const r = await fetch('/api/admin/ad-slots', { credentials: 'include' });
        setSlots(await r.json());
      } else {
        const r = await fetch(`/api/admin/analytics?range=${range ?? '7d'}`, { credentials: 'include' });
        setAnalytics(await r.json());
      }
    } catch {
      // silent failure — data stays empty, loading clears
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(screen, analyticsRange); }, [screen, analyticsRange, fetchData]);

  const toggleSponsor = async (id: string, current: number) => {
    await fetch(`/api/admin/sponsors/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    });
    fetchData('sponsors');
  };

  const totalImpressions = analytics.reduce((s, r) => s + (r.impressions || 0), 0);
  const totalClicks = analytics.reduce((s, r) => s + (r.clicks || 0), 0);
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : '—';

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
      {/* Sidebar nav */}
      <div className="flex sm:flex-col gap-1 sm:w-44 sm:flex-shrink-0 flex-wrap">
        {(['sponsors', 'slots', 'analytics'] as AdsScreen[]).map(s => (
          <button
            key={s}
            onClick={() => setScreen(s)}
            className={`flex-1 sm:flex-none text-left px-3 py-2 rounded text-xs font-bold uppercase tracking-widest mb-0 sm:mb-1 transition-colors ${
              screen === s ? 'bg-brand-gold/10 text-brand-gold' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {s === 'sponsors' ? 'Sponsors' : s === 'slots' ? 'Ad Slots' : 'Analytics'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {loading && <p className="text-white/40 text-sm">Loading...</p>}

        {/* Sponsors */}
        {!loading && screen === 'sponsors' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Sponsors</h3>
            </div>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {['Sponsor', 'Website', 'Accent', 'Status', 'Slots', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sponsors.map(sp => (
                    <tr key={sp.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded flex items-center justify-center text-[7px] font-black text-black flex-shrink-0"
                               style={{ background: sp.accent_color }}>
                            {sp.name.slice(0, 3).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">{sp.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/40">{sp.website}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3.5 h-3.5 rounded" style={{ background: sp.accent_color }} />
                          <span className="text-white/40 text-[10px]">{sp.accent_color}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${sp.is_active ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-white/30'}`}>
                          {sp.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold">
                          {sp.slotCount} slots
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSponsor(sp.id, sp.is_active)}
                                className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded border border-white/10 text-white/40 hover:text-white/70 mr-1">
                          {sp.is_active ? 'Pause' : 'Resume'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* Slots */}
        {!loading && screen === 'slots' && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Ad Slots</h3>
            <div className="flex flex-col gap-3">
              {slots.map(sl => (
                <div key={sl.id} className={`rounded-lg border p-4 flex items-center gap-4 ${sl.assignmentId ? 'border-white/10' : 'border-dashed border-white/20'}`}>
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[8px] text-white/30 font-bold uppercase text-center leading-tight flex-shrink-0">
                    {sl.name.split('_')[0].slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{sl.label}</div>
                    <div className="text-white/40 text-xs mt-0.5">{sl.description}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {sl.assignmentId ? (
                      <>
                        <div className="bg-white/5 border border-white/10 rounded px-3 py-1.5 flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded bg-brand-gold/60" />
                          <span className="text-white/70 text-xs font-semibold">{sl.sponsorName}</span>
                        </div>
                        <button className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded border border-white/10 text-white/40 hover:text-white/70">Change</button>
                      </>
                    ) : (
                      <button className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded bg-brand-gold text-black">Assign</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics */}
        {!loading && screen === 'analytics' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Analytics</h3>
              <div className="flex gap-1.5">
                {(['7d', '30d', 'all'] as const).map(r => (
                  <button key={r} onClick={() => setAnalyticsRange(r)}
                    className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded border ${analyticsRange === r ? 'bg-brand-gold text-black border-brand-gold' : 'border-white/10 text-white/40'}`}>
                    {r === '7d' ? 'Last 7 days' : r === '30d' ? '30 days' : 'All time'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { val: totalImpressions.toLocaleString(), lbl: 'Impressions' },
                { val: totalClicks.toString(), lbl: 'Clicks' },
                { val: avgCtr, lbl: 'CTR' },
                { val: analytics.filter(r => r.sponsorName).length.toString(), lbl: 'Active Slots' },
              ].map(({ val, lbl }) => (
                <div key={lbl} className="rounded-lg border border-white/10 p-4">
                  <div className="text-2xl font-black text-white leading-none">{val}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-1">{lbl}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {['Slot', 'Sponsor', 'Impressions', 'Clicks', 'CTR', 'Last Click'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.map(row => (
                    <tr key={row.slotName} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-semibold text-white">{row.slotLabel || row.slotName}</td>
                      <td className="px-4 py-3 text-white/50">{row.sponsorName || '—'}</td>
                      <td className="px-4 py-3 text-white/70">{(row.impressions || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-white/70">{row.clicks || 0}</td>
                      <td className="px-4 py-3">
                        {row.ctr !== '—'
                          ? <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">{row.ctr}</span>
                          : <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-3 text-white/30">{row.lastClick ? new Date(row.lastClick).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const Admin: React.FC = () => {
  usePageTitle('Admin Panel');

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Secret-based auth state (for local dev without WA SSO)
  const [secretInput, setSecretInput] = useState('');
  const [secretError, setSecretError] = useState('');
  const [isAuthedWithSecret, setIsAuthedWithSecret] = useState(false);
  const [secretLoading, setSecretLoading] = useState(false);

  const isAdminAuthed = isAuthenticated || isAuthedWithSecret;

  // Main data state
  const [accessDenied, setAccessDenied] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [adminSection, setAdminSection] = useState<'companies' | 'ads'>('companies');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncStarting, setSyncStarting] = useState(false);
  const [syncSectionOpen, setSyncSectionOpen] = useState(true);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enrich state
  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus | null>(null);
  const [enrichStarting, setEnrichStarting] = useState(false);
  const [enrichSectionOpen, setEnrichSectionOpen] = useState(true);
  const enrichPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Data quality state
  type DataQualityRow = { dataSource: string; count: number; avgRating: number; withPhoto: number; withCoords: number };
  const [dataQuality, setDataQuality] = useState<{ bySource: DataQualityRow[]; yelpCount: number; total: number } | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ deleted: number; totalRemaining: number } | null>(null);

  // FTS rebuild state
  type FtsStatus = { status: 'idle' | 'running' | 'complete' | 'error'; rowsIndexed?: number; elapsedSeconds?: number; startedAt?: string; finishedAt?: string; error?: string; currentCount?: number };
  const [ftsStatus, setFtsStatus] = useState<FtsStatus | null>(null);
  const [ftsStarting, setFtsStarting] = useState(false);
  const ftsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // State license import state
  const [stateLicenseSources, setStateLicenseSources] = useState<StateLicenseSource[]>([]);
  const [licenseRunning, setLicenseRunning] = useState<Set<string>>(new Set());
  const [licenseDone, setLicenseDone] = useState<Set<string>>(new Set());
  const [licenseErrors, setLicenseErrors] = useState<Record<string, string>>({});
  const [licenseSectionOpen, setLicenseSectionOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await AdminAPI.getStats();
      setStats(data);
      setAccessDenied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('403') || message.includes('401')) setAccessDenied(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    setListLoading(true);
    try {
      const statusParam = activeTab === 'all' ? undefined : activeTab;
      const result = await AdminAPI.searchCompanies({
        q: searchQuery || undefined,
        status: statusParam,
        limit: 20,
      });
      setCompanies(result.companies);
      setTotalResults(result.totalResults);
    } catch {
      setCompanies([]);
      setTotalResults(0);
    } finally {
      setListLoading(false);
    }
  }, [searchQuery, activeTab]);

  const pollSyncStatus = useCallback(async () => {
    try {
      const status = await AdminAPI.getSyncStatus();
      setSyncStatus(status);
      // Stop polling when no longer running
      if (status.status !== 'running' && syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
        // Refresh stats after sync completes
        loadStats();
      }
    } catch {
      // Ignore poll errors — server may be restarting
    }
  }, [loadStats]);

  const pollEnrichStatus = useCallback(async () => {
    try {
      const status = await AdminAPI.getEnrichStatus();
      setEnrichStatus(status);
      if (status.status !== 'running' && enrichPollRef.current) {
        clearInterval(enrichPollRef.current);
        enrichPollRef.current = null;
        loadStats();
      }
    } catch {
      // Ignore poll errors
    }
  }, [loadStats]);

  const loadDataQuality = useCallback(async () => {
    setDataQualityLoading(true);
    try {
      const data = await AdminAPI.getDataQuality();
      setDataQuality(data);
    } catch {
      // Silent
    } finally {
      setDataQualityLoading(false);
    }
  }, []);

  const loadStateLicenseSources = useCallback(async () => {
    try {
      const { sources } = await AdminAPI.getStateLicenseSources();
      setStateLicenseSources(sources);
    } catch {
      // Silent — backend may not expose endpoint if not yet deployed
    }
  }, []);

  const pollFtsStatus = useCallback(async () => {
    try {
      const status = await AdminAPI.getFtsStatus();
      setFtsStatus(status);
      if (status.status !== 'running' && ftsPollRef.current) {
        clearInterval(ftsPollRef.current);
        ftsPollRef.current = null;
        // Refresh stats after rebuild
        loadStats();
      }
    } catch {
      // Ignore poll errors
    }
  }, [loadStats]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!authLoading && isAdminAuthed && !accessDenied) {
      loadStats();
    }
  }, [authLoading, isAdminAuthed, accessDenied, loadStats]);

  useEffect(() => {
    if (!authLoading && isAdminAuthed && !accessDenied) {
      loadCompanies();
    }
  }, [authLoading, isAdminAuthed, accessDenied, loadCompanies]);

  // Check if there's an ongoing sync when admin first loads
  useEffect(() => {
    if (isAdminAuthed && !accessDenied) {
      pollSyncStatus();
      pollEnrichStatus();
      pollFtsStatus();
      loadDataQuality();
      loadStateLicenseSources();
    }
  }, [isAdminAuthed, accessDenied, pollSyncStatus, pollEnrichStatus, pollFtsStatus, loadDataQuality, loadStateLicenseSources]);

  // Start/stop polling based on sync status
  useEffect(() => {
    if (syncStatus?.status === 'running' && !syncPollRef.current) {
      syncPollRef.current = setInterval(pollSyncStatus, 3000);
    }
    return () => {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
  }, [syncStatus?.status, pollSyncStatus]);

  // Start/stop polling based on enrich status
  useEffect(() => {
    if (enrichStatus?.status === 'running' && !enrichPollRef.current) {
      enrichPollRef.current = setInterval(pollEnrichStatus, 3000);
    }
    return () => {
      if (enrichPollRef.current) {
        clearInterval(enrichPollRef.current);
        enrichPollRef.current = null;
      }
    };
  }, [enrichStatus?.status, pollEnrichStatus]);

  // Start/stop polling based on FTS rebuild status
  useEffect(() => {
    if (ftsStatus?.status === 'running' && !ftsPollRef.current) {
      ftsPollRef.current = setInterval(pollFtsStatus, 2000);
    }
    return () => {
      if (ftsPollRef.current) {
        clearInterval(ftsPollRef.current);
        ftsPollRef.current = null;
      }
    };
  }, [ftsStatus?.status, pollFtsStatus]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;
    setSecretLoading(true);
    setSecretError('');
    AdminAPI.setSecret(secretInput.trim());
    try {
      await AdminAPI.getStats();
      setIsAuthedWithSecret(true);
    } catch {
      AdminAPI.setSecret(null);
      setSecretError('Invalid secret. Check ADMIN_SECRET in your .env file.');
    } finally {
      setSecretLoading(false);
    }
  };

  const handleSetStatus = async (companyId: string, status: VerificationStatus) => {
    setUpdatingId(companyId);
    try {
      await AdminAPI.setVerificationStatus(companyId, status);
      await Promise.all([loadCompanies(), loadStats()]);
    } catch {
      // Silent — could add toast in future
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStartYelpSync = async (testMode = false) => {
    setSyncStarting(true);
    try {
      const opts = testMode
        ? { metros: ['Los Angeles, CA'], categories: ['plumbing', 'electricians'] }
        : undefined;
      await AdminAPI.startYelpSync(opts);
      // Start polling immediately
      await pollSyncStatus();
      if (!syncPollRef.current) {
        syncPollRef.current = setInterval(pollSyncStatus, 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start sync';
      setSyncStatus({ status: 'error', lastError: msg });
    } finally {
      setSyncStarting(false);
    }
  };

  const handlePurgeSeedData = async () => {
    if (!window.confirm('This will permanently delete all synthetic seed records (yelpId IS NULL AND dataSource = "manual"). This cannot be undone. Continue?')) return;
    setPurgeLoading(true);
    setPurgeResult(null);
    try {
      const result = await AdminAPI.purgeSeedData();
      setPurgeResult({ deleted: result.deleted, totalRemaining: result.totalRemaining });
      loadStats();
      loadDataQuality();
    } catch {
      // Silent
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleStartYelpEnrich = async () => {
    setEnrichStarting(true);
    try {
      await AdminAPI.startYelpEnrich();
      await pollEnrichStatus();
      if (!enrichPollRef.current) {
        enrichPollRef.current = setInterval(pollEnrichStatus, 3000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start enrich';
      setEnrichStatus({ status: 'error', lastError: msg });
    } finally {
      setEnrichStarting(false);
    }
  };

  const handleRebuildFts = async () => {
    setFtsStarting(true);
    try {
      await AdminAPI.rebuildFts();
      // Start polling immediately
      await pollFtsStatus();
      if (!ftsPollRef.current) {
        ftsPollRef.current = setInterval(pollFtsStatus, 2000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start FTS rebuild';
      setFtsStatus({ status: 'error', error: msg });
    } finally {
      setFtsStarting(false);
    }
  };

  const handleStartLicenseSync = async (stateCode: string) => {
    setLicenseRunning(prev => new Set(prev).add(stateCode));
    setLicenseErrors(prev => { const n = { ...prev }; delete n[stateCode]; return n; });
    try {
      await AdminAPI.syncStateLicense(stateCode);
      // Sync runs in background — mark as "queued" then let it settle
      setTimeout(() => {
        setLicenseRunning(prev => { const n = new Set(prev); n.delete(stateCode); return n; });
        setLicenseDone(prev => new Set(prev).add(stateCode));
      }, 2500);
    } catch (err) {
      setLicenseRunning(prev => { const n = new Set(prev); n.delete(stateCode); return n; });
      const msg = err instanceof Error ? err.message : 'Failed to start import';
      setLicenseErrors(prev => ({ ...prev, [stateCode]: msg }));
    }
  };

  // ---------------------------------------------------------------------------
  // Render gates
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-gold" />
      </div>
    );
  }

  // Not logged in — show secret entry form
  if (!isAdminAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl uppercase tracking-wider text-white mb-1 text-center">
            Admin Panel
          </h1>
          <p className="text-text-muted text-sm text-center mb-8">
            Enter your admin secret to continue.
          </p>
          <form onSubmit={handleSecretSubmit} className="space-y-4">
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="Admin secret (from .env ADMIN_SECRET)"
              autoFocus
              className="w-full bg-surface border border-border rounded-lg px-4 py-3
                         text-sm text-white placeholder:text-text-disabled
                         focus:outline-none focus:border-brand-gold/60 transition-colors"
            />
            {secretError && (
              <p className="text-red-400 text-xs">{secretError}</p>
            )}
            <button
              type="submit"
              disabled={secretLoading || !secretInput.trim()}
              className="w-full py-3 rounded-lg font-display font-bold uppercase tracking-wider
                         text-sm bg-brand-gold text-black hover:bg-brand-gold-hover
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {secretLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Unlock Admin'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-white uppercase tracking-wider mb-2">
            Access Denied
          </h1>
          <p className="text-text-muted">You don't have admin access.</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main admin UI
  // ---------------------------------------------------------------------------

  const isSyncRunning = syncStatus?.status === 'running';
  const syncProgress = syncStatus?.processed ?? 0;

  return (
    <div className="min-h-screen bg-background px-[4%] py-10">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wider text-white mb-1">
            Admin Panel
          </h1>
          <p className="text-text-muted text-sm">Manage verification statuses and data sync.</p>
        </div>

        {/* Section toggle */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-4">
          {(['companies', 'ads'] as const).map(section => (
            <button
              key={section}
              onClick={() => setAdminSection(section)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${
                adminSection === section
                  ? 'bg-brand-gold text-black'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {section === 'companies' ? 'Companies' : 'Ads'}
            </button>
          ))}
        </div>

        {adminSection === 'companies' && (
          <>

        {/* ── Database Health ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-brand-gold" />
              <h2 className="font-display text-lg uppercase tracking-wider text-white">
                Database Health
              </h2>
            </div>
            <button
              onClick={loadStats}
              disabled={statsLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display
                         font-bold uppercase tracking-wider border border-white/10 text-[#999999]
                         hover:border-white/30 hover:text-white disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {statsLoading && !stats ? (
            <div className="flex items-center gap-3 text-text-muted py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading stats...</span>
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.15em] text-[#999999] mb-1">Total Records</p>
                  <p className="text-[1.8rem] font-display font-bold text-white">{stats.total.toLocaleString()}</p>
                </div>
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.15em] text-[#999999] mb-1">Verified</p>
                  <p className={`text-[1.8rem] font-display font-bold ${stats.verified > 0 ? 'text-[#7DCA69]' : 'text-white'}`}>{stats.verified.toLocaleString()}</p>
                </div>
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.15em] text-[#999999] mb-1">HCC Members</p>
                  <p className={`text-[1.8rem] font-display font-bold ${stats.hcc_member > 0 ? 'text-[#F5C518]' : 'text-white'}`}>{stats.hcc_member.toLocaleString()}</p>
                </div>
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.15em] text-[#999999] mb-1">Unverified</p>
                  <p className="text-[1.8rem] font-display font-bold text-[#666]">{stats.unverified.toLocaleString()}</p>
                </div>
              </div>

              {stats.dataSources && Object.keys(stats.dataSources).length > 0 && (
                <div className="mt-4 bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.15em] text-[#999999] mb-2">
                    Data Sources
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(stats.dataSources).map(([source, count]) => (
                      <span key={source} className="flex items-center gap-1.5 text-sm text-[#999999]">
                        <Database className="w-3.5 h-3.5" />
                        <span className="text-white font-semibold">{count.toLocaleString()}</span>
                        <span className="capitalize">{source}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── Data Quality Section ── */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-brand-gold" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Data Quality
              </span>
            </div>
            <button
              onClick={loadDataQuality}
              disabled={dataQualityLoading}
              className="text-xs font-display font-bold uppercase tracking-wider text-text-muted hover:text-white transition-colors"
            >
              {dataQualityLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
            </button>
          </div>
          <div className="px-6 py-5 space-y-5">
            {dataQuality ? (
              <>
                {/* Source breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  {dataQuality.bySource.map(row => {
                    const pctPhoto = row.count > 0 ? Math.round((row.withPhoto / row.count) * 100) : 0;
                    const pctCoords = row.count > 0 ? Math.round((row.withCoords / row.count) * 100) : 0;
                    // Real data: Yelp listings or state government license records
                    const isYelp = row.dataSource === 'yelp';
                    const isStateLicense = row.dataSource?.startsWith('license_');
                    const isSynthetic = row.dataSource === 'manual' || (!isYelp && !isStateLicense);
                    const stateCode = isStateLicense ? row.dataSource.replace('license_', '').toUpperCase() : null;
                    return (
                      <div
                        key={row.dataSource}
                        className={`rounded-lg p-4 border ${
                          isYelp
                            ? 'border-[#7DCA69]/30 bg-[#7DCA69]/5'
                            : isStateLicense
                            ? 'border-[#F5C518]/20 bg-[#F5C518]/5'
                            : 'border-white/10 bg-background'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[11px] font-display font-bold uppercase tracking-[0.15em] ${
                            isYelp ? 'text-[#7DCA69]' : isStateLicense ? 'text-[#F5C518]' : 'text-[#999]'
                          }`}>
                            {isStateLicense ? `${stateCode} License` : row.dataSource}
                          </span>
                          {isYelp && <span className="text-[10px] text-[#7DCA69] font-semibold">✓ Yelp</span>}
                          {isStateLicense && <span className="text-[10px] text-[#F5C518] font-semibold">✓ Gov</span>}
                          {isSynthetic && <span className="text-[10px] text-[#666] font-semibold">⚠ Synthetic</span>}
                        </div>
                        <p className="text-xl font-display font-bold text-white">{row.count.toLocaleString()}</p>
                        <div className="mt-2 space-y-1 text-xs text-text-muted">
                          <div className="flex justify-between">
                            <span>With photo</span>
                            <span className={pctPhoto > 50 ? 'text-[#7DCA69]' : 'text-[#666]'}>{pctPhoto}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>With coords</span>
                            <span className={pctCoords > 50 ? 'text-brand-gold' : 'text-[#666]'}>{pctCoords}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Purge seed data */}
                {dataQuality.bySource.some(r => r.dataSource === 'manual' && r.count > 0) && (
                  <div className="rounded-lg border border-red-500/20 bg-red-950/10 p-4">
                    <p className="text-sm text-white font-semibold mb-1">Remove Synthetic Seed Data</p>
                    <p className="text-xs text-text-muted mb-3">
                      Deletes all {dataQuality.bySource.find(r => r.dataSource === 'manual')?.count.toLocaleString() ?? '0'} manual/synthetic
                      records. Run only after a successful Yelp sync has populated real data.
                    </p>
                    {purgeResult ? (
                      <p className="text-xs text-[#7DCA69] font-semibold">
                        ✓ Deleted {purgeResult.deleted.toLocaleString()} records — {purgeResult.totalRemaining.toLocaleString()} remain
                      </p>
                    ) : (
                      <button
                        onClick={handlePurgeSeedData}
                        disabled={purgeLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display
                                   font-bold uppercase tracking-wider border border-red-500/40 text-red-400
                                   hover:border-red-500 hover:bg-red-500/10 disabled:opacity-40
                                   disabled:cursor-not-allowed transition-colors"
                      >
                        {purgeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {purgeLoading ? 'Purging...' : 'Purge Seed Data'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : dataQualityLoading ? (
              <div className="flex items-center gap-3 text-text-muted py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading data quality...</span>
              </div>
            ) : (
              <p className="text-text-muted text-sm">No data loaded.</p>
            )}
          </div>
        </div>

        {/* ── FTS Index Section ── */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-brand-gold" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Search Index (FTS5)
              </span>
              {ftsStatus && ftsStatus.status !== 'idle' && (
                <span className="ml-2">
                  <SyncStatusBadge status={ftsStatus.status} />
                </span>
              )}
            </div>
            <button
              onClick={pollFtsStatus}
              className="text-xs font-display font-bold uppercase tracking-wider text-text-muted hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Current index size */}
            {ftsStatus?.currentCount != null && (
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <Database className="w-4 h-4 text-brand-gold flex-shrink-0" />
                <span>
                  Current index: <span className="text-white font-semibold">{ftsStatus.currentCount.toLocaleString()}</span> rows
                </span>
              </div>
            )}

            {/* Status after rebuild */}
            {ftsStatus && ftsStatus.status !== 'idle' && (
              <div className="rounded-lg bg-background border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <SyncStatusBadge status={ftsStatus.status} />
                  {ftsStatus.startedAt && (
                    <span className="text-xs text-text-disabled">
                      Started {new Date(ftsStatus.startedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {ftsStatus.status === 'running' && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span>Rebuilding index from {(ftsStatus.currentCount ?? 0).toLocaleString()} rows — this takes 30–120 seconds...</span>
                  </div>
                )}
                {ftsStatus.status === 'complete' && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Rows Indexed</p>
                      <p className="text-[#7DCA69] font-bold">{(ftsStatus.rowsIndexed ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Time</p>
                      <p className="text-white font-bold">{ftsStatus.elapsedSeconds?.toFixed(1)}s</p>
                    </div>
                  </div>
                )}
                {ftsStatus.error && (
                  <p className="text-red-400 text-xs font-mono bg-red-900/20 rounded px-2 py-1">
                    {ftsStatus.error}
                  </p>
                )}
                {ftsStatus.finishedAt && (
                  <p className="text-text-disabled text-xs">
                    Finished {new Date(ftsStatus.finishedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}

            {/* Rebuild button */}
            <div className="space-y-2">
              <p className="text-text-muted text-sm">
                Drops and rebuilds the FTS5 full-text search index from scratch. Run after
                bulk data imports (state license sync, Yelp sync) to ensure all records
                are searchable with correct BM25 ranking weights.
              </p>
              <button
                onClick={handleRebuildFts}
                disabled={ftsStatus?.status === 'running' || ftsStarting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-display
                           font-bold uppercase tracking-wider border border-border text-text-muted
                           hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40
                           disabled:cursor-not-allowed transition-colors"
              >
                {ftsStatus?.status === 'running' || ftsStarting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />
                }
                {ftsStatus?.status === 'running' ? 'Rebuilding...' : 'Rebuild FTS Index'}
              </button>
              <p className="text-text-disabled text-xs">
                Blocks the server for 30–120 seconds while running — safe during low traffic.
                Subsequent requests are queued and complete normally after rebuild finishes.
              </p>
            </div>
          </div>
        </div>

        {/* ── Yelp Sync Section ── */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setSyncSectionOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-brand-gold" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Yelp Data Sync
              </span>
              {syncStatus && (
                <span className="ml-2">
                  <SyncStatusBadge status={syncStatus.status} />
                </span>
              )}
            </div>
            {syncSectionOpen
              ? <ChevronUp className="w-4 h-4 text-text-muted" />
              : <ChevronDown className="w-4 h-4 text-text-muted" />
            }
          </button>

          {syncSectionOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-border">
              {/* Status display */}
              {syncStatus && syncStatus.status !== 'idle' && (
                <div className="mt-4 rounded-lg bg-background border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SyncStatusBadge status={syncStatus.status} />
                    {syncStatus.startedAt && (
                      <span className="text-xs text-text-disabled">
                        Started {new Date(syncStatus.startedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {isSyncRunning && (
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gold rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (syncProgress / 5000) * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Processed</p>
                      <p className="text-white font-bold">{(syncStatus.processed ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Inserted</p>
                      <p className="text-[#7DCA69] font-bold">{(syncStatus.inserted ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Updated</p>
                      <p className="text-brand-gold font-bold">{(syncStatus.updated ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {syncStatus.errors != null && syncStatus.errors > 0 && (
                    <p className="text-red-400 text-xs">{syncStatus.errors} error(s) — check server logs</p>
                  )}
                  {syncStatus.lastError && (
                    <p className="text-red-400 text-xs font-mono bg-red-900/20 rounded px-2 py-1">
                      {syncStatus.lastError}
                    </p>
                  )}
                  {syncStatus.finishedAt && (
                    <p className="text-text-disabled text-xs">
                      Finished {new Date(syncStatus.finishedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-4 space-y-3">
                <p className="text-text-muted text-sm">
                  Pulls real contractor data from Yelp Fusion API — photos, coordinates, ratings,
                  price range. Existing contact info (phone, address) is preserved.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleStartYelpSync(true)}
                    disabled={isSyncRunning || syncStarting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-display
                               font-bold uppercase tracking-wider border border-border text-text-muted
                               hover:border-white/40 hover:text-white disabled:opacity-40
                               disabled:cursor-not-allowed transition-colors"
                  >
                    {syncStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test Sync (LA plumbing &amp; electric)
                  </button>
                  <button
                    onClick={() => handleStartYelpSync(false)}
                    disabled={isSyncRunning || syncStarting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-display
                               font-bold uppercase tracking-wider bg-brand-gold text-black
                               hover:bg-brand-gold-hover disabled:opacity-40
                               disabled:cursor-not-allowed transition-colors"
                  >
                    {isSyncRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Full CA Sync (~5k–50k contractors)
                  </button>
                </div>
                <p className="text-text-disabled text-xs">
                  Full sync sweeps 15 CA metros × 28 contractor categories. Takes 45–90 min due to
                  Yelp rate limits (500ms/request). Safe to run again — duplicates are skipped.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Yelp Enrich Section ── */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setEnrichSectionOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-brand-primary" />
              <span className="font-display font-bold uppercase tracking-wider text-white">
                Yelp Enrich Existing Records
              </span>
              {enrichStatus && enrichStatus.status !== 'idle' && (
                <span className="ml-2">
                  <SyncStatusBadge status={enrichStatus.status} />
                </span>
              )}
            </div>
            {enrichSectionOpen
              ? <ChevronUp className="w-4 h-4 text-text-muted" />
              : <ChevronDown className="w-4 h-4 text-text-muted" />
            }
          </button>

          {enrichSectionOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-border">
              {enrichStatus && enrichStatus.status !== 'idle' && (
                <div className="mt-4 rounded-lg bg-background border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <SyncStatusBadge status={enrichStatus.status} />
                    {enrichStatus.startedAt && (
                      <span className="text-xs text-text-disabled">
                        Started {new Date(enrichStatus.startedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {enrichStatus.status === 'running' && enrichStatus.total != null && enrichStatus.total > 0 && (
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-primary rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (((enrichStatus.matched ?? 0) + (enrichStatus.skipped ?? 0) + (enrichStatus.errors ?? 0)) / enrichStatus.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Total</p>
                      <p className="text-white font-bold">{(enrichStatus.total ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Matched</p>
                      <p className="text-[#7DCA69] font-bold">{(enrichStatus.matched ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Skipped</p>
                      <p className="text-text-muted font-bold">{(enrichStatus.skipped ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-text-disabled text-xs uppercase tracking-wider mb-0.5">Errors</p>
                      <p className="text-red-400 font-bold">{(enrichStatus.errors ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {enrichStatus.lastError && (
                    <p className="text-red-400 text-xs font-mono bg-red-900/20 rounded px-2 py-1">
                      {enrichStatus.lastError}
                    </p>
                  )}
                  {enrichStatus.finishedAt && (
                    <p className="text-text-disabled text-xs">
                      Finished {new Date(enrichStatus.finishedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <p className="text-text-muted text-sm">
                  Links your existing real companies to Yelp — adds photos and coordinates
                  without creating duplicates.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleStartYelpEnrich}
                    disabled={enrichStatus?.status === 'running' || enrichStarting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-display
                               font-bold uppercase tracking-wider bg-brand-primary text-white
                               hover:bg-brand-primary/80 disabled:opacity-40
                               disabled:cursor-not-allowed transition-colors"
                  >
                    {enrichStatus?.status === 'running'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Database className="w-4 h-4" />
                    }
                    Start Yelp Enrich
                  </button>
                </div>
                <p className="text-text-disabled text-xs">
                  Searches Yelp for each company without a yelpId, matches by name similarity
                  (threshold 0.6) and location. Only updates enrichment fields — never creates
                  new rows. 600ms rate limit between API calls.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── State License Import Section ── */}
        {stateLicenseSources.length > 0 && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setLicenseSectionOpen(o => !o)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-[#7DCA69]" />
                <span className="font-display font-bold uppercase tracking-wider text-white">
                  State License Import
                </span>
                {licenseRunning.size > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-yellow-400 text-sm font-semibold">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {licenseRunning.size} running
                  </span>
                )}
              </div>
              {licenseSectionOpen
                ? <ChevronUp className="w-4 h-4 text-text-muted" />
                : <ChevronDown className="w-4 h-4 text-text-muted" />
              }
            </button>

            {licenseSectionOpen && (
              <div className="px-6 pb-6 border-t border-border space-y-4">
                <p className="text-text-muted text-sm mt-4">
                  Import contractor records directly from state government license databases —
                  license number, status, expiry, and bond amount. Enriches existing Yelp
                  records and adds new government-verified entries.
                </p>

                {/* State grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stateLicenseSources.map(src => {
                    const isRunning = licenseRunning.has(src.stateCode);
                    const isDone = licenseDone.has(src.stateCode);
                    const errMsg = licenseErrors[src.stateCode];
                    return (
                      <div
                        key={src.stateCode}
                        className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                          isDone
                            ? 'border-[#7DCA69]/30 bg-[#7DCA69]/5'
                            : isRunning
                            ? 'border-yellow-500/30 bg-yellow-500/5'
                            : 'border-white/10 bg-background'
                        }`}
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-display font-bold text-white text-sm">{src.stateCode}</span>
                            <span className="text-text-muted text-sm">{src.stateName}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              src.format === 'csv'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}>
                              {src.format === 'csv' ? '📥 CSV' : '🌐 Web'}
                            </span>
                          </div>
                          <p className="text-text-disabled text-xs">
                            {src.agency} · ~{src.estimatedRecords.toLocaleString()} records
                          </p>
                          {errMsg && (
                            <p className="text-red-400 text-xs mt-1 font-mono">{errMsg}</p>
                          )}
                        </div>
                        <button
                          onClick={() => !isRunning && !isDone && handleStartLicenseSync(src.stateCode)}
                          disabled={isRunning || isDone}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                            isDone
                              ? 'border border-[#7DCA69]/40 text-[#7DCA69] cursor-default'
                              : isRunning
                              ? 'border border-yellow-500/40 text-yellow-400 cursor-wait'
                              : 'border border-white/10 text-text-muted hover:border-white/40 hover:text-white'
                          }`}
                        >
                          {isRunning ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Running</>
                          ) : isDone ? (
                            <><CheckCircle2 className="w-3 h-3" /> Queued</>
                          ) : (
                            'Import'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="text-text-disabled text-xs">
                  CSV states (TX, WA, OR) download bulk exports from open data portals.
                  Web states (AZ, NC, FL) use FireCrawl and require{' '}
                  <code className="font-mono bg-black/30 px-1 rounded">FIRECRAWL_API_KEY</code>.
                  Imports run in the background — check server logs for progress and row counts.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Verification Management ── */}
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider text-white mb-4">
            Verification Management
          </h2>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies by name, category, city..."
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-3
                         text-sm text-white placeholder:text-text-disabled
                         focus:outline-none focus:border-brand-gold/60 transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 mb-4 overflow-x-auto whitespace-nowrap w-full sm:w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded text-sm font-display font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === tab.key
                    ? 'bg-brand-gold text-black'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Company List */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_160px_160px_240px] gap-4 px-4 py-3 border-b border-border text-xs font-display font-bold uppercase tracking-wider text-text-disabled">
              <span>Company</span>
              <span>Category</span>
              <span>Location</span>
              <span>Status</span>
            </div>

            {listLoading ? (
              <div className="flex items-center gap-3 px-4 py-8 text-text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading companies...</span>
              </div>
            ) : companies.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                No companies found.
              </div>
            ) : (
              <ul>
                {companies.map((company, idx) => (
                  <li
                    key={company.id}
                    className={`grid grid-cols-1 sm:grid-cols-[1fr_160px_160px_240px] gap-2 sm:gap-4 px-4 py-4 items-center ${
                      idx !== companies.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white text-sm truncate">
                        {company.businessName}
                      </span>
                      <VerificationBadge status={company.verificationStatus} size="sm" />
                    </div>
                    <span className="text-text-muted text-xs truncate hidden sm:block">
                      {company.category}
                    </span>
                    <span className="text-text-muted text-xs truncate hidden sm:block">
                      {company.city}, {company.state}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_OPTIONS.map((opt) => {
                        const isActive = company.verificationStatus === opt.value;
                        const isUpdating = updatingId === company.id;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => !isUpdating && !isActive && handleSetStatus(company.id, opt.value)}
                            disabled={isUpdating || isActive}
                            className={`inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded text-sm font-display font-bold uppercase tracking-wider transition-colors ${
                              isActive
                                ? opt.value === 'hcc_member'
                                  ? 'bg-brand-primary text-white cursor-default'
                                  : opt.value === 'verified'
                                  ? 'bg-brand-gold text-black cursor-default'
                                  : 'bg-border text-text-muted cursor-default'
                                : 'bg-background text-text-muted border border-border hover:border-white/40 hover:text-white'
                            }`}
                          >
                            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : opt.icon}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!listLoading && companies.length > 0 && (
              <div className="px-4 py-3 border-t border-border text-xs text-text-disabled">
                Showing {companies.length} of {totalResults} companies
              </div>
            )}
          </div>
        </div>

          </>
        )}

        {adminSection === 'ads' && <AdsAdminSection />}

      </div>
    </div>
  );
};

export default Admin;
