'use client'

import { createAuthClient } from 'better-auth/react'

// Use the current origin at runtime so this works in any environment
// (dev, Railway dev, Railway prod) without needing a build-time env var.
const baseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export const authClient = createAuthClient({ baseURL })

export const { signIn, signOut, signUp, useSession } = authClient
