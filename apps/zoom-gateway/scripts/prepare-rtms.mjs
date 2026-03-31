import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)

function resolvePackageRoot(packageJsonPath) {
  return path.dirname(packageJsonPath)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${result.status}`
    )
  }
}

function extractFrameworkArchives(buildDir) {
  if (process.platform !== 'darwin' || !existsSync(buildDir)) return

  const archives = readdirSync(buildDir).filter((file) =>
    file.endsWith('.framework.tar.gz')
  )

  for (const archive of archives) {
    run('tar', ['-xzf', archive], buildDir)
    rmSync(path.join(buildDir, archive), { force: true })
  }
}

function ensureRtmsBinary() {
  const rtmsPackageJson = require.resolve('@zoom/rtms/package.json')
  const rtmsRoot = resolvePackageRoot(rtmsPackageJson)
  const buildDir = path.join(rtmsRoot, 'build', 'Release')
  const binaryPath = path.join(buildDir, 'rtms.node')

  if (!existsSync(binaryPath)) {
    const prebuildInstallBin = require.resolve('prebuild-install/bin.js')
    run(process.execPath, [prebuildInstallBin, '-r', 'napi'], rtmsRoot)
  }

  extractFrameworkArchives(buildDir)
}

try {
  ensureRtmsBinary()
} catch (error) {
  console.warn(
    '[zoom-gateway] RTMS native binary could not be prepared automatically.'
  )
  if (error instanceof Error) {
    console.warn(error.message)
  }
}
