'use client';

import { useState, useRef, useEffect } from 'react';
import { Trash2, Smartphone, Send, LayoutDashboard, Settings, UserCircle, Bot, Zap, RefreshCw, Server } from 'lucide-react';
import { clearDatabase } from './actions';
import Link from 'next/link';

interface ChatMessage {
  sender: 'student' | 'system';
  text: string;
  timestamp: string;
}

export default function DeveloperSandbox() {
  const [phone, setPhone] = useState('9876543210');
  const [name, setName] = useState('Student Tester');
  const [messageText, setMessageText] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      sender: 'system',
      text: 'Welcome to DAU Pulse WhatsApp Sandbox. Simulate reporting campus issues here.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [lastPayload, setLastPayload] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    const userMessage = messageText;
    setMessageText('');
    setLoading(true);

    // 1. Add student message to chat UI
    setChatHistory(prev => [
      ...prev,
      {
        sender: 'student',
        text: userMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    // 2. Prepare the exact WhatsApp Webhook JSON Payload
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: phone,
                    type: 'text',
                    text: {
                      body: userMessage
                    }
                  }
                ],
                contacts: [
                  {
                    profile: {
                      name: name
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    setLastPayload(payload);
    setLastResponse(null);

    try {
      // 3. Make POST request to local webhook API route
      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setLastResponse(data);

      if (res.ok && data.reply) {
        // 4. Add system auto-response to chat UI
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'system',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'system',
            text: '⚠️ Error: Webhook did not return a valid simulated auto-reply.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err: any) {
      console.error(err);
      setChatHistory(prev => [
        ...prev,
        {
          sender: 'system',
          text: `❌ Request Failed: ${err.message || 'Check your local server status.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDb = async () => {
    if (!confirm('Are you sure you want to clear all database reports?')) return;
    try {
      await clearDatabase();
      alert('Database issues cleared successfully!');
      setChatHistory([
        {
          sender: 'system',
          text: 'Database cleared. Start a new workflow by typing a message below!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setLastPayload(null);
      setLastResponse(null);
    } catch (e) {
      alert('Failed to reset');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-[#ffc20f] selection:text-slate-900">
      
      {/* 1. Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffc20f] to-[#f7941d] flex items-center justify-center shadow-lg shadow-amber-500/10">
            <Smartphone className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              DAU Pulse <span className="text-xs bg-[#ffc20f]/10 text-[#ffc20f] border border-[#ffc20f]/20 font-bold px-2 py-0.5 rounded">DEV SANDBOX</span>
            </h1>
            <p className="text-xs text-slate-400">WhatsApp Webhook Simulator & Intelligence Tester</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleResetDb}
            className="flex items-center gap-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 px-4 py-2 rounded-xl transition-all text-xs font-semibold bg-slate-900/50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Clear Data
          </button>
          
          <Link 
            href="/admin" 
            className="flex items-center gap-2 bg-[#263586] hover:bg-[#263586]/90 text-white border border-[#ffc20f]/30 hover:border-[#ffc20f] shadow-[0_0_15px_rgba(38,53,134,0.3)] px-5 py-2.5 rounded-xl transition-all text-xs font-bold uppercase tracking-wider"
          >
            <span>Open Admin Panel</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#ffc20f]" />
          </Link>
        </div>
      </header>

      {/* 2. Main Simulator Split View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Left Column: Phone Simulator UI (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full max-w-[380px] bg-slate-900 rounded-[45px] p-4 border-[6px] border-slate-800 shadow-2xl shadow-slate-900/50 relative overflow-hidden flex flex-col aspect-[9/19]">
            {/* Phone Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-xl z-20 flex items-center justify-center">
              <div className="w-12 h-1 bg-slate-900 rounded-full mb-1"></div>
            </div>

            {/* Chat Screen */}
            <div className="flex-1 bg-slate-950 rounded-[35px] overflow-hidden flex flex-col pt-6 relative border border-slate-800">
              
              {/* WhatsApp Header */}
              <div className="bg-slate-900 border-b border-slate-800/60 p-3 px-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#ffc20f] to-[#f7941d] flex items-center justify-center font-bold text-slate-950 text-sm">
                  DP
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1">
                    DAU Pulse Bot
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  </h3>
                  <p className="text-[10px] text-slate-400">Verified Webhook Assistant</p>
                </div>
              </div>

              {/* Chat Message Logs */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col text-xs scrollbar-thin">
                {chatHistory.map((chat, idx) => (
                  <div 
                    key={idx} 
                    className={`max-w-[85%] rounded-2xl p-3 flex flex-col shadow-sm relative ${
                      chat.sender === 'student' 
                        ? 'bg-[#263586] text-white self-end rounded-tr-none' 
                        : 'bg-slate-900 text-slate-200 self-start rounded-tl-none border border-slate-800/80'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-line font-medium">{chat.text}</p>
                    <span className="text-[9px] text-slate-400 self-end mt-1">{chat.timestamp}</span>
                  </div>
                ))}
                {loading && (
                  <div className="bg-slate-900 text-slate-400 self-start rounded-2xl rounded-tl-none p-3 border border-slate-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffc20f] animate-bounce"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffc20f] animate-bounce delay-75"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffc20f] animate-bounce delay-150"></span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSend} className="p-3 bg-slate-900 border-t border-slate-800/60 flex items-center gap-2 rounded-b-[35px]">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a campus issue report..."
                  disabled={loading}
                  className="flex-1 bg-slate-950 border border-slate-800 focus:border-[#ffc20f]/50 px-3 py-2 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !messageText.trim()}
                  className="w-8 h-8 rounded-xl bg-gradient-to-r from-[#ffc20f] to-[#f7941d] text-slate-950 flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Right Column: Dev Console & Diagnostics (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col space-y-6 justify-between">
          
          {/* Diagnostic Profile Settings */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
            <h2 className="text-base font-extrabold text-[#ffc20f] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#f7941d]" />
              Simulator Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Sender Phone ID</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-[#ffc20f]/40 px-10 py-2.5 rounded-xl text-xs focus:outline-none text-slate-200"
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Simulate reports from different phone numbers to trigger clustering.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Sender Name</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-[#ffc20f]/40 px-10 py-2.5 rounded-xl text-xs focus:outline-none text-slate-200"
                    placeholder="Student Tester"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Contact profile name injected in webhook headers.</p>
              </div>
            </div>
          </div>

          {/* Real-time Console Log / Terminal */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col min-h-[300px]">
            <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#ffc20f]" />
                <span className="text-xs font-bold text-slate-300">Live JSON Transaction Console</span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
              </div>
            </div>

            <div className="flex-1 p-4 font-mono text-[10px] space-y-4 overflow-y-auto max-h-[320px] bg-slate-950/40 scrollbar-thin">
              {lastPayload ? (
                <div className="space-y-3">
                  <div>
                    <span className="text-amber-400 font-bold block mb-1">▶️ OUTGOING WEBHOOK PAYLOAD (POST /api/webhook)</span>
                    <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                      {JSON.stringify(lastPayload, null, 2)}
                    </pre>
                  </div>
                  {lastResponse ? (
                    <div>
                      <span className="text-emerald-400 font-bold block mb-1">◀️ INCOMING API RESPONSE</span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                        {JSON.stringify(lastResponse, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-slate-500 animate-pulse">Waiting for server response...</div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-center flex-col gap-2 p-6">
                  <Play className="w-8 h-8 text-[#ffc20f]/30 animate-pulse" />
                  <p>Send a message inside the phone simulator to view real-time JSON web traffic & AI classification parameters.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick instructions / Help */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-[#ffc20f]/20 p-5 rounded-2xl">
            <h4 className="text-xs font-bold text-[#ffc20f] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#f7941d]" />
              Demo workflows to try:
            </h4>
            <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
              <li>
                <strong className="text-slate-300">Basic Classification:</strong> Type <span className="text-[#ffc20f]">"The water is leaking in Hostel A Room 202"</span>. It maps to <strong className="text-slate-200">Hostel Management</strong> at <strong className="text-slate-200">Hostel A</strong>.
              </li>
              <li>
                <strong className="text-slate-300">Two-way Location Query:</strong> Type <span className="text-[#ffc20f]">"The internet is down"</span> (no location). The system will reply asking for your location. Reply with <span className="text-[#ffc20f]">"Hostel B"</span> to resolve!
              </li>
              <li>
                <strong className="text-slate-300">Issue Clustering:</strong> Send <span className="text-[#ffc20f]">"Wi-Fi is down"</span> from two different Phone Numbers. Watch the admin panel group them and escalate urgency!
              </li>
            </ul>
          </div>

        </section>

      </main>
    </div>
  );
}
