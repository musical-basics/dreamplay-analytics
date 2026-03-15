
'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity, Users, Eye, Clock, FileText,
  LayoutDashboard, TableProperties, FlaskConical, Globe, Smartphone, ShieldAlert, Network,
  ArrowLeft, Loader2, ExternalLink, TrendingUp, ArrowUpRight, BarChart3, Bot, Mail, Check, X, Pencil, Trash2,
  MessageCircle, Send, MapPin, Download, Monitor, Tablet, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// --- TYPES ---
interface AnalyticsEvent {
  id: string;
  created_at: string;
  event_name: string;
  path: string;
  ip_address: string | null;
  country: string | null;
  session_id: string | null;
  user_agent: string | null;
  metadata?: Record<string, unknown>;
}

interface VisitorHistoryVisit {
  path: string;
  visited_at: string;
  duration_seconds: number | null;
  metadata?: Record<string, unknown>;
}

interface VisitorHistory {
  visits: VisitorHistoryVisit[];
  total_pageviews: number;
  first_seen: string | null;
  last_seen: string | null;
  geo?: {
    country: string | null;
    city: string | null;
    region: string | null;
  };
}

interface DashboardData {
  liveUsers: number;
  totalPageviews: number;
  uniqueVisitors: number;
  uniquePages: number;
  chartData: {
    name: string;
    visitors: number;
    pageviews: number;
    unique_pages: number;
    avg_per_user: number;
  }[];
  recentEvents: AnalyticsEvent[];
  abResults: { variant: string; label?: string; visitors: number; conversions: number; conversion_rate: number }[];
  visitorStats: { ip: string; count: number; lastPath: string; lastSeen: string; country: string; device: string; email?: string; source?: string; sourceUrl?: string; totalTimeSeconds: number; journey_id?: string }[];
}

interface InsightsData {
  totalConverters: number;
  totalVisitors: number;
  conversionRate: string;
  pagesBeforePurchase: { page: string; converterCount: number; percentage: number }[];
  pageEngagement: { page: string; views: number; uniqueVisitors: number; avgTimeSeconds: number | null; exitRate: number }[];
  topFlows: { flow: string; count: number }[];
  converterAvg: { pagesPerSession: string; sessionDuration: number };
  allVisitorAvg: { pagesPerSession: string; sessionDuration: number };
}

interface ChatSession {
  id: string;
  created_at: string;
  updated_at: string;
  email: string | null;
  status: string;
  admin_takeover_at: string | null;
  page_url: string | null;
  ip_address: string | null;
  message_count: number;
  last_message: string | null;
  last_message_role: string | null;
}

interface ChatMessage {
  id: string;
  session_id: string;
  created_at: string;
  role: string;
  content: string;
}

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

