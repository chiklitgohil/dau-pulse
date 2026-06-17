import { getDashboardData } from '../actions';
import Link from 'next/link';
import { AlertCircle, Clock, CheckCircle, BarChart3, ChevronRight, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const { issues, clusters } = await getDashboardData();

  const totalIssues = issues.length;
  const urgentIssues = issues.filter(i => i.urgency >= 4 && i.status !== 'Resolved').length;
  const activeClusters = clusters.filter(c => c.status !== 'Resolved').length;
  const resolvedIssues = issues.filter(i => i.status === 'Resolved').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-[var(--color-dau-blue)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Reports</p>
            <p className="text-2xl font-bold text-slate-800">{totalIssues}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-[var(--color-dau-red)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Urgent Reports</p>
            <p className="text-2xl font-bold text-slate-800">{urgentIssues}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
            <Layers className="w-6 h-6 text-[var(--color-dau-orange)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Active Clusters</p>
            <p className="text-2xl font-bold text-slate-800">{activeClusters}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Resolved</p>
            <p className="text-2xl font-bold text-slate-800">{resolvedIssues}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Clusters */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--color-dau-blue)]" />
              Priority Issue Clusters
            </h2>
          </div>
          {clusters.filter(c => c.status !== 'Resolved').sort((a, b) => b.urgencyScore - a.urgencyScore).map(cluster => (
            <Link href={`/admin/clusters/${cluster.id}`} key={cluster.id} className="block group">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:border-[var(--color-dau-blue)]/30 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-[var(--color-dau-blue)] transition-colors">{cluster.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-sm">
                      <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 font-medium">{cluster.category}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{cluster.location}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-[var(--color-dau-orange)] font-semibold">{cluster.reportCount} Reports</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cluster.urgencyScore >= 4 ? 'bg-red-50 text-[var(--color-dau-red)] border-red-100' : 'bg-yellow-50 text-[var(--color-dau-yellow)] border-yellow-100'}`}>
                      Urgency: {cluster.urgencyScore}/5
                    </span>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[var(--color-dau-blue)] transition-colors transform group-hover:translate-x-1" />
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-600 line-clamp-2">{cluster.summary}</p>
                </div>
              </div>
            </Link>
          ))}
          {activeClusters === 0 && (
             <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
               <p className="text-slate-500">No active clusters. Everything looks good!</p>
             </div>
          )}
        </div>

        {/* Recent Individual Reports */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--color-dau-blue)]" />
            Recent Reports
          </h2>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map(issue => (
              <div key={issue.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-[var(--color-dau-blue)]">{issue.id}</span>
                  <span className="text-xs text-slate-400">{new Date(issue.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-slate-700 font-medium mb-2 line-clamp-2">{issue.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{issue.category}</span>
                  <span className={`font-semibold ${issue.status === 'New' ? 'text-[var(--color-dau-orange)]' : 'text-slate-500'}`}>{issue.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
