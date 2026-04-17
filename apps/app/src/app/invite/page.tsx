'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { AuthShell } from '@/components/auth-shell'

type PageState =
  | 'loading'
  | 'accepting'
  | 'success'
  | 'error'
  | 'unauthenticated'

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
      setErrorMessage('This invite link is missing a token.')
      return
    }

    if (sessionLoading) return

    if (!session?.user) {
      setState('unauthenticated')
      const redirect = encodeURIComponent(
        `/invite?token=${encodeURIComponent(token)}`
      )
      router.replace(`/login?redirect=${redirect}`)
      return
    }

    setState('accepting')
    trpc.invite.accept
      .mutate({ token })
      .then(() => {
        setState('success')
        setTimeout(() => router.replace('/chat'), 1200)
      })
      .catch((error: unknown) => {
        setState('error')
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'We could not accept this invite.'
        setErrorMessage(message)
      })
  }, [router, session, sessionLoading, token])

  if (state === 'error') {
    return (
      <AuthShell title="Invite problem" description={errorMessage}>
        <Button onClick={() => router.replace('/chat')} className="w-full">
          Open chat
        </Button>
      </AuthShell>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">
            {state === 'success'
              ? 'Invite accepted'
              : state === 'unauthenticated'
                ? 'Redirecting to sign in'
                : 'Accepting invite'}
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {state === 'success'
              ? 'Taking you to chat.'
              : 'This should only take a moment.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <InvitePageInner />
    </Suspense>
  )
}
