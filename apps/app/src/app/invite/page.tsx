'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

type PageState = 'loading' | 'accepting' | 'success' | 'error' | 'unauthenticated'

function InvitePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const { data: session, isPending: sessionLoading } = useSession()

  const [state, setState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setErrorMessage('No invite token was provided.')
      return
    }

    // Wait for session to resolve
    if (sessionLoading) return

    // Not logged in — redirect to login with ?redirect back here
    if (!session?.user) {
      setState('unauthenticated')
      const redirect = encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`)
      router.replace(`/login?redirect=${redirect}`)
      return
    }

    // Logged in — accept the invite
    setState('accepting')
    trpc.invite.accept
      .mutate({ token })
      .then(({ orgId: _orgId }) => {
        setState('success')
        // Short delay so user sees the success state, then redirect
        setTimeout(() => router.replace('/dashboard'), 1500)
      })
      .catch((err: unknown) => {
        setState('error')
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Something went wrong. Please try again.'
        setErrorMessage(message)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session, sessionLoading])

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-[#12121a] border border-[#2a2a3a] rounded-2xl p-8 shadow-2xl text-center">
          {/* Logo / icon */}
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 text-2xl">
            ✉️
          </div>

          {(state === 'loading' || state === 'accepting' || state === 'unauthenticated') && (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">
                {state === 'unauthenticated' ? 'Redirecting to sign in…' : 'Accepting invite…'}
              </h1>
              <p className="text-zinc-500 text-sm">Just a moment.</p>
              <div className="mt-6 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="text-4xl mb-4">🎉</div>
              <h1 className="text-xl font-semibold text-white mb-2">You're in!</h1>
              <p className="text-zinc-500 text-sm">Taking you to the dashboard…</p>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">Invite issue</h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{errorMessage}</p>
              <p className="text-zinc-600 text-xs">
                If you think this is a mistake, ask the org owner to send a new invite.
              </p>
              <button
                onClick={() => router.replace('/dashboard')}
                className="mt-6 text-indigo-400 hover:text-indigo-300 text-sm underline transition-colors"
              >
                Go to dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Wrap in Suspense — required by Next.js when using useSearchParams() in a
// client component, otherwise Next.js bails to SSR and initialises the entire
// module graph (including auth.ts) before runtime env vars are available.
export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InvitePageInner />
    </Suspense>
  )
}
