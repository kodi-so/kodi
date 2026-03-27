'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Suspense } from 'react'

function OnboardingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    trpc.org.ensurePersonal
      .mutate()
      .then(() => {
        // If the user came from an invite link, send them back to accept it
        const redirect = searchParams.get('redirect')
        if (redirect) {
          router.replace(redirect)
        } else {
          router.replace('/dashboard')
        }
      })
      .catch(() => {
        // Even on error, push to dashboard — they can retry from there
        router.replace('/dashboard')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl animate-pulse">⚡</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Setting up your workspace…</h1>
        <p className="text-zinc-500">Just a moment.</p>
        <div className="mt-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  )
}
