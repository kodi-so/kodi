import { Alert, AlertDescription, Badge, Button, cn } from '@kodi/ui'
import { subtleTextClass } from '@/lib/brand-styles'
import {
  formatIntegrationDate,
  formatScope,
  getConnectionLabel,
  getStatusTone,
  type ToolAccessToolkitDetail,
} from '../../_lib/tool-access-ui'

export function ConnectionCard({
  connection,
  actionKey,
  preferenceActionKey,
  onDisconnect,
  onRevalidate,
  onSelectPreferred,
}: {
  connection: ToolAccessToolkitDetail['connections'][number]
  actionKey: string | null
  preferenceActionKey: string | null
  onDisconnect: (connectedAccountId: string) => void
  onRevalidate: (connectedAccountId: string) => void
  onSelectPreferred: (connectedAccountId: string) => void
}) {
  const isDisconnecting =
    actionKey === `disconnect:${connection.connectedAccountId}`
  const isRevalidating =
    actionKey === `revalidate:${connection.connectedAccountId}`
  const isSelecting =
    preferenceActionKey === connection.connectedAccountId

  return (
    <div
      className={cn(
        'rounded-[1.2rem] border p-4',
        connection.isPreferred
          ? 'border-brand-success/20 bg-brand-success-soft'
          : 'border-brand-line bg-brand-elevated'
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {getConnectionLabel(connection)}
              </p>
              <Badge variant={getStatusTone(connection.status)}>
                {connection.status}
              </Badge>
              {connection.isPreferred && (
                <Badge variant="success">Preferred</Badge>
              )}
            </div>

            <div
              className={`flex flex-wrap gap-3 text-xs ${subtleTextClass}`}
            >
              {connection.lastValidatedAt && (
                <span>
                  Validated{' '}
                  {formatIntegrationDate(connection.lastValidatedAt)}
                </span>
              )}
              {connection.updatedAt && (
                <span>
                  Updated{' '}
                  {formatIntegrationDate(connection.updatedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {connection.status !== 'ACTIVE' && (
              <Button
                type="button"
                variant="ghost"
                className="border border-brand-line bg-background text-brand-quiet hover:bg-secondary hover:text-foreground"
                disabled={actionKey !== null}
                onClick={() =>
                  void onRevalidate(connection.connectedAccountId)
                }
              >
                {isRevalidating ? 'Revalidating...' : 'Revalidate'}
              </Button>
            )}

            {!connection.isPreferred &&
              connection.status !== 'INACTIVE' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-brand-line bg-background text-brand-quiet hover:bg-secondary hover:text-foreground"
                  disabled={preferenceActionKey !== null}
                  onClick={() =>
                    void onSelectPreferred(
                      connection.connectedAccountId
                    )
                  }
                >
                  {isSelecting ? 'Saving...' : 'Prefer this identity'}
                </Button>
              )}

            <Button
              type="button"
              variant="destructive"
              disabled={actionKey !== null}
              onClick={() =>
                void onDisconnect(connection.connectedAccountId)
              }
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </div>

        {connection.scopes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {connection.scopes
              .slice(0, 8)
              .map((scope: string) => (
                <Badge
                  key={scope}
                  variant="neutral"
                  className="max-w-full"
                >
                  {formatScope(scope)}
                </Badge>
              ))}
            {connection.scopes.length > 8 && (
              <Badge variant="neutral">
                +{connection.scopes.length - 8} more scopes
              </Badge>
            )}
          </div>
        )}

        {connection.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>
              {connection.errorMessage}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
