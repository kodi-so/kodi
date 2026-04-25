// Single-file esbuild bundle for the kodi-bridge OpenClaw plugin.
//
// Plugins loaded via OpenClaw's custom-path mechanism do NOT get a
// `node_modules` repair pass at runtime, so we ship one self-contained
// `dist/index.js` with every dependency inlined — except for the OpenClaw
// plugin-sdk subpaths, which the runtime provides in-process.
//
// CLI:
//   node esbuild.config.mjs           — single build
//   node esbuild.config.mjs --watch   — rebuild on change

import { build, context } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

// Pin the build target to the Node version pinned in openclaw.compat.
// 2026.4.23 ships against Node 22 (verified locally). When we bump the
// compat field, bump this in lockstep.
const NODE_TARGET = 'node22'

// CI sets PLUGIN_VERSION (e.g. `2026-04-21-abc1234`) so identity.ts hard-bakes
// it into the bundle. Local builds fall back to `dev` so `bun run build`
// keeps working without environment plumbing.
const PLUGIN_VERSION = process.env.PLUGIN_VERSION ?? 'dev'

// Externals: anything OpenClaw's plugin runtime provides at load time.
// esbuild's `external` only accepts strings, so we mark `openclaw` and any
// `openclaw/<subpath>` external via a small onResolve plugin instead.
//
// Node built-ins are external by default for platform: 'node'; listed here
// for clarity only.
const explicitExternals = [
  'node:crypto',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:url',
]

/** @type {import('esbuild').Plugin} */
const externalOpenClawPlugin = {
  name: 'external-openclaw',
  setup(build) {
    // Match `openclaw` and any subpath like `openclaw/plugin-sdk/core`.
    build.onResolve({ filter: /^openclaw(\/|$)/ }, (args) => ({
      path: args.path,
      external: true,
    }))
  },
}

const baseOptions = {
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  outfile: resolve(__dirname, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: NODE_TARGET,
  sourcemap: true,
  minify: false,
  treeShaking: true,
  legalComments: 'inline',
  logLevel: 'info',
  define: {
    // Bake the version into the bundle at build time. Reading
    // `process.env.PLUGIN_VERSION` at runtime in the gateway would be
    // unreliable (the gateway process doesn't necessarily inherit our env).
    'process.env.PLUGIN_VERSION': JSON.stringify(PLUGIN_VERSION),
  },
  banner: {
    js: [
      '/**',
      ` * @kodi/openclaw-bridge plugin bundle`,
      ` * Built ${new Date().toISOString()}`,
      ` * Plugin version: ${PLUGIN_VERSION}`,
      ` * Plugin SDK compat: ${pkg.openclaw?.compat?.pluginApi ?? 'unknown'}`,
      ` *`,
      ` * Edits to this file will be overwritten on next build.`,
      ` */`,
    ].join('\n'),
  },
  external: explicitExternals,
  plugins: [externalOpenClawPlugin],
}

const watch = process.argv.includes('--watch')

if (watch) {
  const ctx = await context(baseOptions)
  await ctx.watch()
  console.log('[esbuild] watching for changes…')
} else {
  await build(baseOptions)
  console.log('[esbuild] dist/index.js built')
}
