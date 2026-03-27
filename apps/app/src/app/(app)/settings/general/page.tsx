'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { Building2 } from 'lucide-react'

export default function GeneralSettingsPage() {
  const { activeOrg, refreshOrgs } = useOrg()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeOrg) setName(activeOrg.orgName)
  }, [activeOrg])

  if (!activeOrg) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      </SettingsLayout>
    )
  }

  const isOwner = activeOrg.role === 'owner'
  const isDirty = name.trim() !== activeOrg.orgName && name.trim().length > 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty || !isOwner) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await trpc.org.update.mutate({ orgId: activeOrg!.orgId, name: name.trim() })
      await refreshOrgs()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Building2 size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-xl font-semibold text-white">General</h1>
          </div>
          <p className="text-zinc-500 text-sm ml-11">Workspace settings for {activeOrg.orgName}</p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
          <h2 className="text-sm font-semibold text-zinc-300">Workspace name</h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!isOwner || saving}
                maxLength={80}
                placeholder="My Workspace"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {!isOwner && (
                <p className="text-zinc-600 text-xs mt-1.5">Only the workspace owner can change the name.</p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            {isOwner && (
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!isDirty || saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
              </div>
            )}
          </form>
        </section>
      </div>
    </SettingsLayout>
  )
}
