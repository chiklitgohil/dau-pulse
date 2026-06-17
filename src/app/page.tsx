'use client';

import { useState } from 'react';
import { submitIssue } from './actions';
import { CheckCircle2, AlertTriangle, Send, MapPin, Tag } from 'lucide-react';
import Link from 'next/link';

export default function StudentForm() {
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await submitIssue(formData);
      if (result.success) {
        setTicketId(result.ticketId);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to submit issue. Please try again.');
    }
    setLoading(false);
  }

  if (ticketId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-[var(--color-dau-blue)] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/20">
            <CheckCircle2 className="w-10 h-10 text-[var(--color-dau-yellow)]" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">Issue Reported!</h2>
          <p className="text-slate-500 mb-6">Your voice has been heard. We've captured your concern and prioritized it for campus operations.</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-8 border border-slate-100">
            <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-1">Ticket ID</p>
            <p className="text-2xl font-mono font-bold text-[var(--color-dau-blue)]">{ticketId}</p>
          </div>
          <button 
            onClick={() => setTicketId(null)}
            className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
          >
            Report Another Issue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 selection:bg-[var(--color-dau-yellow)] selection:text-[var(--color-dau-blue)]">
      {/* Header */}
      <header className="bg-[var(--color-dau-blue)] text-white py-6 px-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--color-dau-yellow)] to-[var(--color-dau-orange)] flex items-center justify-center shadow-inner">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DAU Pulse</h1>
              <p className="text-[var(--color-dau-yellow)] text-sm font-medium">Campus Issue Intelligence</p>
            </div>
          </div>
          <Link href="/admin" className="text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-lg backdrop-blur-sm border border-white/10">
            Admin Login
          </Link>
        </div>
      </header>

      {/* Form Container */}
      <main className="max-w-2xl mx-auto p-4 py-12">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
          <div className="bg-gradient-to-r from-[var(--color-dau-blue)] via-[#3143a3] to-[var(--color-dau-blue)] p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
            <h2 className="text-3xl font-bold text-white mb-2 relative z-10">What's happening?</h2>
            <p className="text-blue-100 relative z-10">Help us keep the campus running smoothly. Tell us what needs fixing.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="space-y-2">
              <label htmlFor="description" className="block text-sm font-semibold text-slate-700">
                Describe the issue
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                placeholder="e.g., The Wi-Fi in Hostel B is down since morning and I have an online quiz..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--color-dau-blue)] focus:border-transparent transition-all resize-none text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="location" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <MapPin className="w-4 h-4 text-[var(--color-dau-orange)]" />
                  Location
                </label>
                <select 
                  id="location" 
                  name="location"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--color-dau-blue)] transition-all text-slate-800"
                >
                  <option value="">Select location (Optional)</option>
                  <option value="Hostel A">Hostel A</option>
                  <option value="Hostel B">Hostel B</option>
                  <option value="Main Cafeteria">Main Cafeteria</option>
                  <option value="Library">Library</option>
                  <option value="Academic Block">Academic Block</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="category" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Tag className="w-4 h-4 text-[var(--color-dau-orange)]" />
                  Category
                </label>
                <select 
                  id="category" 
                  name="category"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--color-dau-blue)] transition-all text-slate-800"
                >
                  <option value="Auto">Let AI classify (Auto)</option>
                  <option value="Cafeteria Management">Cafeteria Management</option>
                  <option value="Academic">Academic</option>
                  <option value="Hostel Management">Hostel Management</option>
                  <option value="Sports">Sports</option>
                  <option value="Student Placement Cell">Student Placement Cell</option>
                  <option value="Tech Support">Tech Support</option>
                  <option value="Internal Complaints / Anti - Ragging">Internal Complaints / Anti - Ragging</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <label htmlFor="contact" className="block text-sm font-semibold text-slate-700">
                Your Name (Optional)
              </label>
              <input
                type="text"
                id="contact"
                name="contact"
                placeholder="Leave blank to report anonymously"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[var(--color-dau-blue)] focus:border-transparent transition-all text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-8 py-4 px-6 bg-gradient-to-r from-[var(--color-dau-blue)] to-[#3143a3] hover:to-[#3b51c5] text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-900/30 transform transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Submit Report
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-400 mt-4">
              Protected by AI classification. Your privacy is respected.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
