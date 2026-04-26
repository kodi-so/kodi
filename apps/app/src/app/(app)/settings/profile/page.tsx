'use client'

import { useEffect, useRef, useState } from 'react'
import { authClient, useSession } from '@/lib/auth-client'
import { ACCEPTED_IMAGE_UPLOAD_TYPES } from '@/lib/image-upload'
import { SettingsLayout } from '../_components/settings-layout'
import { Mail, Upload, UserRound } from 'lucide-react'
import { Alert, AlertDescription } from '@kodi/ui/components/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@kodi/ui/components/avatar'
import { Button } from '@kodi/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kodi/ui/components/card'
import { Input } from '@kodi/ui/components/input'
import { Skeleton } from '@kodi/ui/components/skeleton'

export default function ProfileSettingsPage() {
  const { data: session, isPending, refetch } = useSession()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSaved, setPhotoSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name)
    }
  }, [session?.user?.name])

  useEffect(() => {
    if (!saved) return
    const timeoutId = window.setTimeout(() => setSaved(false), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [saved])

  useEffect(() => {
    if (!photoSaved) return
    const timeoutId = window.setTimeout(() => setPhotoSaved(false), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [photoSaved])

  if (isPending) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center py-20">
          <Skeleton className="h-6 w-6 rounded-full bg-brand-muted" />
        </div>
      </SettingsLayout>
    )
  }

  if (!session?.user) {
    return (
      <SettingsLayout>
        <div className="py-10 text-center">
          <Alert variant="destructive" className="mx-auto max-w-md">
            <AlertDescription>Could not load your profile.</AlertDescription>
          </Alert>
        </div>
      </SettingsLayout>
    )
  }

  const currentUser = session.user
  const trimmedName = name.trim()
  const displayName = currentUser.name?.trim() || currentUser.email
  const userInitial = displayName[0]?.toUpperCase() ?? 'U'
  const isDirty = trimmedName.length > 0 && trimmedName !== currentUser.name

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!isDirty) return

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const result = await authClient.updateUser({ name: trimmedName })
      if (result?.error) {
        throw new Error(result.error.message ?? 'Failed to update profile')
      }

      await refetch()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    setPhotoError(null)
    setPhotoSaved(false)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload/profile-image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Upload failed')
      }

      await refetch()
      setPhotoSaved(true)
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
      const response = await fetch('/api/upload/profile-image', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to remove photo')
      }

      await refetch()
      setPhotoSaved(true)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to remove photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-accent text-primary shadow-sm">
              <UserRound size={18} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Profile
            </h1>
          </div>
          <p className="ml-[3.25rem] text-sm leading-7 text-muted-foreground">
            Manage how you appear across Kodi.
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold text-foreground">
              Profile photo
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Shown in your sidebar menu and anywhere your account appears inside the app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-xl">
                {currentUser.image ? (
                  <AvatarImage
                    src={currentUser.image}
                    alt={displayName}
                    className="rounded-xl object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-xl text-lg font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>

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
                  {currentUser.image ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploadingPhoto}
                      onClick={() => void handleRemovePhoto()}
                    >
                      Remove
                    </Button>
                  ) : null}
                  {photoSaved ? (
                    <span className="text-sm font-medium text-brand-success">
                      Saved
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP or GIF · max 2 MB
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                title="Upload profile photo"
                accept={ACCEPTED_IMAGE_UPLOAD_TYPES}
                className="hidden"
                onChange={(event) => void handlePhotoChange(event)}
              />
            </div>

            {photoError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{photoError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold text-foreground">
              Profile details
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Update the name that appears across chat, approvals, and shared activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
              <div>
                <Input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saving}
                  maxLength={80}
                  placeholder="Your name"
                  className="h-12 rounded-xl border-border bg-card"
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!isDirty || saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
                {saved ? (
                  <span className="text-sm font-medium text-brand-success">
                    Saved
                  </span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold text-foreground">
              Account email
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              The email address currently attached to your sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Mail size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {currentUser.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  This email is used for login and account notifications.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  )
}
