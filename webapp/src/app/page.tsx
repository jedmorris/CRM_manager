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
  <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-black">

    {/* Navbar */}
    <nav className="fixed w-full z-50 bg-background/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-accent rounded-sm skew-x-[-12deg]"></div>
          <span className="font-bold text-lg tracking-wide">CRM<span className="text-gray-500 font-normal">Manager</span></span>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={() => scrollToAuth('signin')} className="text-sm font-medium hover:text-white text-gray-400 transition-colors">Sign in</button>
          <button onClick={() => scrollToAuth('signup')} className="px-5 py-2 bg-accent text-black text-sm font-bold rounded-full hover:brightness-110 transition-all active:scale-95">
            Get Started
          </button>
        </div>
      </div>
    </nav>

    {/* Hero Section */}
    <section className="pt-32 pb-20 px-6 text-center">
      <div className="max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-accent mb-8">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          Work at the speed of thought
        </div>
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
          Automate <span className="text-accent">5x faster</span><br />
          in every app
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Connect Gmail and ClickUp to your own AI assistant.
          Speak naturally. Your tasks appear instantly.
          Save 20+ hours every month.
        </p>
        <button
          onClick={() => scrollToAuth('signup')}
          className="px-8 py-4 bg-accent text-black text-lg font-bold rounded-full hover:scale-105 transition-transform shadow-[0_0_40px_-10px_rgba(204,255,0,0.3)]"
        >
          Try CRMManager Free →
        </button>

        {/* Speed Viz */}
        <div className="mt-20 max-w-3xl mx-auto p-6 rounded-3xl bg-[#111] border border-[#222]">
          <div className="flex items-center justify-between mb-2 text-xs font-mono text-gray-500 uppercase tracking-widest">
            <span>Manual Entry (40 WPM)</span>
            <span>Too Slow</span>
          </div>
          <div className="h-2 bg-[#222] rounded-full mb-8 overflow-hidden">
            <div className="h-full w-[20%] bg-gray-600 rounded-full"></div>
          </div>

          <div className="flex items-center justify-between mb-2 text-xs font-mono text-accent uppercase tracking-widest">
            <span>AI Automation (Instant)</span>
            <span>Lightning Fast</span>
          </div>
          <div className="h-4 bg-[#222] rounded-full overflow-hidden relative">
            <div className="absolute inset-0 bg-accent/20 animate-pulse"></div>
            <div className="h-full w-[95%] bg-accent rounded-full shadow-[0_0_20px_#CCFF00]"></div>
          </div>
        </div>
      </div>
    </section>

    {/* Bento Grid Features */}
    <section className="py-24 bg-[#080808]">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-center mb-16">Works everywhere you work</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-[#111] hover:bg-[#161616] transition-colors p-8 rounded-[2rem] border border-[#222] md:col-span-2 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-accent text-black flex items-center justify-center text-2xl mb-6 font-bold">⚡</div>
              <h3 className="text-2xl font-bold mb-4">Finish emails in 3 minutes</h3>
              <p className="text-gray-400 max-w-md">That 15-minute email response? Do it in 3 minutes. Your AI assistant drafts, sends, and logs it to ClickUp automatically.</p>
            </div>
            <div className="absolute right-0 bottom-0 w-64 h-64 bg-gradient-to-t from-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Card 2 */}
          <div className="bg-[#111] hover:bg-[#161616] transition-colors p-8 rounded-[2rem] border border-[#222]">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl mb-6">🔒</div>
            <h3 className="text-xl font-bold mb-4">Secure OAuth</h3>
            <p className="text-gray-400 text-sm">Full control over your data. We use official APIs for Gmail and ClickUp. Your tokens are encrypted.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-[#111] hover:bg-[#161616] transition-colors p-8 rounded-[2rem] border border-[#222]">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl mb-6">🌍</div>
            <h3 className="text-xl font-bold mb-4">Any Language</h3>
            <p className="text-gray-400 text-sm">Speak or type in your native language. The AI translates intent into action perfectly.</p>
          </div>

          {/* Card 4 */}
          <div className="bg-[#111] hover:bg-[#161616] transition-colors p-8 rounded-[2rem] border border-[#222] md:col-span-2">
            <div className="flex items-center gap-4 mb-6">
              <div className="px-4 py-1.5 rounded-full border border-[#333] bg-[#222] text-xs font-mono text-gray-300">Gmail</div>
              <div className="px-4 py-1.5 rounded-full border border-[#333] bg-[#222] text-xs font-mono text-gray-300">ClickUp</div>
              <div className="px-4 py-1.5 rounded-full border border-[#333] bg-[#222] text-xs font-mono text-gray-300">Supabase</div>
            </div>
            <h3 className="text-2xl font-bold mb-4">"It just works"</h3>
            <p className="text-gray-400 text-lg">"Managing my coding work and developer communities meant constant jumping between tabs. This tool gives me hours back every week."</p>
          </div>
        </div>
      </div>
    </section>

    {/* Auth Section */}
    <section id="auth-section" className="py-24 px-6 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#111] to-[#050505] -z-10"></div>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">Get started today</h2>
          <p className="text-gray-400">Join the waitlist or sign in to your dashboard.</p>
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
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
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

    {/* FAQ Section */}
    <section className="py-24 px-6 border-t border-[#111]">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold mb-12">Frequently asked questions</h2>
        <div className="space-y-4">
          {[
            { q: "How much time will I actually save?", a: "Most users save about 15-20 minutes per email or task interaction. That adds up to ~20 hours a month." },
            { q: "Is my data private?", a: "Yes. We use standard OAuth 2.0. We never see your password. Your tokens are stored securely." },
            { q: "Can I use it with other apps?", a: "Currently we support Gmail and ClickUp. More integrations (Slack, Linear) are coming soon." }
          ].map((item, i) => (
            <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-6 hover:border-[#333] transition-colors">
              <h3 className="font-bold text-lg mb-2">{item.q}</h3>
              <p className="text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="py-12 px-6 border-t border-[#111] text-center text-gray-500 text-sm">
      <p>&copy; 2026 CRMManager. All rights reserved.</p>
      <div className="flex justify-center gap-6 mt-4">
        <a href="#" className="hover:text-white">Privacy</a>
        <a href="#" className="hover:text-white">Terms</a>
        <a href="#" className="hover:text-white">Contact</a>
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
