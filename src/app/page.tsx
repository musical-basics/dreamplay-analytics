
'use client';

import { useEffect, useState } from 'react';
import { Activity, Users, Eye, Clock } from 'lucide-react';

interface AnalyticsEvent {
  id: number;
  event_name: string;
  path: string;
  created_at: string;
  session_id: string;
  country?: string;
}

interface DashboardStats {
  liveUsers: number;
  totalPageviews: number;
  recentEvents: AnalyticsEvent[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
        <div className="animate-pulse">Loading Analytics...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            <span className="text-blue-500">Dreamplay</span> Analytics
          </h1>
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            Live
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Live Users (5m)</h3>
              <Users className="text-blue-500 w-5 h-5" />
            </div>
            <div className="text-4xl font-bold text-white transition-all duration-300">
              {stats?.liveUsers ?? 0}
            </div>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Total Pageviews</h3>
              <Eye className="text-purple-500 w-5 h-5" />
            </div>
            <div className="text-4xl font-bold text-white transition-all duration-300">
              {stats?.totalPageviews?.toLocaleString() ?? 0}
            </div>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">System Status</h3>
              <Activity className="text-green-500 w-5 h-5" />
            </div>
            <div className="text-lg font-medium text-green-400">
              Operational
            </div>
            <div className="text-xs text-neutral-500 mt-2">
              Ingesting events...
            </div>
          </div>
        </div>

        {/* Recent Events Feed */}
        <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-neutral-700 bg-neutral-800/50">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-neutral-400" />
              Recent Events
            </h2>
          </div>
          <div className="divide-y divide-neutral-700/50">
            {stats?.recentEvents.map((event, idx) => (
              <div key={event.id || idx} className="p-4 hover:bg-neutral-800/50 transition-colors flex items-center justify-between group">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${event.event_name === 'pageview'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      }`}>
                      {event.event_name}
                    </span>
                    <span className="text-neutral-300 text-sm font-medium truncate max-w-md">
                      {event.path.replace('https://', '')}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 flex items-center gap-2">
                    {event.country && <span>{event.country}</span>}
                    <span>•</span>
                    <span className="font-mono">{event.session_id.slice(0, 8)}...</span>
                  </div>
                </div>
                <div className="text-xs text-neutral-500 font-mono whitespace-nowrap">
                  {new Date(event.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}

            {(!stats?.recentEvents || stats.recentEvents.length === 0) && (
              <div className="p-8 text-center text-neutral-500 italic">
                No events recorded yet. Visit the sites to trigger tracking.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
