'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kodi/ui'

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
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-950/80 text-center">
        <CardHeader>
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl animate-pulse">⚡</span>
          </div>
          <CardTitle className="text-2xl text-white">
            Setting up your workspace…
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Just a moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mt-6 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
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
