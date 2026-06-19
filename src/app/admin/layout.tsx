import Link from 'next/link';
import { LogOut, Home } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white shadow-md z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--color-dau-yellow)] to-[var(--color-dau-orange)] flex items-center justify-center">
              <span className="font-bold text-slate-900 text-sm">DP</span>
            </div>
            <span className="font-bold text-xl tracking-tight">
              DAU Pulse <span className="text-xs text-[var(--color-dau-yellow)] ml-1 font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Admin</span>
            </span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg transition-colors text-sm">
              <Home className="w-4 h-4" />
              <span>Student View</span>
            </Link>
            <div className="h-6 w-px bg-slate-800"></div>
            <Link href="/" className="flex items-center gap-2 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg transition-colors text-sm">
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>Sign Out</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
