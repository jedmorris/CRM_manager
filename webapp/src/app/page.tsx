'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function HomeContent() {
  /* Auth Logic & State */
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authView, setAuthView] = useState<'hidden' | 'signin' | 'signup'>('hidden')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) setError(decodeURIComponent(errorParam))

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) router.push('/dashboard')
    }
    checkUser()
  }, [searchParams, router, supabase.auth])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        })
        if (error) throw error
        setError('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  /* Scroll to Auth Helper */
  const scrollToAuth = (mode: 'signin' | 'signup') => {
    setIsSignUp(mode === 'signup')
    setAuthView(mode)
    document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-black scroll-smooth">

      {/* Navbar */}
      <nav className="fixed w-full z-50 bg-background/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-accent rounded-sm skew-x-[-12deg]"></div>
            <span className="font-bold text-lg tracking-wide">CRM<span className="text-gray-500 font-normal">Manager</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <button onClick={() => scrollToAuth('signin')} className="hover:text-white transition-colors">Sign in</button>
            <button onClick={() => scrollToAuth('signup')} className="px-5 py-2 bg-accent text-black font-bold rounded-full hover:brightness-110 transition-all active:scale-95">
              Sign up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 text-center">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-accent mb-8">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Control ClickUp with Natural Language
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
            Fully automate your CRM<br />
            <span className="text-accent">with voice and text.</span>
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-white/90 mb-6">
            Deep integrations with Gmail and Cal.com.
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Your words become pipeline actions instantly.
          </p>
          <button
            onClick={() => scrollToAuth('signup')}
            className="px-8 py-4 bg-accent text-black text-lg font-bold rounded-full hover:scale-105 transition-transform shadow-[0_0_40px_-10px_rgba(204,255,0,0.3)]"
          >
            Start Automating Free →
          </button>

          {/* Speed Viz */}
          <div className="mt-20 max-w-3xl mx-auto p-8 rounded-3xl bg-[#111] border border-[#222]">
            <div className="flex items-center justify-between mb-2 text-xs font-mono text-gray-500 uppercase tracking-widest">
              <span>MANUAL CLICKING (4 hrs/week)</span>
              <span className="text-red-500 flex items-center gap-1">🔴 TOO SLOW</span>
            </div>
            <div className="h-3 bg-[#222] rounded-full mb-8 overflow-hidden">
              <div className="h-full w-[30%] bg-gray-600 rounded-full"></div>
            </div>

            <div className="flex items-center justify-between mb-2 text-xs font-mono text-accent uppercase tracking-widest">
              <span>NATURAL LANGUAGE (Instant)</span>
              <span className="text-green-500 flex items-center gap-1">🟢 AUTOMATIC</span>
            </div>
            <div className="h-8 bg-[#222] rounded-full overflow-hidden relative flex items-center px-4">
              <div className="absolute inset-0 bg-accent/20 animate-pulse"></div>
              <div className="h-full w-full absolute left-0 top-0 bg-accent rounded-full shadow-[0_0_20px_#CCFF00]"></div>
              <span className="relative z-10 text-black font-bold text-xs tracking-widest">10X FASTER</span>
            </div>
            <div className="mt-8 text-center">
              <p className="text-gray-400 text-sm font-mono tracking-widest uppercase">Reclaim 200+ hours/year</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Bar */}
      <section className="py-12 border-y border-[#111] bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm font-mono text-gray-500 mb-8 uppercase tracking-widest">POWERED BY THE APPS YOU RELY ON</p>
          <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Simple Text Placeholders for Logos as requested */}
            <span className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 bg-purple-500 rounded"></div> ClickUp</span>
            <span className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 bg-red-500 rounded"></div> Gmail</span>
            <span className="text-xl font-bold text-white flex items-center gap-2"><div className="w-6 h-6 bg-white rounded text-black flex items-center justify-center text-xs text-black font-serif">C</div> Cal.com</span>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-block px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5 text-accent text-xs font-bold tracking-widest mb-6">SEE IT IN ACTION</div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Watch CRM Manager transform your workflow</h2>
          <p className="text-gray-400 text-lg mb-12">See how speaking naturally automates your entire CRM.</p>

          <div className="relative aspect-video rounded-3xl bg-[#111] border border-[#222] overflow-hidden flex items-center justify-center group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-transparent"></div>
            <div className="w-20 h-20 rounded-full bg-accent text-black flex items-center justify-center pl-1 transition-transform group-hover:scale-110 shadow-[0_0_30px_rgba(204,255,0,0.5)]">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>

          <div className="mt-12 text-left bg-[#111] p-8 rounded-3xl border border-[#222]">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-1">
                <p className="text-sm font-mono text-gray-500 mb-2">YOU SAY</p>
                <p className="text-xl text-white italic">"Update the status for Mike to 'Negotiation' and schedule a follow-up for next Tuesday after our Cal.com meeting."</p>
              </div>
              <div className="hidden md:block w-px h-32 bg-[#333]"></div>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-mono text-accent mb-2">CRM MANAGER ACTIONS</p>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-400">✓</span> Updates ClickUp Status: "Negotiation"
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-400">✓</span> Creates Task: "Follow-up with Mike"
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-400">✓</span> Sets Due Date: Next Tuesday
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-green-400">✓</span> Logs Context: Linked to Cal.com meeting record
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-6 text-xs text-gray-500 font-mono uppercase tracking-widest">
            <span>Real-time parsing</span><span>•</span><span>Context aware</span><span>•</span><span>Zero clicks</span><span>•</span><span>Perfect formatting</span>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-24 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-accent text-sm font-bold tracking-widest mb-4">THE ONLY AI DESIGNED FOR CLICKUP AUTOMATION</div>
            <h2 className="text-4xl font-bold mb-6">Speak to your CRM</h2>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">
              Stop navigating dropdown menus. Just say what needs to happen. "Move Project X to Done." "Add Sarah as a lead." CRM Manager handles the clicks for you.
            </p>

            <h3 className="text-2xl font-bold mb-4 text-white">Gmail on Autopilot</h3>
            <p className="text-gray-400 text-lg leading-relaxed mb-8">
              Your inbox is your pipeline. CRM Manager reads your Gmail context to auto-tag leads, parse intent (LOI vs. Inquiry), and update ClickUp tasks without you leaving your inbox.
            </p>

            <h3 className="text-2xl font-bold mb-4 text-white">Cal.com Integration</h3>
            <p className="text-gray-400 text-lg leading-relaxed">
              Meetings drive deals. When a prospect books via Cal.com, CRM Manager automatically creates the ClickUp profile, sets the stage to "Meeting Booked," and preps your briefing notes.
            </p>
          </div>
          <div className="space-y-6">
            <div className="p-8 bg-[#111] rounded-3xl border border-[#222]">
              <h3 className="text-xl font-bold mb-3 text-white">Setup in 60 seconds</h3>
              <p className="text-gray-400">Connect ClickUp. Connect Gmail. Connect Cal.com. We handle the webhooks, API calls, and complex triggers in the background.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl font-bold mb-6">Natural Language.<br />Total Control.</h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-16">
            Your voice drives the data. Your integrations handle the rest.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#111] p-8 rounded-3xl border border-[#222]">
              <div className="text-accent text-lg font-bold mb-4">01</div>
              <h3 className="text-xl font-bold mb-3 text-white">You Speak (or Type)</h3>
              <p className="text-gray-400">"Remind me to send the contract to Acme Corp when the Cal.com meeting ends."</p>
            </div>
            <div className="bg-[#111] p-8 rounded-3xl border border-[#222]">
              <div className="text-accent text-lg font-bold mb-4">02</div>
              <h3 className="text-xl font-bold mb-3 text-white">CRM Manager Understands</h3>
              <p className="text-gray-400">It identifies "Acme Corp" (Entity), "Send Contract" (Action), and "Meeting Ends" (Trigger).</p>
            </div>
            <div className="bg-[#111] p-8 rounded-3xl border border-[#222]">
              <div className="text-accent text-lg font-bold mb-4">03</div>
              <h3 className="text-xl font-bold mb-3 text-white">ClickUp Updates Instantly</h3>
              <p className="text-gray-400">Task created. Automation armed. You get back to work.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-24 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Work at the speed of thought</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "⚡", title: "Finish updates in 3 minutes", text: "That 15-minute Friday CRM cleanup? Do it in 3 minutes. Natural language is 5x faster than typing and clicking through menus." },
              { icon: "📅", title: "Cal.com Sync", text: "Never manually log a meeting again. Bookings in Cal.com instantly reflect in your ClickUp deal stages." },
              { icon: "✉️", title: "Smart Gmail Parsing", text: "It knows the difference between a cold email and a warm lead. It routes, tags, and prioritizes based on actual email content." },
              { icon: "🔒", title: "GDPR Compliant", text: "Full control over your data. Transparent handling. Optional local processing for maximum privacy." },
              { icon: "🌍", title: "Multi-lingual Support", text: "Speak in over 100 languages. Your CRM is updated in perfect English (or your preferred language)." }
            ].map((card, i) => (
              <div key={i} className="bg-[#111] p-8 rounded-[2rem] border border-[#222] hover:bg-[#161616] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl mb-6">{card.icon}</div>
                <h3 className="text-xl font-bold mb-4">{card.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">How dealmakers got their time back</h2>
          <p className="text-gray-400 text-center mb-16">Real feedback from people using CRM Manager daily.</p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { q: "I used to spend hours manually syncing my calendar bookings to my CRM. Now, Cal.com and ClickUp talk to each other perfectly through natural language commands.", author: "Sarah Chen", role: "Independent Sponsor" },
              { q: "The ability to just tell my CRM what to do—instead of clicking through ten different tabs—is a game changer. The Gmail integration is seamless.", author: "Marcus Webb", role: "M&A Advisor" },
              { q: "I tried building this with Zapier. It was a nightmare. CRM Manager hooked into my Cal.com and ClickUp in 90 seconds. It just works.", author: "Elena Rodriguez", role: "SaaS Founder" }
            ].map((t, i) => (
              <div key={i} className="bg-[#111] p-8 rounded-3xl border border-[#222] flex flex-col justify-between">
                <p className="text-gray-300 text-lg italic mb-6">"{t.q}"</p>
                <div>
                  <p className="font-bold text-white">{t.author}</p>
                  <p className="text-sm text-gray-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-[#080808]">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-5xl font-bold mb-4">Unlock the power of<br />invisible management</h2>
          <div className="mt-16 grid md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">

            {/* Free Tier */}
            <div className="bg-[#111] p-10 rounded-3xl border border-[#222]">
              <h3 className="text-xl font-medium text-gray-400 mb-2">Free</h3>
              <div className="text-5xl font-bold text-white mb-1">$0.00</div>
              <p className="text-sm text-gray-500 mb-8">/month • Billed Monthly</p>

              <button onClick={() => scrollToAuth('signup')} className="w-full py-3 bg-[#222] hover:bg-[#333] text-white font-bold rounded-xl mb-8 transition-colors">Get Started →</button>

              <div className="space-y-4 text-sm text-gray-300">
                {["Natural Language (Text/Voice)", "ClickUp 2-way sync", "Gmail Integration", "25 Automations/mo", "Basic AI tagging"].map(item => (
                  <div key={item} className="flex gap-3"><span className="text-green-500">✓</span> {item}</div>
                ))}
              </div>
            </div>

            {/* Pro Tier */}
            <div className="bg-[#111] p-10 rounded-3xl border border-accent relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-accent text-black text-xs font-bold px-3 py-1 rounded-bl-xl">MOST POPULAR</div>
              <h3 className="text-xl font-medium text-gray-400 mb-2">Pro</h3>
              <div className="text-5xl font-bold text-white mb-1">$29.00</div>
              <p className="text-sm text-gray-500 mb-8">/month • Billed Monthly</p>

              <button onClick={() => scrollToAuth('signup')} className="w-full py-3 bg-accent hover:brightness-110 text-black font-bold rounded-xl mb-8 transition-all">Get Started →</button>

              <div className="space-y-4 text-sm text-white">
                {[
                  "Unlimited Voice Commands",
                  "Advanced Context Parsing",
                  "Cal.com Integration",
                  "Unlimited Automations",
                  "Custom Webhooks",
                  "Priority Support",
                  "Export to Sheets"
                ].map(item => (
                  <div key={item} className="flex gap-3"><span className="text-accent">✓</span> {item}</div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 border-t border-[#111]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-12">Frequently asked questions</h2>
          <div className="space-y-6">
            {[
              { q: "How does the Natural Language engine work?", a: "We use advanced AI design to interpret intent. You don't need to use specific 'robot commands.' Just speak or write as if you were talking to a human assistant, and we translate that into ClickUp actions." },
              { q: "What does the Cal.com integration do?", a: "It links your scheduling to your CRM. When a meeting is booked, rescheduled, or cancelled in Cal.com, CRM Manager automatically updates the corresponding deal status and contact details in ClickUp." },
              { q: "Does this replace Zapier?", a: "For ClickUp users, yes. CRM Manager is purpose-built to handle the specific relationships between ClickUp, Gmail, and Cal.com without the breakage or complex setup of generic tools like Zapier." },
              { q: "Is my data secure?", a: "Yes. All data transmission is encrypted end-to-end (TLS 1.3). We never store your email or calendar content—only the task metadata needed to update ClickUp." },
              { q: "Can I use this with ClickUp 3.0?", a: "Absolutely. CRM Manager is fully compatible with ClickUp 3.0, including custom fields, relationships, and the new task view." }
            ].map((item, i) => (
              <div key={i} className="group">
                <h3 className="font-bold text-lg mb-2 group-hover:text-accent transition-colors cursor-default">{item.q}</h3>
                <p className="text-gray-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Auth Section */}
      <section id="auth-section" className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#111] to-[#050505] -z-10"></div>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold mb-4">Get started today</h2>
            <p className="text-gray-400">Stop managing data. Start managing deals.</p>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-3xl p-8 shadow-2xl">
            {error && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${error.includes('Check') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#050505] border border-[#333] text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  placeholder="name@company.com"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#050505] border border-[#333] text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-accent text-black font-bold rounded-xl hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Connect CRM Manager'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-gray-500 hover:text-white text-sm transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "New here? Create an account"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[#111] text-center text-gray-500 text-sm">
        <p className="mb-8 font-bold text-white text-lg">CRM Manager</p>
        <p className="mb-4">Stop managing data. Start managing deals.</p>
        <p className="mb-8">&copy; 2026 CRM Manager. All rights reserved.</p>

        <div className="flex justify-center gap-6 font-medium">
          <a href="#" className="hover:text-white transition-colors">About</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
        </div>
      </footer>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#CCFF00] border-t-transparent animate-spin"></div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
