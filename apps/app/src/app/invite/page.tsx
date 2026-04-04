'use client'

import Image from 'next/image'
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

    if (sessionLoading) return

    if (!session?.user) {
      setState('unauthenticated')
      const redirect = encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`)
      router.replace(`/login?redirect=${redirect}`)
      return
    }

    setState('accepting')
    trpc.invite.accept
      .mutate({ token })
      .then(() => {
        setState('success')
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,174,86,0.2),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(111,168,140,0.12),transparent_22%),linear-gradient(180deg,#f9f7f0_0%,#f6f4ee_36%,#f0ece1_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(62,80,86,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(62,80,86,0.05)_1px,transparent_1px)] bg-[size:88px_88px] opacity-40 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.28),transparent_82%)]"
      />

      <div className="relative z-10 w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/76 p-8 text-center text-[#223239] shadow-[0_30px_80px_rgba(34,50,57,0.14)] backdrop-blur-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_14px_28px_rgba(34,50,57,0.08)]">
          <Image
            src="/brand/kodi-logo.png"
            alt=""
            width={42}
            height={42}
            className="h-auto w-9 object-contain"
            priority
          />
        </div>

        {(state === 'loading' ||
          state === 'accepting' ||
          state === 'unauthenticated') && (
          <>
            <p className="text-xs uppercase tracking-[0.18em] text-[#6f8388]">
              Workspace invite
            </p>
            <h1 className="mt-4 font-brand text-[2.3rem] leading-none tracking-[-0.05em] text-[#223239]">
              {state === 'unauthenticated'
                ? 'Redirecting you to sign in'
                : 'Accepting your invite'}
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#4d6369]">
              Kodi is preparing the workspace access so you land in the right
              control room without extra setup.
            </p>
            <div className="mt-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#DFAE56]/25 bg-[#DFAE56]/12">
                <div className="h-6 w-6 rounded-full border-2 border-[#DFAE56]/35 border-t-[#DFAE56] animate-spin" />
              </div>
            </div>
          </>
        )}

        {state === 'success' && (
          <>
            <p className="text-xs uppercase tracking-[0.18em] text-[#6f8388]">
              Invite accepted
            </p>
            <h1 className="mt-4 font-brand text-[2.3rem] leading-none tracking-[-0.05em] text-[#223239]">
              You&apos;re in.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#4d6369]">
              Taking you to the dashboard so you can start working with Kodi.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="text-xs uppercase tracking-[0.18em] text-[#d9a697]">
              Invite issue
            </p>
            <h1 className="mt-4 font-brand text-[2.3rem] leading-none tracking-[-0.05em] text-[#223239]">
              This invite needs attention.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#ffd8ce]">
              {errorMessage}
            </p>
            <p className="mt-3 text-sm leading-7 text-[#5d7379]">
              If this looks wrong, ask the workspace owner to send a new invite.
            </p>
            <button
              onClick={() => router.replace('/dashboard')}
              className="mt-8 rounded-full border border-[#c9d2d4] bg-white px-5 py-2 text-sm text-[#223239] transition hover:bg-[#f6f4ee]"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F6F4EE]">
          <div className="h-6 w-6 rounded-full border-2 border-[#DFAE56]/35 border-t-[#DFAE56] animate-spin" />
        </div>
      }
    >
      <InvitePageInner />
    </Suspense>
  )
}
