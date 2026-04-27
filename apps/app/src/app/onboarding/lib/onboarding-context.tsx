'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { trpc } from '@/lib/trpc'

const STORAGE_KEY = 'kodi_onboarding'

export type ProvisioningStatus =
  | 'idle'
  | 'pending'
  | 'installing'
  | 'running'
  | 'error'

type StoredState = {
  botDisplayName: string
  selectedToolSlugs: string[]
  connectedToolSlugs: string[]
  invitesSentCount: number
  provisioningStatus: ProvisioningStatus
}

export type OnboardingContextValue = {
  // Always-fresh from API
  orgId: string
  orgName: string
  isReady: boolean
  // Persisted in sessionStorage
  botDisplayName: string
  selectedToolSlugs: string[]
  connectedToolSlugs: string[]
  invitesSentCount: number
  provisioningStatus: ProvisioningStatus
  // Setters
  setOrgName: (name: string) => void
  setBotDisplayName: (name: string) => void
  setSelectedToolSlugs: (slugs: string[]) => void
  setConnectedToolSlugs: (slugs: string[]) => void
  setInvitesSentCount: (count: number) => void
  setProvisioningStatus: (status: ProvisioningStatus) => void
  clearStorage: () => void
}

const DEFAULT_STORED: StoredState = {
  botDisplayName: 'Kodi',
  selectedToolSlugs: [],
  connectedToolSlugs: [],
  invitesSentCount: 0,
  provisioningStatus: 'idle',
}

function loadFromStorage(): StoredState {
  if (typeof window === 'undefined') return DEFAULT_STORED
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STORED
    const parsed = JSON.parse(raw) as Partial<StoredState>
    return { ...DEFAULT_STORED, ...parsed }
  } catch {
    return DEFAULT_STORED
  }
}

function saveToStorage(state: StoredState) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage may be unavailable — fail silently
  }
}

const OnboardingContext = createContext<OnboardingContextValue>({
  orgId: '',
  orgName: '',
  isReady: false,
  ...DEFAULT_STORED,
  setOrgName: () => {},
  setBotDisplayName: () => {},
  setSelectedToolSlugs: () => {},
  setConnectedToolSlugs: () => {},
  setInvitesSentCount: () => {},
  setProvisioningStatus: () => {},
  clearStorage: () => {},
})

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgNameState] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [stored, setStoredState] = useState<StoredState>(DEFAULT_STORED)

  // Rehydrate sessionStorage on mount and fetch org from API
  useEffect(() => {
    const fromStorage = loadFromStorage()
    setStoredState(fromStorage)

    trpc.org.getMyCurrent
      .query()
      .then((org) => {
        if (org) {
          setOrgId(org.orgId)
          setOrgNameState(org.orgName)
        }
        setIsReady(true)
      })
      .catch(() => {
        setIsReady(true)
      })
  }, [])

  const updateStored = useCallback((patch: Partial<StoredState>) => {
    setStoredState((prev) => {
      const next = { ...prev, ...patch }
      saveToStorage(next)
      return next
    })
  }, [])

  const setOrgName = useCallback(
    (name: string) => setOrgNameState(name),
    []
  )
  const setBotDisplayName = useCallback(
    (name: string) => updateStored({ botDisplayName: name }),
    [updateStored]
  )
  const setSelectedToolSlugs = useCallback(
    (slugs: string[]) => updateStored({ selectedToolSlugs: slugs }),
    [updateStored]
  )
  const setConnectedToolSlugs = useCallback(
    (slugs: string[]) => updateStored({ connectedToolSlugs: slugs }),
    [updateStored]
  )
  const setInvitesSentCount = useCallback(
    (count: number) => updateStored({ invitesSentCount: count }),
    [updateStored]
  )
  const setProvisioningStatus = useCallback(
    (status: ProvisioningStatus) => updateStored({ provisioningStatus: status }),
    [updateStored]
  )
  const clearStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {}
    }
    // Do NOT reset in-memory state — the done screen needs to keep displaying the
    // summary values until the user navigates away. The provider unmounts on /chat.
  }, [])

  return (
    <OnboardingContext.Provider
      value={{
        orgId,
        orgName,
        isReady,
        ...stored,
        setOrgName,
        setBotDisplayName,
        setSelectedToolSlugs,
        setConnectedToolSlugs,
        setInvitesSentCount,
        setProvisioningStatus,
        clearStorage,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  return useContext(OnboardingContext)
}
