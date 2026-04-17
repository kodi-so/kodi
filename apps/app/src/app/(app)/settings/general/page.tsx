'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { SettingsLayout } from '../_components/settings-layout'
import { Building2 } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Skeleton } from '@kodi/ui/components/skeleton'

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
          <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
        </div>
      </SettingsLayout>
    )
  }

  const currentOrg = activeOrg
  const isOwner = currentOrg.role === 'owner'
  const isDirty = name.trim() !== currentOrg.orgName && name.trim().length > 0

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty || !isOwner) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await trpc.org.update.mutate({
        orgId: currentOrg.orgId,
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
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-accent text-primary shadow-sm">
              <Building2 size={18} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              General
            </h1>
          </div>
          <p className="ml-[3.25rem] text-sm leading-7 text-muted-foreground">
            Workspace settings for {currentOrg.orgName}
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Workspace name
              </CardTitle>
              {!isOwner && <Badge variant="neutral">Read only</Badge>}
            </div>
            <CardDescription className="text-muted-foreground">
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
                  className="h-12 rounded-xl border-border bg-card"
                />
                {!isOwner && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only the workspace owner can change the name.
                  </p>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isOwner && (
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!isDirty || saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {saved && (
                    <span className="text-sm font-medium text-brand-success">
                      Saved
                    </span>
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
