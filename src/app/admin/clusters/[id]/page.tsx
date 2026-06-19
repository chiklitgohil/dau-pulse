import { getDashboardData, resolveCluster } from '@/app/actions';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ShieldAlert, Zap, Building, Users } from 'lucide-react';

export default async function ClusterDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { clusters, issues } = await getDashboardData();
  const cluster = clusters.find(c => c.id === resolvedParams.id);

  if (!cluster) {
    notFound();
  }

  const clusterIssues = issues.filter(i => cluster.issueIds.includes(i.id));

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-[var(--color-dau-blue)] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
        <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-dau-blue)] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-white backdrop-blur-sm border border-white/20">
                  {cluster.category}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cluster.urgencyScore >= 4 ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30'}`}>
                  Urgency: {cluster.urgencyScore}/5
                </span>
              </div>
              <h1 className="text-3xl font-bold mb-2">{cluster.title}</h1>
              <p className="text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Affecting {cluster.location} • {cluster.reportCount} Reports
              </p>
            </div>
            
            <div className="flex-shrink-0">
              {cluster.status === 'Resolved' ? (
                <div className="bg-green-500/20 text-green-200 border border-green-500/30 px-6 py-3 rounded-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Resolved
                </div>
              ) : (
                <form action={resolveCluster.bind(null, cluster.id)}>
                  <button type="submit" className="bg-[var(--color-dau-yellow)] hover:bg-yellow-400 text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Mark Resolved
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* AI Intelligence Panel */}
          <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
            <h2 className="text-lg font-bold text-[var(--color-dau-blue)] flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5" />
              AI Intelligence Report
            </h2>
            <p className="text-slate-700 leading-relaxed mb-6 bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
              {cluster.summary}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex items-start gap-3">
                <div className="mt-1 bg-blue-100 p-2 rounded-lg text-[var(--color-dau-blue)]">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Suggested Department</p>
                  <p className="font-bold text-slate-800">{cluster.suggestedDepartment}</p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex items-start gap-3">
                <div className="mt-1 bg-orange-100 p-2 rounded-lg text-[var(--color-dau-orange)]">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Recommended Action</p>
                  <p className="font-bold text-slate-800">{cluster.suggestedAction}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Individual Reports */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Student Reports in this Cluster</h3>
            <div className="space-y-4">
              {clusterIssues.map(issue => (
                <div key={issue.id} className="bg-white border border-slate-200 p-5 rounded-xl flex gap-4 hover:border-slate-300 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500 font-bold text-sm">
                    {issue.contact !== 'Anonymous' ? issue.contact.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-slate-800">{issue.contact}</p>
                      <span className="text-xs text-slate-400">{new Date(issue.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm">{issue.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
