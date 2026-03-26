import { Client } from 'ssh2'
import { env } from '../env'

interface SshExecResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Execute a command on a remote host via SSH using the admin private key.
 * Server-side only — never exposed via tRPC.
 */
export function sshExec(
  host: string,
  user: string,
  command: string,
): Promise<SshExecResult> {
  // Handle both formats: literal \n from .env files, or real newlines from Railway
  const raw = env.ADMIN_SSH_PRIVATE_KEY
  const privateKey = raw?.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
  if (!privateKey) {
    throw new Error('ADMIN_SSH_PRIVATE_KEY is not configured')
  }

  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end()
            reject(err)
            return
          }

          let stdout = ''
          let stderr = ''

          stream.on('data', (data: Buffer) => {
            stdout += data.toString()
          })

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })

          stream.on('close', (code: number) => {
            conn.end()
            resolve({ stdout, stderr, code })
          })
        })
      })
      .on('error', (err) => {
        reject(err)
      })
      .connect({
        host,
        port: 22,
        username: user,
        privateKey,
        readyTimeout: 10000,
      })
  })
}

/**
 * Check if cloud-init has completed by looking for the kodi sentinel file.
 * Returns false (not throws) if SSH is unreachable — instance may still be booting.
 */
export async function checkCloudInitComplete(
  host: string,
  user: string,
): Promise<boolean> {
  try {
    const result = await sshExec(
      host,
      user,
      'test -f /var/lib/cloud/instance/kodi-ready && echo ok',
    )
    return result.stdout.trim() === 'ok'
  } catch {
    return false
  }
}
