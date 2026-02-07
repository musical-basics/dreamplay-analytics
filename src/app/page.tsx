
'use client';

import { useEffect, useState } from 'react';
import {
  Activity, Users, Eye, Clock, FileText,
  LayoutDashboard, TableProperties, FlaskConical, Globe, Smartphone, ShieldAlert
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
  abResults: { variant: string; visitors: number; conversions: number; conversion_rate: number }[];
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');
  const [filterAdmin, setFilterAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'ab' | 'logs'>('overview');
  const [activeMetric, setActiveMetric] = useState<MetricType>('pageviews');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/stats?range=${range}&exclude_admin=${filterAdmin}`);
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

    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [range, filterAdmin]);

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
        <div className="flex border-b border-neutral-800">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard size={16} />} label="Traffic Overview" />
          <TabButton active={activeTab === 'ab'} onClick={() => setActiveTab('ab')} icon={<FlaskConical size={16} />} label="A/B Tests" />
          <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<TableProperties size={16} />} label="Raw Logs" />
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

        {/* --- TAB CONTENT: A/B TESTS --- */}
        {activeTab === 'ab' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
            {data.abResults.length === 0 ? (
              <div className="col-span-2 text-center py-20 text-neutral-500">No A/B tests recorded yet.</div>
            ) : (
              data.abResults.map((variant) => (
                <div key={variant.variant} className="bg-neutral-800 p-6 rounded-xl border border-neutral-700">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold capitalize text-white">{variant.variant}</h3>
                    <span className="text-xs font-mono bg-neutral-900 px-2 py-1 rounded text-neutral-400">ID: {variant.variant}</span>
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
