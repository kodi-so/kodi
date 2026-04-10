'use client'

/**
 * OrgContext — global active-org state, persisted to localStorage.
 *
 * Why: navigating between pages (chat → settings → meetings) loses any
 * ?org= query param. Storing the active org in context (backed by
 * localStorage) means the selected org survives navigation for the
 * lifetime of the session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { trpc } from './trpc'

const LS_KEY = 'kodi:activeOrgId'

type OrgOption = {
  orgId: string
  orgName: string
  orgSlug: string
  role: string
}

type OrgContextValue = {
  orgs: OrgOption[]
  activeOrg: OrgOption | null
  setActiveOrg: (org: OrgOption) => void
  /** Re-fetch org list (call after rename, invite accepted, etc.) */
  refreshOrgs: () => Promise<void>
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  activeOrg: null,
  setActiveOrg: () => {},
  refreshOrgs: async () => {},
})

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [activeOrg, setActiveOrgState] = useState<OrgOption | null>(null)

  const applyOrgs = useCallback(
    (list: OrgOption[], preferredId?: string | null) => {
      setOrgs(list)
      const storedId =
        preferredId ??
        (typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null)
      const match = list.find((o) => o.orgId === storedId) ?? list[0] ?? null
      setActiveOrgState(match)
      if (match && typeof window !== 'undefined')
        localStorage.setItem(LS_KEY, match.orgId)
    },
    []
  )

  const refreshOrgs = useCallback(async () => {
    try {
      const list = await trpc.org.listMine.query()
      applyOrgs(list)
    } catch {
      // silently ignore — sidebar will show stale data rather than crash
    }
  }, [applyOrgs])

  useEffect(() => {
    void refreshOrgs()
  }, [refreshOrgs])

  const setActiveOrg = useCallback((org: OrgOption) => {
    setActiveOrgState(org)
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, org.orgId)
  }, [])

  return (
    <OrgContext.Provider value={{ orgs, activeOrg, setActiveOrg, refreshOrgs }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  return useContext(OrgContext)
}
