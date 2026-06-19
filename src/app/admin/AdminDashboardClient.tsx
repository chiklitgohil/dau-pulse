'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Utensils, 
  BookOpen, 
  Home, 
  Trophy, 
  Briefcase, 
  Laptop, 
  ShieldAlert, 
  HelpCircle, 
  ChevronRight, 
  Layers, 
  Clock, 
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { Issue, Cluster } from '@/lib/store';

interface AdminDashboardClientProps {
  issues: Issue[];
  clusters: Cluster[];
}

const COMMITTEES = [
  {
    name: 'Tech Support',
    description: 'Wi-Fi, portal login, lab devices, and network infrastructure.',
    icon: Laptop,
    color: 'from-blue-500 to-sky-400',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-100',
  },
  {
    name: 'Cafeteria Management',
    description: 'Food quality, hygiene standards, timing, and menu items.',
    icon: Utensils,
    color: 'from-amber-500 to-yellow-400',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-100',
  },
  {
    name: 'Hostel Management',
    description: 'Plumbing, electricity, room maintenance, and hostel cleanliness.',
    icon: Home,
    color: 'from-purple-500 to-indigo-400',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-100',
  },
  {
    name: 'Academic',
    description: 'Exam conflicts, library access, faculty issues, and schedule changes.',
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-400',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    borderColor: 'border-emerald-100',
  },
  {
    name: 'Sports',
    description: 'Ground availability, equipment damage, and event logistics.',
    icon: Trophy,
    color: 'from-orange-500 to-red-400',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
    borderColor: 'border-orange-100',
  },
  {
    name: 'Student Placement Cell',
    description: 'Internships, company visits, and interview schedules.',
    icon: Briefcase,
    color: 'from-cyan-500 to-sky-400',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
    borderColor: 'border-cyan-100',
  },
  {
    name: 'Internal Complaints / Anti - Ragging',
    description: 'Harassment, safety threats, bullying, and dispute resolutions.',
    icon: ShieldAlert,
    color: 'from-rose-500 to-red-400',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-600',
    borderColor: 'border-rose-100',
  },
  {
    name: 'Other',
    description: 'General campus queries, transport, and miscellaneous issues.',
    icon: HelpCircle,
    color: 'from-slate-500 to-slate-400',
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-600',
    borderColor: 'border-slate-100',
  }
];

