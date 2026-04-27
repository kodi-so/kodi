'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@kodi/ui/components/button'
import { cn } from '@kodi/ui/lib/utils'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export function DemoForm({ className }: { className?: string }) {
  const [state, setFormState] = useState<FormState>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormState('submitting')
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form))

    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Request failed')
      setFormState('success')
      form.reset()
    } catch {
      setFormState('error')
    }
  }

  if (state === 'success') {
    return (
      <div
        className={cn(
          'rounded-2xl border border-brand-success/40 bg-brand-success-soft p-8 text-center',
          className
        )}
      >
        <p className="text-base text-brand-success">
          Got it — we&apos;ll be in touch within one business day.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-4', className)}
      aria-label="Book a walkthrough"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="demo-name" className="mb-1.5 block text-sm text-foreground">
            Name
          </label>
          <input
            id="demo-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Alex Johnson"
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
          />
        </div>
        <div>
          <label htmlFor="demo-email" className="mb-1.5 block text-sm text-foreground">
            Work email
          </label>
          <input
            id="demo-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="alex@company.com"
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
          />
        </div>
      </div>
      <div>
        <label htmlFor="demo-company" className="mb-1.5 block text-sm text-foreground">
          Company
        </label>
        <input
          id="demo-company"
          name="company"
          type="text"
          autoComplete="organization"
          placeholder="Acme Inc."
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>
      <div>
        <label htmlFor="demo-message" className="mb-1.5 block text-sm text-foreground">
          What&apos;s driving this? <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="demo-message"
          name="message"
          rows={3}
          placeholder="Tell us a bit about what you're hoping Kodi can help with."
          className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>
      {state === 'error' && (
        <p className="text-sm text-brand-danger" role="alert">
          Something went wrong. Please try again or email us directly.
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={state === 'submitting'}
      >
        {state === 'submitting' ? 'Sending…' : 'Book a walkthrough'}
      </Button>
    </form>
  )
}