type MetricType = 'visitors' | 'pageviews' | 'unique_pages' | 'avg_per_user';
type SortField = 'views' | 'uniqueVisitors' | 'avgTimeSeconds' | 'exitRate';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');
  const [filterAdmin, setFilterAdmin] = useState(true); // Default to Admin Hidden
  const [filterBots, setFilterBots] = useState(true); // Default to Bots Hidden
  const [activeTab, setActiveTab] = useState<'overview' | 'ab' | 'logs' | 'visitors' | 'emailVisitors' | 'insights' | 'chats' | 'exports'>('overview');
  const [exportRange, setExportRange] = useState('7d');
  const [exportData, setExportData] = useState<Record<string, string | number>[] | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricType>('pageviews');
  const [selectedVisitorIp, setSelectedVisitorIp] = useState<string | null>(null);
  const [visitorHistory, setVisitorHistory] = useState<VisitorHistory | null>(null);
  const [expandedSlideRows, setExpandedSlideRows] = useState<Set<number>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [engagementSort, setEngagementSort] = useState<{ field: SortField; asc: boolean }>({ field: 'views', asc: false });
  const [attachingEmail, setAttachingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailVisitorsData, setEmailVisitorsData] = useState<{ ip: string; count: number; lastPath: string; lastSeen: string; country: string; device: string; email: string; purchased: boolean; source?: string; sourceUrl?: string }[] | null>(null);
  const [emailVisitorsLoading, setEmailVisitorsLoading] = useState(false);

  // Event limits for visitors tabs
  const [visitorLimit, setVisitorLimit] = useState(1000);
  const [emailVisitorLimit, setEmailVisitorLimit] = useState(1000);

  // Chat state
  const [chatSessions, setChatSessions] = useState<ChatSession[] | null>(null);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDetailLoading, setChatDetailLoading] = useState(false);
  const [selectedChatSession, setSelectedChatSession] = useState<ChatSession | null>(null);
  const [adminReply, setAdminReply] = useState('');
  const [adminReplySending, setAdminReplySending] = useState(false);

  // Fetch visitor history when an IP is selected
  useEffect(() => {
    if (!selectedVisitorIp) {
      setVisitorHistory(null);
      return;
    }
    let cancelled = false;
    async function fetchHistory() {
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/visitor-history?ip=${encodeURIComponent(selectedVisitorIp!)}&range=${range}&exclude_admin=${filterAdmin}&exclude_bots=${filterBots}`,
          { cache: 'no-store' }
        );
        if (res.ok && !cancelled) {
          setVisitorHistory(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    fetchHistory();
    return () => { cancelled = true; };
  }, [selectedVisitorIp, range, filterAdmin, filterBots]);

  // Fetch insights data when insights tab is active
  useEffect(() => {
    if (activeTab !== 'insights') return;
    let cancelled = false;
    async function fetchInsights() {
      setInsightsLoading(true);
      try {
        const res = await fetch(
          `/api/insights?range=${range}&exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok && !cancelled) {
          setInsightsData(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    }
    fetchInsights();
    return () => { cancelled = true; };
  }, [activeTab, range, filterAdmin, filterBots]);

  // Fetch email visitors data when emailVisitors tab is active
  useEffect(() => {
    if (activeTab !== 'emailVisitors') return;
    let cancelled = false;
    async function fetchEmailVisitors() {
      setEmailVisitorsLoading(true);
      try {
        const res = await fetch(
          `/api/email-visitors?exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&limit=${emailVisitorLimit}&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          setEmailVisitorsData(json.emailVisitorStats);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setEmailVisitorsLoading(false);
      }
    }
    fetchEmailVisitors();
    return () => { cancelled = true; };
  }, [activeTab, filterAdmin, filterBots, emailVisitorLimit]);

  // Fetch chat sessions when chats tab is active
  useEffect(() => {
    if (activeTab !== 'chats') return;
    let cancelled = false;
    async function fetchChatSessions() {
      setChatSessionsLoading(true);
      try {
        const res = await fetch(`/api/chat-sessions?exclude_admin=${filterAdmin}&_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok && !cancelled) {
          const json = await res.json();
          setChatSessions(json.sessions || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setChatSessionsLoading(false);
      }
    }
    fetchChatSessions();
    return () => { cancelled = true; };
  }, [activeTab, filterAdmin]);

  // Fetch chat detail when a session is selected
  useEffect(() => {
    if (!selectedChatId) {
      setChatMessages([]);
      setSelectedChatSession(null);
      return;
    }
    let cancelled = false;
    async function fetchChatDetail() {
      setChatDetailLoading(true);
      try {
        const res = await fetch(`/api/chat-sessions/${selectedChatId}?_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok && !cancelled) {
          const json = await res.json();
          setChatMessages(json.messages || []);
          setSelectedChatSession(json.session || null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setChatDetailLoading(false);
      }
    }
    fetchChatDetail();
    return () => { cancelled = true; };
  }, [selectedChatId]);

  const handleAdminReply = async () => {
    if (!adminReply.trim() || !selectedChatId) return;
    setAdminReplySending(true);
    try {
      const res = await fetch(`/api/chat-sessions/${selectedChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: adminReply }),
      });
      if (res.ok) {
        setAdminReply('');
        // Refresh messages
        const detailRes = await fetch(`/api/chat-sessions/${selectedChatId}?_t=${Date.now()}`, { cache: 'no-store' });
        if (detailRes.ok) {
          const json = await detailRes.json();
          setChatMessages(json.messages || []);
          setSelectedChatSession(json.session || null);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to send reply');
    } finally {
      setAdminReplySending(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      // Skip fetch if tab is hidden
      if (document.hidden) return;
      try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/stats-v2?range=${range}&exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&visitor_limit=${visitorLimit}&_t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
          }
        });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    // Immediately fetch on tab re-focus
    function handleVisibility() {
      if (!document.hidden) fetchData();
    }

    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [range, filterAdmin, filterBots, visitorLimit]);

  const getChartTitle = () => {
    switch (activeMetric) {
      case 'visitors': return 'Unique Visitors Trend';
      case 'pageviews': return 'Page Views Trend';
      case 'unique_pages': return 'Unique Pages Trend';
      case 'avg_per_user': return 'Avg. Pages/User Trend';
      default: return 'Trend';
    }
  };

  const getMetricColor = () => {
    switch (activeMetric) {
      case 'visitors': return '#3b82f6'; // Blue
      case 'pageviews': return '#a855f7'; // Purple
      case 'unique_pages': return '#eab308'; // Yellow
      case 'avg_per_user': return '#22c55e'; // Green
      default: return '#3b82f6';
    }
  };

  if (!data && loading) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Loading...</div>;
  if (!data) return <div className="min-h-screen bg-neutral-900 text-white p-10">Failed to load data.</div>;

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <span className="text-blue-500">DreamPlay</span> Analytics
            </h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-green-400 bg-green-400/10 px-3 py-1 rounded-full w-fit">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {data.liveUsers} Live Users
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* ADMIN FILTER TOGGLE */}
            <button
              onClick={() => setFilterAdmin(!filterAdmin)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all border ${filterAdmin
                ? 'bg-red-500/20 text-red-400 border-red-500/50'
                : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                }`}
            >
              <ShieldAlert className="w-4 h-4" />
              {filterAdmin ? 'Admin Hidden' : 'Show Admin'}
            </button>

            {/* BOT FILTER TOGGLE */}
            <button
              onClick={() => setFilterBots(!filterBots)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all border ${filterBots
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'
                }`}
            >
              <Bot className="w-4 h-4" />
              {filterBots ? 'Bots Hidden' : 'Show Bots'}
            </button>

            {/* TIME RANGE CONTROLS */}
            <div className="bg-neutral-800 p-1 rounded-lg border border-neutral-700 flex">
              {['24h', '7d', '30d', 'all'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === r ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                    }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-neutral-800 overflow-x-auto">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard size={16} />} label="Traffic Overview" />
          <TabButton active={activeTab === 'visitors'} onClick={() => setActiveTab('visitors')} icon={<Network size={16} />} label="Visitors" />
          <TabButton active={activeTab === 'emailVisitors'} onClick={() => setActiveTab('emailVisitors')} icon={<Mail size={16} />} label="Email Visitors" />
          <TabButton active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={<TrendingUp size={16} />} label="Insights" />
          <TabButton active={activeTab === 'ab'} onClick={() => setActiveTab('ab')} icon={<FlaskConical size={16} />} label="A/B Tests" />
          <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<TableProperties size={16} />} label="Raw Logs" />
          <TabButton active={activeTab === 'chats'} onClick={() => { setActiveTab('chats'); setSelectedChatId(null); }} icon={<MessageCircle size={16} />} label="Chats" />
          <TabButton active={activeTab === 'exports'} onClick={() => setActiveTab('exports')} icon={<Download size={16} />} label="Exports" />
        </div>

        {/* --- TAB CONTENT: OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            {/* KPI CARDS - Clickable to change Chart */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card
                title="Unique Visitors"
                value={data.uniqueVisitors}
                icon={<Users className="text-blue-400" />}
                isActive={activeMetric === 'visitors'}
                onClick={() => setActiveMetric('visitors')}
              />
              <Card
                title="Total Pageviews"
                value={data.totalPageviews}
                icon={<Eye className="text-purple-400" />}
                isActive={activeMetric === 'pageviews'}
                onClick={() => setActiveMetric('pageviews')}
              />
              <Card
                title="Unique Pages"
                value={data.uniquePages}
                icon={<FileText className="text-yellow-400" />}
                isActive={activeMetric === 'unique_pages'}
                onClick={() => setActiveMetric('unique_pages')}
              />
              <Card
                title="Avg. Pages/User"
                value={(data.totalPageviews / (data.uniqueVisitors || 1)).toFixed(1)}
                icon={<Activity className="text-green-400" />}
                isActive={activeMetric === 'avg_per_user'}
                onClick={() => setActiveMetric('avg_per_user')}
              />
            </div>

            {/* CHART */}
            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-xl transition-all">
              <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5" style={{ color: getMetricColor() }} />
                {getChartTitle()}
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.chartData}>
                    <defs>
                      <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getMetricColor()} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={getMetricColor()} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="name" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area
                      type="monotone"
                      dataKey={activeMetric}
                      stroke={getMetricColor()}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorMetric)"
                      animationDuration={500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: VISITORS --- */}
        {activeTab === 'visitors' && (
          <div className="animate-in fade-in">
            {/* If a visitor is selected, show their detail view */}
            {selectedVisitorIp ? (
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                {/* Header with back button */}
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex items-center gap-4">
                  <button
                    onClick={() => setSelectedVisitorIp(null)}
                    className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-neutral-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Visitors
                  </button>
                  <div className="h-5 w-px bg-neutral-700" />
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2 font-mono">
                    <Network className="w-4 h-4 text-blue-400" />
                    {selectedVisitorIp}
                    {data?.visitorStats?.find(v => v.ip === selectedVisitorIp)?.email && !attachingEmail && (
                      <span
                        className="text-sm font-sans font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded ml-2 cursor-pointer hover:bg-green-400/20 transition-colors flex items-center gap-1"
                        onClick={() => {
                          setEmailInput(data?.visitorStats?.find(v => v.ip === selectedVisitorIp)?.email || '');
                          setAttachingEmail(true);
                        }}
                        title="Click to edit email"
                      >
                        {data?.visitorStats?.find(v => v.ip === selectedVisitorIp)?.email}
                        <Pencil size={12} className="text-green-400/50" />
                      </span>
                    )}
                  </h2>
                  <div className="ml-auto flex items-center gap-2">
                    {attachingEmail ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!emailInput.trim() || !selectedVisitorIp) return;
                          setEmailSaving(true);
                          try {
                            const postRes = await fetch('/api/ip-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ip: selectedVisitorIp, email: emailInput.trim() }),
                            });
                            const postData = await postRes.json();
                            if (!postRes.ok) {
                              alert(`Failed to save: ${postData.error || postRes.statusText}`);
                              setEmailSaving(false);
                              return;
                            }
                            // Refresh data to show the new email
                            const timestamp = new Date().getTime();
                            const res = await fetch(`/api/stats-v2?range=${range}&exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&_t=${timestamp}`, { cache: 'no-store' });
                            if (res.ok) setData(await res.json());
                          } catch (err) {
                            console.error(err);
                            alert(`Network error: ${err}`);
                          } finally {
                            setEmailSaving(false);
                            setAttachingEmail(false);
                            setEmailInput('');
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="user@example.com"
                          autoFocus
                          className="bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-56"
                        />
                        <button
                          type="submit"
                          disabled={emailSaving || !emailInput.trim()}
                          className="p-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors"
                        >
                          {emailSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAttachingEmail(false); setEmailInput(''); }}
                          className="p-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => {
                          setEmailInput(data?.visitorStats?.find(v => v.ip === selectedVisitorIp)?.email || '');
                          setAttachingEmail(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                      >
                        <Mail size={14} />
                        {data?.visitorStats?.find(v => v.ip === selectedVisitorIp)?.email ? 'Edit Email' : 'Attach Email'}
                      </button>
                    )}
                  </div>
                </div>

                {historyLoading ? (
                  <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading visitor history…
                  </div>
                ) : visitorHistory ? (
                  <>
                    {/* Visitor metadata cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Pageviews</div>
                        <div className="text-xl font-bold text-white">{visitorHistory.total_pageviews}</div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Pages Visited</div>
                        <div className="text-xl font-bold text-white">
                          {new Set(visitorHistory.visits.map(v => v.path)).size}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Time on Site</div>
                        <div className="text-xl font-bold text-emerald-400">
                          {formatDuration(visitorHistory.visits.reduce((sum, v) => sum + (v.duration_seconds || 0), 0) || null)}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">First Seen</div>
                        <div className="text-sm font-medium text-white">
                          {visitorHistory.first_seen ? new Date(visitorHistory.first_seen).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Last Seen</div>
                        <div className="text-sm font-medium text-white">
                          {visitorHistory.last_seen ? new Date(visitorHistory.last_seen).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          Location
                        </div>
                        <div className="text-sm font-medium text-white">
                          {visitorHistory.geo?.country ? (
                            <>
                              {visitorHistory.geo.city && <span>{decodeURIComponent(visitorHistory.geo.city)}, </span>}
                              {visitorHistory.geo.region && <span>{visitorHistory.geo.region}, </span>}
                              <span>{(() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(visitorHistory.geo.country); } catch { return visitorHistory.geo.country; } })()}</span>
                              <span className="ml-1">{(() => { try { return String.fromCodePoint(...visitorHistory.geo.country.toUpperCase().split('').map(c => 0x1F1E6 - 65 + c.charCodeAt(0))); } catch { return ''; } })()}</span>
                            </>
                          ) : (
                            <span className="text-neutral-500">Unknown</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          Source
                        </div>
                        <div className="text-sm font-medium text-purple-400 break-all">
                          {(() => {
                            const v = data?.visitorStats?.find(v => v.ip === selectedVisitorIp);
                            return v?.source ? v.source : <span className="text-neutral-500">Direct</span>;
                          })()}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          🧭 Journey
                        </div>
                        <div className="text-sm font-medium">
                          {(() => {
                            const v = data?.visitorStats?.find(v => v.ip === selectedVisitorIp);
                            return v?.journey_id ? (
                              <span className="bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs font-mono">{v.journey_id}</span>
                            ) : <span className="text-neutral-500">—</span>;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Visit history table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-neutral-400">
                        <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                          <tr>
                            <th className="px-6 py-3 w-12">#</th>
                            <th className="px-6 py-3">Page</th>
                            <th className="px-6 py-3">Visited At</th>
                            <th className="px-6 py-3">Time on Page</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700/50">
                          {visitorHistory.visits.map((visit: { path: string; visited_at: string; duration_seconds: number | null; slide_events?: { slide_number: number; slide_label: string; duration_seconds: number | null; entered_at: string }[] }, i: number) => {
                            const hasSlides = visit.slide_events && visit.slide_events.length > 0;
                            const isExpanded = expandedSlideRows.has(i);
                            const maxSlide = hasSlides ? Math.max(...visit.slide_events!.map((s: { slide_number: number }) => s.slide_number ?? 0)) : 0;
                            return (
                              <React.Fragment key={i}>
                                <tr className={`hover:bg-white/5 transition-colors ${hasSlides ? 'cursor-pointer' : ''}`}
                                  onClick={() => {
                                    if (!hasSlides) return;
                                    setExpandedSlideRows(prev => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i); else next.add(i);
                                      return next;
                                    });
                                  }}
                                >
                                  <td className="px-6 py-3 text-neutral-500 font-mono text-xs">
                                    <div className="flex items-center gap-1">
                                      {hasSlides && (
                                        isExpanded ? <ChevronDown size={12} className="text-blue-400" /> : <ChevronRight size={12} className="text-neutral-500" />
                                      )}
                                      {i + 1}
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 text-neutral-200">
                                    <div className="flex items-start gap-2">
                                      <span
                                        className="cursor-pointer hover:text-blue-400 transition-colors break-all"
                                        title={visit.path}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const el = e.currentTarget;
                                          const isClamped = el.style.webkitLineClamp === '1';
                                          el.style.webkitLineClamp = isClamped ? 'unset' : '1';
                                          el.style.overflow = isClamped ? 'visible' : 'hidden';
                                        }}
                                        style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                      >
                                        {visit.path}
                                      </span>
                                      {hasSlides && (
                                        <span className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20 whitespace-nowrap">
                                          ↕ Slide {maxSlide + 1}/{17}
                                        </span>
                                      )}
                                      {visit.path.startsWith('http') && (
                                        <a href={visit.path} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-blue-400 flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                                          <ExternalLink size={12} />
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 whitespace-nowrap text-neutral-300">
                                    {new Date(visit.visited_at).toLocaleString()}
                                  </td>
                                  <td className="px-6 py-3 whitespace-nowrap">
                                    <span className={`font-mono text-xs px-2 py-0.5 rounded ${visit.duration_seconds !== null
                                      ? 'bg-blue-500/10 text-blue-400'
                                      : 'bg-neutral-700/50 text-neutral-500'
                                      }`}>
                                      {formatDuration(visit.duration_seconds)}
                                    </span>
                                  </td>
                                </tr>
                                {hasSlides && isExpanded && (
                                  <tr className="bg-neutral-900/60">
                                    <td colSpan={4} className="px-6 py-3">
                                      <div className="ml-6 border-l-2 border-purple-500/30 pl-4">
                                        <p className="text-[10px] uppercase tracking-widest text-purple-400 mb-2 font-semibold">Slide Journey</p>
                                        <div className="grid grid-cols-[40px_1fr_80px_120px] gap-y-1 text-xs">
                                          <span className="text-neutral-500 font-semibold">##</span>
                                          <span className="text-neutral-500 font-semibold">Slide</span>
                                          <span className="text-neutral-500 font-semibold">Time</span>
                                          <span className="text-neutral-500 font-semibold">Entered</span>
                                          {visit.slide_events!.map((s: { slide_number: number; slide_label: string; duration_seconds: number | null; entered_at: string }, si: number) => (
                                            <React.Fragment key={si}>
                                              <span className="text-neutral-500 font-mono">{(s.slide_number ?? 0) + 1}</span>
                                              <span className={`${s.slide_number === maxSlide ? 'text-purple-300 font-medium' : 'text-neutral-300'}`}>
                                                {s.slide_label}
                                                {s.slide_number === maxSlide && <span className="ml-1.5 text-[9px] bg-purple-500/20 text-purple-400 px-1 py-0.5 rounded">deepest</span>}
                                              </span>
                                              <span className="font-mono text-blue-400">
                                                {s.duration_seconds !== null ? formatDuration(s.duration_seconds) : '—'}
                                              </span>
                                              <span className="text-neutral-500">
                                                {new Date(s.entered_at).toLocaleTimeString()}
                                              </span>
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {visitorHistory.visits.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-neutral-500">No page visits recorded.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="px-6 py-12 text-center text-neutral-500">Failed to load visitor history.</div>
                )}
              </div>
            ) : (
              /* Visitor list table */
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex justify-between items-center">
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
                    <Network className="w-4 h-4 text-blue-400" /> Recent Visitors (Last {visitorLimit.toLocaleString()} Events)
                  </h2>
                  <div className="flex items-center gap-1">
                    {[1000, 2000, 3000].map(n => (
                      <button
                        key={n}
                        onClick={() => setVisitorLimit(n)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${visitorLimit === n
                          ? 'bg-blue-600 text-white'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-700 bg-neutral-800'
                          }`}
                      >
                        {(n / 1000)}K
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-neutral-400">
                    <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap">Last Seen</th>
                        <th className="px-4 py-3 whitespace-nowrap">IP Address</th>
                        <th className="px-4 py-3 whitespace-nowrap">Source</th>
                        <th className="px-4 py-3 whitespace-nowrap">Email (if found)</th>
                        <th className="px-4 py-3 whitespace-nowrap">Journey</th>
                        <th className="px-4 py-3 whitespace-nowrap">Country</th>
                        <th className="px-4 py-3 whitespace-nowrap">Device</th>
                        <th className="px-4 py-3 whitespace-nowrap">Page Hits</th>
                        <th className="px-4 py-3 whitespace-nowrap">Time on Page</th>
                        <th className="px-4 py-3 whitespace-nowrap">Last Visited Page</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700/50">
                      {data?.visitorStats?.map((visitor, i) => (
                        <tr
                          key={i}
                          onClick={() => { setSelectedVisitorIp(visitor.ip); setExpandedSlideRows(new Set()); }}
                          className="hover:bg-white/5 transition-colors cursor-pointer group"
                        >
                          <td className="px-4 py-4 whitespace-nowrap text-xs">
                            {new Date(visitor.lastSeen).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 font-mono text-white group-hover:text-blue-400 transition-colors text-xs overflow-hidden">{visitor.ip}</td>
                          <td className="px-4 py-4 min-w-[200px] max-w-[280px]">
                            {visitor.source ? (
                              <span
                                className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-xs font-medium inline-block break-all line-clamp-2"
                                title={visitor.source}
                              >
                                {visitor.source}
                              </span>
                            ) : (
                              <span className="text-neutral-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 overflow-hidden">
                            {visitor.email ? (
                              <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-xs font-medium truncate block">{visitor.email}</span>
                            ) : (
                              <span className="text-neutral-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {visitor.journey_id ? (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-xs font-mono">{visitor.journey_id}</span>
                            ) : (
                              <span className="text-neutral-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className="flex items-center gap-1 text-xs"><Globe size={12} /> {visitor.country}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${visitor.device === 'Mobile' ? 'bg-blue-500/15 text-blue-400' :
                              visitor.device === 'Desktop' ? 'bg-green-500/15 text-green-400' :
                                visitor.device === 'Tablet' ? 'bg-purple-500/15 text-purple-400' :
                                  visitor.device === 'Bot' ? 'bg-orange-500/15 text-orange-400' :
                                    'bg-neutral-700/50 text-neutral-500'
                              }`}>
                              {visitor.device === 'Mobile' ? <Smartphone size={11} /> :
                                visitor.device === 'Desktop' ? <Monitor size={11} /> :
                                  visitor.device === 'Tablet' ? <Tablet size={11} /> :
                                    visitor.device === 'Bot' ? <Bot size={11} /> : null}
                              {visitor.device}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="bg-neutral-700 text-white px-2 py-0.5 rounded text-xs font-mono">{visitor.count}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`font-mono text-xs px-2 py-0.5 rounded ${visitor.totalTimeSeconds > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-700/50 text-neutral-500'}`}>
                              {formatDuration(visitor.totalTimeSeconds > 0 ? visitor.totalTimeSeconds : null)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-neutral-300 text-xs overflow-hidden truncate" title={visitor.lastPath}>
                            {visitor.lastPath}
                          </td>
                        </tr>
                      ))}
                      {(!data?.visitorStats || data.visitorStats.length === 0) && (
                        <tr><td colSpan={10} className="px-6 py-8 text-center text-neutral-500">No visitor data available.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB CONTENT: EMAIL VISITORS --- */}
        {activeTab === 'emailVisitors' && (
          <div className="animate-in fade-in">
            {/* If a visitor is selected, show their detail view (reuse same detail view) */}
            {selectedVisitorIp ? (
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                {/* Header with back button */}
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex items-center gap-4">
                  <button
                    onClick={() => setSelectedVisitorIp(null)}
                    className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-neutral-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Email Visitors
                  </button>
                  <div className="h-5 w-px bg-neutral-700" />
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2 font-mono">
                    <Network className="w-4 h-4 text-blue-400" />
                    {selectedVisitorIp}
                    {emailVisitorsData?.find(v => v.ip === selectedVisitorIp)?.email && !attachingEmail && (
                      <span
                        className="text-sm font-sans font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded ml-2 cursor-pointer hover:bg-green-400/20 transition-colors flex items-center gap-1"
                        onClick={() => {
                          setEmailInput(emailVisitorsData?.find(v => v.ip === selectedVisitorIp)?.email || '');
                          setAttachingEmail(true);
                        }}
                        title="Click to edit email"
                      >
                        {emailVisitorsData?.find(v => v.ip === selectedVisitorIp)?.email}
                        <Pencil size={12} className="text-green-400/50" />
                      </span>
                    )}
                  </h2>
                  <div className="ml-auto flex items-center gap-2">
                    {attachingEmail ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!emailInput.trim() || !selectedVisitorIp) return;
                          setEmailSaving(true);
                          try {
                            const postRes = await fetch('/api/ip-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ip: selectedVisitorIp, email: emailInput.trim() }),
                            });
                            const postData = await postRes.json();
                            if (!postRes.ok) {
                              alert(`Failed to save: ${postData.error || postRes.statusText}`);
                              setEmailSaving(false);
                              return;
                            }
                            // Refresh email visitors data
                            const timestamp = new Date().getTime();
                            const res = await fetch(
                              `/api/email-visitors?exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&limit=${emailVisitorLimit}&_t=${timestamp}`,
                              { cache: 'no-store' }
                            );
                            if (res.ok) {
                              const json = await res.json();
                              setEmailVisitorsData(json.emailVisitorStats);
                            }
                          } catch (err) {
                            console.error(err);
                            alert(`Network error: ${err}`);
                          } finally {
                            setEmailSaving(false);
                            setAttachingEmail(false);
                            setEmailInput('');
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="user@example.com"
                          autoFocus
                          className="bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-56"
                        />
                        <button
                          type="submit"
                          disabled={emailSaving || !emailInput.trim()}
                          className="p-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors"
                        >
                          {emailSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAttachingEmail(false); setEmailInput(''); }}
                          className="p-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEmailInput(emailVisitorsData?.find(v => v.ip === selectedVisitorIp)?.email || '');
                            setAttachingEmail(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                        >
                          <Pencil size={14} />
                          Edit Email
                        </button>
                        <button
                          onClick={async () => {
                            if (!selectedVisitorIp) return;
                            if (!confirm(`Remove email mapping for IP ${selectedVisitorIp}?`)) return;
                            setEmailSaving(true);
                            try {
                              const res = await fetch('/api/ip-email', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ip: selectedVisitorIp }),
                              });
                              if (!res.ok) {
                                const d = await res.json();
                                alert(`Failed to remove: ${d.error || res.statusText}`);
                                return;
                              }
                              // Refresh email visitors data and go back to list
                              const timestamp = new Date().getTime();
                              const fetchRes = await fetch(
                                `/api/email-visitors?exclude_admin=${filterAdmin}&exclude_bots=${filterBots}&limit=${emailVisitorLimit}&_t=${timestamp}`,
                                { cache: 'no-store' }
                              );
                              if (fetchRes.ok) {
                                const json = await fetchRes.json();
                                setEmailVisitorsData(json.emailVisitorStats);
                              }
                              setSelectedVisitorIp(null);
                            } catch (err) {
                              console.error(err);
                              alert(`Network error: ${err}`);
                            } finally {
                              setEmailSaving(false);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-colors"
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {historyLoading ? (
                  <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading visitor history…
                  </div>
                ) : visitorHistory ? (
                  <>
                    {/* Visitor metadata cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Pageviews</div>
                        <div className="text-xl font-bold text-white">{visitorHistory.total_pageviews}</div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Pages Visited</div>
                        <div className="text-xl font-bold text-white">
                          {new Set(visitorHistory.visits.map(v => v.path)).size}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Total Time on Site</div>
                        <div className="text-xl font-bold text-emerald-400">
                          {formatDuration(visitorHistory.visits.reduce((sum, v) => sum + (v.duration_seconds || 0), 0) || null)}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">First Seen</div>
                        <div className="text-sm font-medium text-white">
                          {visitorHistory.first_seen ? new Date(visitorHistory.first_seen).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Last Seen</div>
                        <div className="text-sm font-medium text-white">
                          {visitorHistory.last_seen ? new Date(visitorHistory.last_seen).toLocaleString() : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Visit history table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-neutral-400">
                        <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                          <tr>
                            <th className="px-6 py-3 w-12">#</th>
                            <th className="px-6 py-3">Page</th>
                            <th className="px-6 py-3">Visited At</th>
                            <th className="px-6 py-3">Time on Page</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700/50">
                          {visitorHistory.visits.map((visit, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 text-neutral-500 font-mono text-xs">{i + 1}</td>
                              <td className="px-6 py-3 text-neutral-200 max-w-md">
                                <div className="flex items-center gap-2">
                                  <span className="truncate" title={visit.path}>{visit.path}</span>
                                  {visit.path.startsWith('http') && (
                                    <a href={visit.path} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:text-blue-400 flex-shrink-0">
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-neutral-300">
                                {new Date(visit.visited_at).toLocaleString()}
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap">
                                <span className={`font-mono text-xs px-2 py-0.5 rounded ${visit.duration_seconds !== null
                                  ? 'bg-blue-500/10 text-blue-400'
                                  : 'bg-neutral-700/50 text-neutral-500'
                                  }`}>
                                  {formatDuration(visit.duration_seconds)}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {visitorHistory.visits.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-neutral-500">No page visits recorded.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="px-6 py-12 text-center text-neutral-500">Failed to load visitor history.</div>
                )}
              </div>
            ) : (
              /* Email Visitors list table */
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex justify-between items-center">
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-green-400" />
                    Email Visitors (Last {emailVisitorLimit.toLocaleString()} Events)
                  </h2>
                  <div className="flex items-center gap-1">
                    {[1000, 2000, 3000].map(n => (
                      <button
                        key={n}
                        onClick={() => setEmailVisitorLimit(n)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${emailVisitorLimit === n
                          ? 'bg-green-600 text-white'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-700 bg-neutral-800'
                          }`}
                      >
                        {(n / 1000)}K
                      </button>
                    ))}
                  </div>
                </div>
                {emailVisitorsLoading ? (
                  <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading email visitors…
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-neutral-400">
                      <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                        <tr>
                          <th className="px-6 py-3">Last Seen</th>
                          <th className="px-6 py-3">Email</th>
                          <th className="px-6 py-3">Source</th>
                          <th className="px-6 py-3">IP Address</th>
                          <th className="px-6 py-3">Country</th>
                          <th className="px-6 py-3">Page Hits</th>
                          <th className="px-6 py-3">Last Visited Page</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-700/50">
                        {emailVisitorsData?.map((visitor, i) => (
                          <tr
                            key={i}
                            onClick={() => setSelectedVisitorIp(visitor.ip)}
                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                              {new Date(visitor.lastSeen).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">{visitor.email}</span>
                              {visitor.purchased && (
                                <span className="ml-2 bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Purchased</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {visitor.source ? (
                                <span
                                  className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-xs font-medium inline-block break-all"
                                  title={visitor.source}
                                >
                                  {visitor.source}
                                </span>
                              ) : (
                                <span className="text-neutral-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-white group-hover:text-blue-400 transition-colors">{visitor.ip}</td>
                            <td className="px-6 py-4 flex items-center gap-2">
                              <Globe size={12} /> {visitor.country}
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-neutral-700 text-white px-2 py-0.5 rounded text-xs font-mono">{visitor.count}</span>
                            </td>
                            <td className="px-6 py-4 text-neutral-300 max-w-xs truncate" title={visitor.lastPath}>
                              {visitor.lastPath}
                            </td>
                          </tr>
                        ))}
                        {(!emailVisitorsData || emailVisitorsData.length === 0) && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-500">No email visitors found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- TAB CONTENT: INSIGHTS --- */}
        {activeTab === 'insights' && (
          <div className="space-y-6 animate-in fade-in">
            {insightsLoading ? (
              <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing visitor journeys…
              </div>
            ) : insightsData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-neutral-800 p-5 rounded-xl border border-neutral-700">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Visitors Who Reached Checkout</div>
                    <div className="text-3xl font-bold text-white">{insightsData.totalConverters}<span className="text-lg text-neutral-500 ml-1">/ {insightsData.totalVisitors}</span></div>
                    <div className="text-sm text-blue-400 mt-1">{insightsData.conversionRate}% conversion rate</div>
                  </div>
                  <div className="bg-neutral-800 p-5 rounded-xl border border-neutral-700">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Converter Avg. Session</div>
                    <div className="text-3xl font-bold text-white">{insightsData.converterAvg.pagesPerSession} <span className="text-lg text-neutral-500">pages</span></div>
                    <div className="text-sm text-neutral-400 mt-1">{formatDuration(insightsData.converterAvg.sessionDuration)} avg duration</div>
                  </div>
                  <div className="bg-neutral-800 p-5 rounded-xl border border-neutral-700">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">All Visitor Avg. Session</div>
                    <div className="text-3xl font-bold text-white">{insightsData.allVisitorAvg.pagesPerSession} <span className="text-lg text-neutral-500">pages</span></div>
                    <div className="text-sm text-neutral-400 mt-1">{formatDuration(insightsData.allVisitorAvg.sessionDuration)} avg duration</div>
                  </div>
                </div>

                {/* Panel 1: Pages That Drive Purchases */}
                <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                  <div className="p-4 border-b border-neutral-700">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-green-400" />
                      Pages That Drive Purchases
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Of visitors who reached a checkout page, what % visited each page beforehand</p>
                  </div>
                  {insightsData.pagesBeforePurchase.length === 0 ? (
                    <div className="px-6 py-12 text-center text-neutral-500">No converters found in this time range.</div>
                  ) : (
                    <div className="divide-y divide-neutral-700/50">
                      {insightsData.pagesBeforePurchase.map((item, i) => (
                        <div key={i} className="px-6 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors">
                          <span className="text-neutral-500 font-mono text-xs w-6 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-neutral-200 text-sm truncate" title={item.page}>{item.page}</span>
                              <span className="text-sm font-mono ml-3 flex-shrink-0">
                                <span className="text-green-400 font-bold">{item.percentage}%</span>
                                <span className="text-neutral-500 ml-1">({item.converterCount})</span>
                              </span>
                            </div>
                            <div className="w-full bg-neutral-700/50 rounded-full h-1.5">
                              <div
                                className="bg-green-500/70 h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Panel 1.5: Top Page Flows */}
                {insightsData.topFlows.length > 0 && (
                  <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                    <div className="p-4 border-b border-neutral-700">
                      <h3 className="font-semibold text-neutral-200 flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-blue-400" />
                        Common Converter Page Flows
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">Most frequent page-to-page transitions among visitors who reached checkout</p>
                    </div>
                    <div className="divide-y divide-neutral-700/50">
                      {insightsData.topFlows.map((flow, i) => (
                        <div key={i} className="px-6 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-neutral-500 font-mono text-xs w-6 text-right">{i + 1}</span>
                            <span className="text-neutral-200 text-sm truncate">{flow.flow}</span>
                          </div>
                          <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-xs font-mono flex-shrink-0 ml-3">{flow.count}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Panel 2: Page Engagement Table */}
                <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                  <div className="p-4 border-b border-neutral-700">
                    <h3 className="font-semibold text-neutral-200 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-purple-400" />
                      Page Engagement
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Click column headers to sort</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-neutral-400">
                      <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                        <tr>
                          <th className="px-6 py-3">Page</th>
                          <th className="px-6 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => setEngagementSort(s => ({ field: 'views', asc: s.field === 'views' ? !s.asc : false }))}>Views {engagementSort.field === 'views' && (engagementSort.asc ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => setEngagementSort(s => ({ field: 'uniqueVisitors', asc: s.field === 'uniqueVisitors' ? !s.asc : false }))}>Unique Visitors {engagementSort.field === 'uniqueVisitors' && (engagementSort.asc ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => setEngagementSort(s => ({ field: 'avgTimeSeconds', asc: s.field === 'avgTimeSeconds' ? !s.asc : false }))}>Avg. Time {engagementSort.field === 'avgTimeSeconds' && (engagementSort.asc ? '↑' : '↓')}</th>
                          <th className="px-6 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => setEngagementSort(s => ({ field: 'exitRate', asc: s.field === 'exitRate' ? !s.asc : false }))}>Exit Rate {engagementSort.field === 'exitRate' && (engagementSort.asc ? '↑' : '↓')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-700/50">
                        {[...insightsData.pageEngagement]
                          .sort((a, b) => {
                            const aVal = a[engagementSort.field] ?? -1;
                            const bVal = b[engagementSort.field] ?? -1;
                            return engagementSort.asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
                          })
                          .map((page, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 text-neutral-200 max-w-xs truncate" title={page.page}>{page.page}</td>
                              <td className="px-6 py-3 font-mono">{page.views}</td>
                              <td className="px-6 py-3 font-mono">{page.uniqueVisitors}</td>
                              <td className="px-6 py-3">
                                <span className={`font-mono text-xs px-2 py-0.5 rounded ${page.avgTimeSeconds !== null ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-700/50 text-neutral-500'}`}>
                                  {formatDuration(page.avgTimeSeconds)}
                                </span>
                              </td>
                              <td className="px-6 py-3">
                                <span className={`font-mono text-xs px-2 py-0.5 rounded ${page.exitRate > 30 ? 'bg-red-500/10 text-red-400' :
                                  page.exitRate > 15 ? 'bg-yellow-500/10 text-yellow-400' :
                                    'bg-green-500/10 text-green-400'
                                  }`}>
                                  {page.exitRate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-12 text-center text-neutral-500">Failed to load insights data.</div>
            )}
          </div>
        )}

        {/* --- TAB CONTENT: A/B TESTS --- */}
        {activeTab === 'ab' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-neutral-800/50 rounded-xl border border-neutral-700 p-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-blue-400" />
                Checkout A/B Test
              </h3>
              <p className="text-sm text-neutral-400 mt-1">Deterministic round-robin: PDP (Product Detail Page) vs Customize Wizard</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.abResults.length === 0 ? (
                <div className="col-span-2 text-center py-20 text-neutral-500">No A/B tests recorded yet.</div>
              ) : (
                data.abResults.map((variant) => (
                  <div key={variant.variant} className="bg-neutral-800 p-6 rounded-xl border border-neutral-700">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold capitalize text-white">{variant.label || variant.variant}</h3>
                      <span className="text-xs font-mono bg-neutral-900 px-2 py-1 rounded text-neutral-400">/{variant.variant}</span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-neutral-900/50 rounded-lg">
                        <span className="text-sm text-neutral-400">Visitors</span>
                        <span className="font-mono font-bold">{variant.visitors}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-neutral-900/50 rounded-lg">
                        <span className="text-sm text-neutral-400">Conversions</span>
                        <span className="font-mono font-bold text-green-400">{variant.conversions}</span>
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Conversion Rate</span>
                          <span className="font-bold">{variant.conversion_rate}%</span>
                        </div>
                        <div className="w-full bg-neutral-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(Number(variant.conversion_rate), 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: CHATS --- */}
        {activeTab === 'chats' && (
          <div className="animate-in fade-in">
            {selectedChatId ? (
              /* Chat Detail View */
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex items-center gap-4">
                  <button
                    onClick={() => setSelectedChatId(null)}
                    className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-neutral-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Chats
                  </button>
                  <div className="h-5 w-px bg-neutral-700" />
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    Chat Session
                    {selectedChatSession?.email && (
                      <span className="text-sm font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded ml-2">
                        {selectedChatSession.email}
                      </span>
                    )}
                    {selectedChatSession?.status === 'admin_takeover' && (
                      <span className="text-xs font-medium text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded ml-2">
                        Admin Takeover
                      </span>
                    )}
                  </h2>
                </div>

                {chatDetailLoading ? (
                  <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading conversation…
                  </div>
                ) : (
                  <>
                    {/* Session metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Messages</div>
                        <div className="text-xl font-bold text-white">{chatMessages.length}</div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Started</div>
                        <div className="text-sm font-medium text-white">
                          {selectedChatSession?.created_at ? new Date(selectedChatSession.created_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Page</div>
                        <div className="text-sm font-medium text-white truncate" title={selectedChatSession?.page_url || ''}>
                          {selectedChatSession?.page_url || '—'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/60 rounded-lg p-3">
                        <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">IP</div>
                        <div className="text-sm font-medium text-white font-mono">
                          {selectedChatSession?.ip_address || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Message Thread */}
                    <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' :
                            msg.role === 'admin' ? 'justify-end' : 'justify-start'
                            }`}
                        >
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : msg.role === 'admin'
                              ? 'bg-orange-600 text-white rounded-tr-sm'
                              : 'bg-neutral-700 text-neutral-200 rounded-tl-sm'
                            }`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">
                              {msg.role === 'user' ? '👤 User' : msg.role === 'admin' ? '🛡️ Admin' : '🤖 AI'}
                            </div>
                            {msg.content}
                            <div className="text-[10px] opacity-40 mt-1">
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                      {chatMessages.length === 0 && (
                        <div className="text-center text-neutral-500 py-8">No messages in this session.</div>
                      )}
                    </div>

                    {/* Admin Reply Input */}
                    <div className="p-4 border-t border-neutral-700 bg-neutral-900/50">
                      <div className="text-xs text-neutral-500 mb-2">
                        💬 Send a reply as admin — this will pause the AI auto-response for 24 hours on this session.
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={adminReply}
                          onChange={(e) => setAdminReply(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdminReply(); } }}
                          placeholder="Type your reply..."
                          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <button
                          onClick={handleAdminReply}
                          disabled={!adminReply.trim() || adminReplySending}
                          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                          {adminReplySending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          Reply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Chat Sessions List */
              <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
                <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex justify-between items-center">
                  <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    Recent Chat Sessions
                  </h2>
                </div>
                {chatSessionsLoading ? (
                  <div className="flex items-center justify-center py-20 text-neutral-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading chat sessions…
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-neutral-400">
                      <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                        <tr>
                          <th className="px-6 py-3">Email / ID</th>
                          <th className="px-6 py-3">IP</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3">Messages</th>
                          <th className="px-6 py-3">Last Message</th>
                          <th className="px-6 py-3">Page</th>
                          <th className="px-6 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-700/50">
                        {chatSessions?.map((session) => (
                          <tr
                            key={session.id}
                            onClick={() => setSelectedChatId(session.id)}
                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <td className="px-6 py-4">
                              {session.email ? (
                                <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">{session.email}</span>
                              ) : (
                                <span className="text-neutral-600 text-xs font-mono">{session.id.slice(0, 8)}…</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-neutral-400">
                              {session.ip_address || '—'}
                            </td>
                            <td className="px-6 py-4">
                              {session.status === 'admin_takeover' ? (
                                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Admin</span>
                              ) : (
                                <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">Active</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-neutral-700 text-white px-2 py-0.5 rounded text-xs font-mono">{session.message_count}</span>
                            </td>
                            <td className="px-6 py-4 text-neutral-300 max-w-xs truncate" title={session.last_message || ''}>
                              {session.last_message ? (
                                <span className="text-xs">
                                  <span className="text-neutral-500">{session.last_message_role === 'user' ? '👤' : session.last_message_role === 'admin' ? '🛡️' : '🤖'}</span>{' '}
                                  {session.last_message}
                                </span>
                              ) : (
                                <span className="text-neutral-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-neutral-300 max-w-[120px] truncate text-xs" title={session.page_url || ''}>
                              {session.page_url || '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                              {new Date(session.updated_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {(!chatSessions || chatSessions.length === 0) && (
                          <tr><td colSpan={7} className="px-6 py-8 text-center text-neutral-500">No chat sessions yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- TAB CONTENT: LOGS --- */}
        {activeTab === 'logs' && (
          <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden animate-in fade-in">
            <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex justify-between items-center">
              <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-400" /> Recent Events
              </h2>
            </div>
            <div className="max-h-[600px] overflow-y-auto divide-y divide-neutral-700/50">
              {data.recentEvents.map((event, i) => (
                <div key={i} className="p-4 hover:bg-white/5 transition-colors group flex flex-col sm:flex-row gap-4 text-sm">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-bold ${event.event_name.includes('click') ? 'text-green-400' : 'text-blue-400'}`}>
                        {event.event_name}
                      </span>
                      <span className="text-neutral-500">•</span>
                      <span className="text-neutral-300">{event.path}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-neutral-500 font-mono">
                      <span className="flex items-center gap-1"><Globe size={10} /> {event.country || 'Unknown'}</span>
                      <span className="flex items-center gap-1" title={event.user_agent || 'Unknown UA'}><Smartphone size={10} /> {event.user_agent?.includes('Mac') ? 'Mac' : 'Device'}</span>
                      <span className="opacity-50">{event.ip_address}</span>
                      {!!event.metadata?.utm_source && (
                        <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 text-[10px]">
                          {String(event.metadata.utm_source)}{event.metadata.utm_medium ? ` / ${String(event.metadata.utm_medium)}` : ''}
                        </span>
                      )}
                      {!!event.metadata?.referrer && (
                        <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 text-[10px] truncate max-w-[150px]" title={String(event.metadata.referrer)}>
                          Ref: {(() => { try { return new URL(String(event.metadata.referrer)).hostname.replace('www.', '') } catch { return String(event.metadata.referrer).substring(0, 30) } })()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: EXPORTS --- */}
        {activeTab === 'exports' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-400" />
                    Export Visitors
                  </h2>
                  <p className="text-sm text-neutral-400 mt-1">Download a CSV of all visitors with source, location, and activity.</p>
                </div>
              </div>

              {/* Date Range Selector */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-sm text-neutral-400">Date Range:</span>
                <div className="flex gap-2">
                  {[
                    { value: '1d', label: 'Today' },
                    { value: '3d', label: 'Past 3 Days' },
                    { value: '7d', label: 'Past 7 Days' },
                    { value: '14d', label: 'Past 14 Days' },
                    { value: '30d', label: 'Past Month' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setExportRange(opt.value); setExportData(null); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${exportRange === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate / Download Buttons */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={async () => {
                    setExportLoading(true);
                    try {
                      const res = await fetch(`/api/export-visitors?range=${exportRange}&exclude_admin=${filterAdmin}`);
                      const json = await res.json();
                      setExportData(json.rows || []);
                    } catch (err) {
                      console.error(err);
                    } finally {
                      setExportLoading(false);
                    }
                  }}
                  disabled={exportLoading}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {exportLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating...</>
                  ) : (
                    <><Eye size={14} /> Preview Data</>
                  )}
                </button>
                {exportData && exportData.length > 0 && (
                  <button
                    onClick={() => {
                      const headers = ['IP Address', 'Email (if found)', 'Source', 'Country', 'Page Hits', 'Total Time on Page (s)', 'Pages Visited (Top 5)', 'Last Visit (Full URL)'];
                      const csvRows = [headers.join(',')];
                      exportData.forEach(row => {
                        csvRows.push([
                          `"${row.ip}"`,
                          `"${String(row.email || '').replace(/"/g, '""')}"`,
                          `"${String(row.source || '').replace(/"/g, '""')}"`,
                          `"${row.country}"`,
                          row.pageHits,
                          row.totalTimeSeconds,
                          `"${String(row.topPages || '').replace(/"/g, '""')}"`,
                          `"${String(row.lastVisitedRaw || '').replace(/"/g, '""')}"`,
                        ].join(','));
                      });
                      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `visitors-export-${exportRange}-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Download size={14} /> Download CSV ({exportData.length} rows)
                  </button>
                )}
              </div>

              {/* Preview Table */}
              {exportData && (
                <div className="overflow-x-auto rounded-lg border border-neutral-700">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-900/50 text-neutral-300 uppercase font-medium text-xs">
                      <tr>
                        <th className="px-4 py-3">IP Address</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Country</th>
                        <th className="px-4 py-3 text-right">Page Hits</th>
                        <th className="px-4 py-3 text-right">Total Time (s)</th>
                        <th className="px-4 py-3">Pages Visited (Top 5)</th>
                        <th className="px-4 py-3">Last Visit (Full URL)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700/50">
                      {exportData.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-500">No visitors found for this date range.</td></tr>
                      ) : (
                        exportData.slice(0, 50).map((row: Record<string, string | number>, i: number) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors text-neutral-300">
                            <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{row.ip}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {row.email ? (
                                <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20 text-xs">{row.email}</span>
                              ) : (
                                <span className="text-neutral-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {row.source !== 'Direct' ? (
                                <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 text-xs">{row.source}</span>
                              ) : (
                                <span className="text-neutral-500 text-xs">Direct</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs">{row.country}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs">{row.pageHits}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs">{row.totalTimeSeconds}</td>
                            <td className="px-4 py-2.5 text-xs text-neutral-400 max-w-md">
                              <span className="break-all">{row.topPages || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-neutral-500 max-w-lg">
                              <span className="break-all font-mono">{row.lastVisitedRaw || '—'}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {exportData.length > 50 && (
                    <div className="px-4 py-2 text-xs text-neutral-500 bg-neutral-900/30 border-t border-neutral-700">
                      Showing 50 of {exportData.length} rows. Download CSV for full data.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// --- COMPONENTS ---

function Card({ title, value, icon, isActive, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-neutral-800 p-6 rounded-xl border flex flex-col justify-between h-28 cursor-pointer transition-all hover:bg-neutral-700/80 ${isActive ? 'border-blue-500 ring-1 ring-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-neutral-700 hover:border-neutral-600'
        }`}
    >
      <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider">
        {title}
        {icon}
      </div>
      <div className="text-3xl font-bold text-white mt-2">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${active
        ? 'border-blue-500 text-blue-400 bg-neutral-800/50'
        : 'border-transparent text-neutral-400 hover:text-white hover:bg-neutral-800'
        }`}
    >
      {icon}
      {label}
    </button>
  );
}
