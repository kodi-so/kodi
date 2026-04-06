'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { Building2 } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@kodi/ui'

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
          <Skeleton className="h-6 w-6 rounded-full bg-white/10" />
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
      await trpc.org.update.mutate({
        orgId: activeOrg!.orgId,
        name: name.trim(),
      })
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DFAE56]/22 bg-[#DFAE56]/12">
              <Building2 size={16} className="text-[#F0C570]" />
            </div>
            <h1 className="text-xl font-semibold text-white">General</h1>
          </div>
          <p className="ml-11 text-sm text-[#8ea3a8]">
            Workspace settings for {activeOrg.orgName}
          </p>
        </div>

        <Card className="border-white/10 bg-[rgba(49,66,71,0.78)]">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[#dce5e7]">
                Workspace name
              </CardTitle>
              {!isOwner && (
                <Badge
                  variant="outline"
                  className="border-white/12 text-[#8ea3a8]"
                >
                  Read only
                </Badge>
              )}
            </div>
            <CardDescription className="text-[#8ea3a8]">
              Update how this workspace appears across Kodi.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner || saving}
                  maxLength={80}
                  placeholder="My Workspace"
                  className="h-11 rounded-lg border-border/80 bg-card/90"
                />
                {!isOwner && (
                  <p className="mt-1.5 text-xs text-[#7d9196]">
                    Only the workspace owner can change the name.
                  </p>
                )}
              </div>

              {error && (
                <Alert
                  variant="destructive"
                  className="border-red-500/20 bg-red-500/10 text-red-400"
                >
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isOwner && (
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={!isDirty || saving}
                    className="bg-[#DFAE56] text-[#223239] hover:bg-[#e8bf70] disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {saved && (
                    <span className="text-sm text-emerald-400">Saved ✓</span>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  )
}
