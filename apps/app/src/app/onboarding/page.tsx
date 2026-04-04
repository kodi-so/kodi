'use client'

import Image from 'next/image'
import { Suspense, useEffect } from 'react'
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
        const redirect = searchParams.get('redirect')
        if (redirect) {
          router.replace(redirect)
        } else {
          router.replace('/dashboard')
        }
      })
      .catch(() => {
        router.replace('/dashboard')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      <Card className="relative w-full max-w-xl rounded-[2rem] border-white/80 bg-white/76 text-center shadow-[0_30px_80px_rgba(34,50,57,0.14)] backdrop-blur-sm">
        <CardHeader className="items-center pb-3">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_14px_28px_rgba(34,50,57,0.08)]">
            <Image
              src="/brand/kodi-logo.png"
              alt=""
              width={42}
              height={42}
              className="h-auto w-9 object-contain"
              priority
            />
          </div>
          <CardTitle className="font-brand text-[2.35rem] tracking-[-0.05em] text-[#223239]">
            Setting up your workspace
          </CardTitle>
          <CardDescription className="max-w-md text-[#5d7379]">
            Kodi is preparing your control room so your first meeting,
            approvals, and connected workflows have the right home.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#DFAE56]/25 bg-[#DFAE56]/12">
            <div className="h-6 w-6 rounded-full border-2 border-[#DFAE56]/35 border-t-[#DFAE56] animate-spin" />
          </div>
          <p className="mt-6 text-sm leading-7 text-[#4d6369]">
            This usually takes a moment. Once the workspace is ready, Kodi will
            take you straight into the app.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F6F4EE]">
          <div className="h-6 w-6 rounded-full border-2 border-[#DFAE56]/35 border-t-[#DFAE56] animate-spin" />
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  )
}
