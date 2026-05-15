/**
 * The plugin owns the agent's `IDENTITY.md` file. OpenClaw reads it on every
 * turn for the agent (`runtime.agent.resolveAgentIdentity`); the YAML
 * frontmatter is what survives parsing. The body below the `---` is human
 * documentation only — OpenClaw ignores it but a developer SSH-ing onto a
 * box benefits from seeing what the file is.
 *
 * The frontmatter shape (`{ user_id, org_id, created_at }`) is fixed by the
 * KOD-380 ticket and consumed by the autonomy module (KOD-389+) and by
 * Kodi-side memory bootstrap (KOD-407 contract).
 */
export type IdentityFrontmatter = {
  user_id: string
  org_id: string
  created_at: string
}

export function buildIdentityMarkdown(fm: IdentityFrontmatter): string {
  const frontmatter = [
    '---',
    `user_id: ${fm.user_id}`,
    `org_id: ${fm.org_id}`,
    `created_at: ${fm.created_at}`,
    '---',
  ].join('\n')
  const body = [
    '',
    '# OpenClaw Agent — Kodi Bridge',
    '',
    `This agent belongs to Kodi user \`${fm.user_id}\` in org \`${fm.org_id}\`.`,
    'Provisioned by the `kodi-bridge` plugin; do not edit by hand —',
    'the plugin will overwrite changes on rotation.',
    '',
  ].join('\n')
  return `${frontmatter}\n${body}`
}
