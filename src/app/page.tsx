
'use client';

import { useEffect, useState } from 'react';
import { Activity, Users, Eye, Clock, Smartphone, Globe, Hash } from 'lucide-react';

// 1. Helper function (if you didn't put it in a separate file)
function getDeviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Macintosh')) return 'Mac OS';
  if (userAgent.includes('Windows')) return 'Windows';
  return 'Desktop';
}

interface AnalyticsEvent {
  id: string;
  event_name: string;
  country: string | null;
  path: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
}

interface DashboardStats {
  users: number;
  pageviews: number;
  events: AnalyticsEvent[];
}

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  isText?: boolean;
  subtitle?: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    users: 0,
    pageviews: 0,
    events: []
  });
  const [range, setRange] = useState('24h'); // State for time range
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Pass the range param to the API
        const res = await fetch(`/api/stats?range=${range}`);
        if (!res.ok) return;
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // Refresh every 10s
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [range]); // Re-run when 'range' changes

  const recentEvents = Array.isArray(stats.events) ? stats.events : [];

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <span className="text-blue-500">DreamPlay</span> Analytics
          </h1>

          <div className="flex items-center gap-2 bg-neutral-800 p-1 rounded-lg border border-neutral-700">
            {['1h', '24h', '7d', '30d', 'all'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${range === r
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                  }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            title="Live Users"
            value={stats.users}
            icon={<Users className="w-4 h-4 text-blue-400" />}
            subtitle="Active in last 5m"
          />
          <Card
            title="Pageviews"
            value={loading ? '...' : stats.pageviews}
            icon={<Eye className="w-4 h-4 text-purple-400" />}
            subtitle={`In the last ${range}`}
          />
          <Card
            title="System Status"
            value="Operational"
            icon={<Activity className="w-4 h-4 text-green-400" />}
            isText
          />
        </div>

        {/* Updated Recent Events List */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-neutral-700 bg-neutral-800/80 backdrop-blur flex justify-between items-center">
            <h2 className="font-semibold text-neutral-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-400" /> Recent Activity
            </h2>
            <div className="text-xs text-neutral-500 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              Live Feed
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto divide-y divide-neutral-700/50 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
            {recentEvents.length === 0 ? (
              <div className="p-12 text-center text-neutral-500">No events found.</div>
            ) : (
              recentEvents.map((event, i) => (
                <div key={i} className="p-4 hover:bg-white/5 transition-colors group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">

                  {/* Left: Event & Path */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`font-bold text-sm ${event.event_name === 'conversion' ? 'text-green-400' : 'text-white'}`}>
                        {event.event_name}
                      </span>
                      {/* Country Badge */}
                      {event.country && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700/50 uppercase tracking-wider">
                          <Globe className="w-3 h-3" /> {event.country}
                        </span>
                      )}
                    </div>
                    {/* Path */}
                    <div className="text-xs text-neutral-400 font-mono truncate max-w-[400px] opacity-80 group-hover:opacity-100 transition-opacity" title={event.path}>
                      {event.path}
                    </div>
                  </div>

                  {/* Middle: Tech Details (IP, Device, ID) */}
                  <div className="flex items-center gap-4 text-xs text-neutral-500 font-mono sm:mr-8">
                    {/* Device */}
                    <div className="flex items-center gap-1.5 min-w-[80px]" title={event.user_agent || ''}>
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{getDeviceName(event.user_agent)}</span>
                    </div>

                    {/* IP Address */}
                    <div className="hidden sm:block opacity-60">
                      {event.ip_address || 'Unknown IP'}
                    </div>

                    {/* Session ID (Truncated) */}
                    <div className="flex items-center gap-1 opacity-40" title={`Session: ${event.session_id}`}>
                      <Hash className="w-3 h-3" />
                      {event.session_id?.slice(0, 6)}...
                    </div>
                  </div>

                  {/* Right: Time */}
                  <div className="text-xs text-neutral-400 font-medium whitespace-nowrap text-right min-w-[70px]">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>

                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, icon, isText = false, subtitle }: CardProps) {
  return (
    <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 flex flex-col justify-between h-32 relative overflow-hidden">
      <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider z-10">
        {title}
        {icon}
      </div>
      <div className={`text-3xl font-bold z-10 ${isText ? 'text-green-400 text-xl' : 'text-white'}`}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-neutral-500 z-10">{subtitle}</div>}

      {/* Subtle background glow effect */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
    </div>
  );
}
