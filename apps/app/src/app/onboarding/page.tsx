'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kodi/ui'
import { trpc } from '@/lib/trpc'

function OnboardingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    trpc.org.ensurePersonal
      .mutate()
      .then(() => {
        const redirect = searchParams.get('redirect')
        router.replace(redirect ?? '/dashboard')
      })
      .catch(() => {
        router.replace('/dashboard')
      })
  }, [router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Setting up your workspace</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Kodi is creating the basics now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  )
}
