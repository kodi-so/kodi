export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl animate-pulse">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Setting up your agent…</h1>
        <p className="text-zinc-500">We're getting everything ready for you.</p>
      </div>
    </div>
  )
}