export default function AdminDashboardClient({ issues, clusters }: AdminDashboardClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Overall Statistics
  const totalIssues = issues.length;
  const urgentIssues = issues.filter(i => i.urgency >= 4 && i.status !== 'Resolved').length;
  const activeClusters = clusters.filter(c => c.status !== 'Resolved').length;
  const resolvedIssues = issues.filter(i => i.status === 'Resolved').length;

  // Filtered issues and clusters
  const filteredClusters = selectedCategory 
    ? clusters.filter(c => c.category === selectedCategory && c.status !== 'Resolved')
    : [];
  const filteredIssues = selectedCategory
    ? issues.filter(i => i.category === selectedCategory)
    : [];

  const getActiveClusterCount = (category: string) => {
    return clusters.filter(c => c.category === category && c.status !== 'Resolved').length;
  };

  const getTotalReportCount = (category: string) => {
    return issues.filter(i => i.category === category).length;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Overall Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-[var(--color-dau-blue)]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Reports</p>
            <p className="text-2xl font-black text-slate-800">{totalIssues}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-[var(--color-dau-red)]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Urgent Active</p>
            <p className="text-2xl font-black text-slate-800">{urgentIssues}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
            <Layers className="w-6 h-6 text-[var(--color-dau-orange)]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Clusters</p>
            <p className="text-2xl font-black text-slate-800">{activeClusters}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolved</p>
            <p className="text-2xl font-black text-slate-800">{resolvedIssues}</p>
          </div>
        </div>
      </div>

      {/* 2. Main Area */}
      {selectedCategory === null ? (
        // ==========================================
        // COMMITTEE SELECTION GRID
        // ==========================================
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800">Campus Handling Committees</h2>
            <p className="text-sm text-slate-500 mt-1">Select a department below to view and manage clustered issues.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {COMMITTEES.map((comm) => {
              const IconComp = comm.icon;
              const activeCount = getActiveClusterCount(comm.name);
              const totalCount = getTotalReportCount(comm.name);

              return (
                <button
                  key={comm.name}
                  onClick={() => setSelectedCategory(comm.name)}
                  className="group bg-white rounded-2xl p-6 text-left border border-slate-200/60 shadow-sm hover:border-[var(--color-dau-blue)]/40 hover:shadow-md transition-all duration-300 relative flex flex-col h-[200px]"
                >
                  <div className="flex justify-between items-start w-full">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${comm.color} flex items-center justify-center text-white shadow-md shadow-blue-500/10`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    {activeCount > 0 ? (
                      <span className="bg-red-50 text-[var(--color-dau-red)] border border-red-100 text-xs font-extrabold px-3 py-1 rounded-full animate-pulse">
                        {activeCount} Active
                      </span>
                    ) : (
                      <span className="bg-slate-50 text-slate-400 border border-slate-100 text-xs font-medium px-2 py-0.5 rounded-full">
                        Clean
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <h3 className="font-bold text-slate-800 group-hover:text-[var(--color-dau-blue)] transition-colors text-base line-clamp-1">{comm.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{comm.description}</p>
                  </div>

                  <div className="mt-auto flex items-center justify-between text-xs font-medium text-slate-500 pt-2 border-t border-slate-50">
                    <span>{totalCount} Total Reports</span>
                    <span className="flex items-center gap-0.5 text-[var(--color-dau-blue)] opacity-0 group-hover:opacity-100 transition-opacity">
                      Open <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        // ==========================================
        // DETAILED COMMITTEE FILTER VIEW
        // ==========================================
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedCategory(null)}
                className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 border border-slate-200 transition-all flex items-center justify-center bg-white shadow-sm"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <span className="text-xs font-extrabold text-[var(--color-dau-blue)] uppercase tracking-wider">Committee Workspace</span>
                <h2 className="text-2xl font-black text-slate-800">{selectedCategory}</h2>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Clustered Issues (Left 2 columns) */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-2">
                <Layers className="w-5 h-5 text-[var(--color-dau-blue)]" />
                Active Issue Clusters ({filteredClusters.length})
              </h3>

              {filteredClusters.sort((a, b) => b.urgencyScore - a.urgencyScore).map(cluster => (
                <Link href={`/admin/clusters/${cluster.id}`} key={cluster.id} className="block group">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/70 hover:border-[var(--color-dau-blue)]/30 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-slate-800 group-hover:text-[var(--color-dau-blue)] transition-colors">{cluster.title}</h4>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="text-slate-500 font-semibold">{cluster.location}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-[var(--color-dau-orange)] font-bold">{cluster.reportCount} Reports</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-400">{new Date(cluster.createdAt).toLocaleDateString()}</span>
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

              {filteredClusters.length === 0 && (
                <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200/60 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">Everything looks clean!</h4>
                  <p className="text-slate-500 text-sm mt-1">No unresolved active clusters found under {selectedCategory}.</p>
                </div>
              )}
            </div>

            {/* Recent Reports (Right 1 column) */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-[var(--color-dau-blue)]" />
                Recent Reports ({filteredIssues.length})
              </h3>
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
                {filteredIssues
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10)
                  .map(issue => (
                    <div key={issue.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-[var(--color-dau-blue)]">{issue.id}</span>
                        <span className="text-[10px] text-slate-400">{new Date(issue.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-sm text-slate-700 font-semibold mb-2 leading-relaxed">{issue.description}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium">{issue.location}</span>
                        <span className={`font-bold text-[11px] ${issue.status === 'New' ? 'text-[var(--color-dau-orange)]' : 'text-slate-500'}`}>{issue.status}</span>
                      </div>
                    </div>
                  ))}

                {filteredIssues.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-slate-400 text-sm">No recent individual reports.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
