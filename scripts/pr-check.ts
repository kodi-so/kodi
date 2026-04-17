/**
 * Guard against reusing a branch whose PR is already merged or closed.
 *
 * Usage:
 *   bun scripts/pr-check.ts
 *   bun scripts/pr-check.ts my-branch-name
 */
import { spawnSync } from 'node:child_process'

type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED'

type PullRequestSummary = {
  number: number
  state: PullRequestState
  mergedAt: string | null
  isDraft: boolean
  headRefName: string
  baseRefName: string
  title: string
  url: string
}

const protectedBranches = new Set(['dev', 'main', 'master'])

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return {
    code: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

function fail(message: string, exitCode = 1): never {
  console.error(message)
  process.exit(exitCode)
}

function getCurrentBranch() {
  const result = run('git', ['branch', '--show-current'])
  if (result.code !== 0 || !result.stdout) {
    fail(`Unable to determine current branch.\n${result.stderr || result.stdout}`.trim())
  }

  return result.stdout
}

function getPullRequests(branch: string) {
  const result = run('gh', [
    'pr',
    'list',
    '--search',
    `head:${branch}`,
    '--state',
    'all',
    '--json',
    'number,state,mergedAt,isDraft,headRefName,baseRefName,title,url',
  ])

  if (result.code !== 0) {
    fail(
      [
        'Unable to inspect GitHub pull requests for this branch.',
        'Make sure `gh` is installed and authenticated.',
        result.stderr || result.stdout,
      ].filter(Boolean).join('\n'),
    )
  }

  try {
    return JSON.parse(result.stdout || '[]') as PullRequestSummary[]
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`Failed to parse GitHub PR output.\n${message}`)
  }
}

function printRecommendations() {
  console.error('\nNext step:')
  console.error('  git switch dev')
  console.error('  git pull')
  console.error('  git switch -c <fresh-branch-name>')
}

const requestedBranch = process.argv[2]?.trim()
const branch = requestedBranch || getCurrentBranch()

if (!branch) {
  fail('Branch name cannot be empty.')
}

if (protectedBranches.has(branch)) {
  fail(
    [
      `Refusing to open or update a PR from protected branch \`${branch}\`.`,
      'Create a feature branch from `dev` first.',
    ].join('\n'),
    2,
  )
}

const pullRequests = getPullRequests(branch).filter((pr) => pr.headRefName === branch)

if (pullRequests.length === 0) {
  console.log(`OK: branch \`${branch}\` has no existing pull request.`)
  process.exit(0)
}

const mergedPullRequests = pullRequests.filter((pr) => pr.state === 'MERGED' || pr.mergedAt)
if (mergedPullRequests.length > 0) {
  console.error(`Branch \`${branch}\` already has merged pull request(s):`)
  for (const pr of mergedPullRequests) {
    console.error(`  #${pr.number} ${pr.title} -> ${pr.baseRefName} (${pr.url})`)
  }
  console.error('\nDo not keep committing to this branch for follow-up work.')
  printRecommendations()
  process.exit(2)
}

const closedPullRequests = pullRequests.filter((pr) => pr.state === 'CLOSED')
if (closedPullRequests.length > 0) {
  console.error(`Branch \`${branch}\` has closed pull request(s):`)
  for (const pr of closedPullRequests) {
    console.error(`  #${pr.number} ${pr.title} -> ${pr.baseRefName} (${pr.url})`)
  }
  console.error('\nThis branch should not be reused for new work.')
  printRecommendations()
  process.exit(2)
}

const openPullRequests = pullRequests.filter((pr) => pr.state === 'OPEN')
console.log(`OK: branch \`${branch}\` is safe to keep using.`)
for (const pr of openPullRequests) {
  const draftLabel = pr.isDraft ? ' draft' : ''
  console.log(`  Open PR #${pr.number}${draftLabel}: ${pr.title} -> ${pr.baseRefName}`)
}
