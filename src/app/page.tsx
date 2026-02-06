
'use client';

import { useEffect, useState } from 'react';
import { Activity, Users, Eye } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    users: 0,
    pageviews: 0,
    events: [] // Initialize as empty array to prevent crash
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/stats');
        // If the API fails, don't crash, just log it
        if (!res.ok) {
          console.error("API Error:", res.status);
          return;
        }
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // Safe check before slicing
  const recentEvents = Array.isArray(stats.events) ? stats.events.slice(0, 10) : [];

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <span className="text-blue-500">DreamPlay</span> Analytics
          </h1>
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Live Users (5m)" value={stats.users} icon={<Users className="w-4 h-4 text-blue-400" />} />
          <Card title="Total Pageviews" value={stats.pageviews} icon={<Eye className="w-4 h-4 text-purple-400" />} />
          <Card title="System Status" value="Operational" icon={<Activity className="w-4 h-4 text-green-400" />} isText />
        </div>

        {/* Recent Events List */}
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
          <div className="p-4 border-b border-neutral-700 bg-neutral-800/50">
            <h2 className="font-semibold text-neutral-200">Recent Events</h2>
          </div>
          <div className="divide-y divide-neutral-700">
            {recentEvents.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 italic">
                {loading ? "Loading events..." : "No events recorded yet. Visit your sites to trigger tracking."}
              </div>
            ) : (
              recentEvents.map((event: any, i: number) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-neutral-700/50 transition-colors">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-white flex items-center gap-2">
                      {event.event_name}
                      <span className="text-xs font-normal text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded">
                        {event.country || 'Unknown'}
                      </span>
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">{event.path}</span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, icon, isText = false }: any) {
  return (
    <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 flex flex-col justify-between h-32">
      <div className="flex items-center justify-between text-neutral-400 text-xs font-medium uppercase tracking-wider">
        {title}
        {icon}
      </div>
      <div className={`text-3xl font-bold ${isText ? 'text-green-400 text-xl' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}
