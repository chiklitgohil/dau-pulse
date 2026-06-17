import Link from 'next/link';
import { LayoutDashboard, LogOut, Settings } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col shadow-2xl">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--color-dau-yellow)] to-[var(--color-dau-orange)] flex items-center justify-center">
              <span className="font-bold text-slate-900 text-sm">DP</span>
            </div>
            <span className="font-bold text-xl tracking-tight">DAU Pulse</span>
          </Link>
          <p className="text-slate-400 text-xs mt-1">Admin Operations</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link href="/admin" className="flex items-center gap-3 bg-[var(--color-dau-blue)]/20 text-white px-4 py-3 rounded-xl border border-[var(--color-dau-blue)]/30 transition-colors">
            <LayoutDashboard className="w-5 h-5 text-[var(--color-dau-yellow)]" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <button className="w-full flex items-center gap-3 hover:bg-slate-800 text-slate-300 px-4 py-3 rounded-xl transition-colors opacity-50 cursor-not-allowed">
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </nav>
        
        <div className="p-4 mt-auto">
          <Link href="/" className="flex items-center gap-3 hover:bg-slate-800 text-slate-300 px-4 py-3 rounded-xl transition-colors">
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 py-4 px-8 flex justify-between items-center shadow-sm z-10">
          <h1 className="text-xl font-bold text-slate-800">Campus Intelligence Overview</h1>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--color-dau-blue)] text-white flex items-center justify-center font-bold shadow-md">
              A
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
