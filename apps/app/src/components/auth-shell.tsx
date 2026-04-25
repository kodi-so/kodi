'use client'

import type { ReactNode } from 'react'
import { BrandLogo } from '@kodi/ui/components/brand-logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kodi/ui/components/card'

type AuthShellProps = {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandLogo size={40} labelClassName="text-2xl" />
        </div>

        <Card className="border-border/80 bg-card">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl">{title}</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>

        {footer ? (
          <div className="text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
