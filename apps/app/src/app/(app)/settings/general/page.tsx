'use client'

import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { useOrg } from '@/lib/org-context'
import { ACCEPTED_IMAGE_UPLOAD_TYPES } from '@/lib/image-upload'
import { SettingsLayout } from '../_components/settings-layout'
import { Building2, Trash2, Upload } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@kodi/ui/components/avatar'
import { Badge } from '@kodi/ui/components/badge'
import { Button } from '@kodi/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Skeleton } from '@kodi/ui/components/skeleton'
import { DeleteOrgDialog } from './_components/delete-org-dialog'

export default function GeneralSettingsPage() {
  const { activeOrg, refreshOrgs } = useOrg()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Photo state
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSaved, setPhotoSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

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

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setPhotoError(null)
    setPhotoSaved(false)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/upload/org-image?orgId=${currentOrg.orgId}`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Upload failed')
      }
      await refreshOrgs()
      setPhotoSaved(true)
      setTimeout(() => setPhotoSaved(false), 3000)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemovePhoto() {
    setUploadingPhoto(true)
    setPhotoError(null)
    try {
      const res = await fetch(`/api/upload/org-image?orgId=${currentOrg.orgId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to remove photo')
      }
      await refreshOrgs()
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to remove photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const orgInitial = currentOrg.orgName[0]?.toUpperCase() ?? 'W'

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

        {/* Workspace photo */}
        <Card className="border-border">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Workspace photo
              </CardTitle>
              {!isOwner && <Badge variant="neutral">Read only</Badge>}
            </div>
            <CardDescription className="text-muted-foreground">
              A logo or photo for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-xl">
                {currentOrg.orgImage && (
                  <AvatarImage src={currentOrg.orgImage} alt={currentOrg.orgName} className="rounded-xl object-cover" />
                )}
                <AvatarFallback className="rounded-xl text-lg font-semibold">
                  {orgInitial}
                </AvatarFallback>
              </Avatar>

              {isOwner && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} className="mr-1.5" />
                      {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
                    </Button>
                    {currentOrg.orgImage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploadingPhoto}
                        onClick={() => void handleRemovePhoto()}
                      >
                        Remove
                      </Button>
                    )}
                    {photoSaved && (
                      <span className="text-sm font-medium text-brand-success">Saved</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP or GIF · max 2 MB
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                title="Upload workspace photo"
                accept={ACCEPTED_IMAGE_UPLOAD_TYPES}
                className="hidden"
                onChange={(e) => void handlePhotoChange(e)}
              />
            </div>

            {photoError && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{photoError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Workspace name */}
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
            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
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

        {/* Danger zone */}
        {isOwner && (
          <Card className="border-destructive/40">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold text-destructive">
                Danger zone
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Irreversible actions for this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Delete workspace</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently deletes this workspace, cancels its subscription, and tears down all infrastructure.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <DeleteOrgDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          orgName={currentOrg.orgName}
          orgId={currentOrg.orgId}
        />
      </div>
    </SettingsLayout>
  )
}
