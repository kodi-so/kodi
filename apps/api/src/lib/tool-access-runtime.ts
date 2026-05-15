import { db, eq, toolActionRuns, toolSessionRuns } from '@kodi/db'
import { classifyToolCall } from '@kodi/shared/action-class'
import { env } from '../env'
import type { OpenClawConversationVisibility } from './openclaw/client'
import {
  choosePrimaryConnection,
  getComposioClient,
  getEffectiveToolkitPolicy,
  getToolAccessSetupStatus,
  listPersistedConnections,
  listToolkitAccountPreferences,
  listToolkitPolicies,
  markPersistedConnectionAttention,
  syncUserConnectionsForOrg,
  type EffectiveToolkitPolicy,
} from './composio'
import {
  buildApprovalResponseMessage,
  queueToolApprovalRequest,
} from './tool-access-approvals'
import {
  emitSlackMemoryUpdateEvent,
  resolveSlackMemoryEventInput,
} from './memory/slack-events'

type AnyDb = typeof db

const ACTIVE_CONNECTION_STATUS = 'ACTIVE'
const MAX_RELEVANT_TOOLS = 12
const MAX_TOOL_ROUNDS = 6
const MAX_TOOL_CALLS_PER_ROUND = 4
const OPENCLAW_REQUEST_TIMEOUT_MS = 60_000
const MAX_TOOL_MESSAGE_CHARS = 16_000
const MAX_TOOL_STRING_CHARS = 1_200
const MAX_TOOL_OBJECT_KEYS = 20
const MAX_TOOL_ARRAY_ITEMS = 8

// Verb sets + name-only classifier moved to `@kodi/shared/action-class`
// (KOD-394). The plugin-side autonomy interceptor (KOD-390) and Kodi's
// `getToolCategory` below both consume the shared classifier; Kodi adds
// description- and tag-aware refinements on top.

export type ToolRuntimeSourceType = 'chat' | 'meeting'

export type ToolActionCategory = 'read' | 'draft' | 'write' | 'admin'

export type ToolPermissionStatus = 'allowed' | 'approval_required' | 'denied'

type LegacyToolProvider =
  | 'linear'
  | 'github'
  | 'slack'
  | 'jira'
  | 'notion'
  | 'zoom'

type OpenAIToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type OpenAIMessage =
  | {
      role: 'system' | 'user' | 'assistant'
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
  | {
      role: 'tool'
      content: string
      tool_call_id: string
    }

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type ChatCompletionChoice = {
  finish_reason?: string | null
  message?: {
    role?: string
    content?: string | null
    tool_calls?: Array<{
      id?: string
      type?: string
      function?: {
        name?: string
        arguments?: string
      }
    }>
  }
}

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[]
}

type RuntimeConnection = Awaited<
  ReturnType<typeof listPersistedConnections>
>[number]

type RuntimePolicy = Awaited<ReturnType<typeof listToolkitPolicies>>[number]

type RuntimePreference = Awaited<
  ReturnType<typeof listToolkitAccountPreferences>
>[number]

type SessionTool = {
  slug: string
  name: string
  description: string
  inputParameters: Record<string, unknown>
  outputParameters: Record<string, unknown>
  scopes: string[]
  tags: string[]
  searchRank: number
  toolkit: {
    slug: string
    name: string
    logo: string | null
  }
}

type RawSearchResult = {
  error?: string | null
  primary_tool_slugs?: unknown
  related_tool_slugs?: unknown
}

type RawSearchToolSchema = {
  tool_slug?: unknown
  toolkit?: unknown
  description?: unknown
  input_schema?: unknown
  output_schema?: unknown
  scopes?: unknown
  tags?: unknown
}

type RawSearchResponse = {
  error?: string | null
  results?: unknown
  tool_schemas?: unknown
}

type SearchResponse = {
  error: string | null
  results: RawSearchResult[]
  toolSchemas: Record<string, RawSearchToolSchema>
}

type RawSearchSession = {
  sessionId: string
  client: {
    toolRouter: {
      session: {
        search: (
          sessionId: string,
          params: {
            queries: Array<{ use_case: string }>
            toolkits?: string[]
          }
        ) => Promise<RawSearchResponse>
      }
    }
  }
}

type ToolPermissionDecision = {
  toolSlug: string
  toolkitSlug: string
  toolkitName: string
  category: ToolActionCategory
  status: ToolPermissionStatus
  reason: string
  policy: EffectiveToolkitPolicy
  connectedAccountId: string | null
  connectionId: string | null
}

type ScopedToolRuntime = {
  sessionRunId: string | null
  composioSessionId: string | null
  sourceType: ToolRuntimeSourceType
  sourceId: string | null
  enabledToolkits: string[]
  allowedTools: SessionTool[]
  approvalTools: SessionTool[]
  openAITools: OpenAIToolDefinition[]
  allowedDecisions: Map<string, ToolPermissionDecision>
  approvalDecisions: Map<string, ToolPermissionDecision>
  gatedDecisions: ToolPermissionDecision[]
  assistivePrompt: string | null
  metadata: Record<string, unknown>
}

type AutomaticToolExecutionPlan = {
  argumentsPayload: Record<string, unknown>
  decision: ToolPermissionDecision
  family: string
  score: number
  tool: SessionTool
}

type OpenAIToolChoice = 'auto' | 'required'

type ToolExecutionPayload = {
  success: boolean
  error: string | null
  data: Record<string, unknown> | null
  logId: string | null
}

type ModelSafeToolExecutionPayload = {
  success: boolean
  error: string | null
  data: unknown
  logId: string | null
  truncated: boolean
  summary?: string
}

type AutomaticToolExecutionResult = {
  assistantToolCalls: OpenAIToolCall[]
  summaryMessage: OpenAIMessage
  toolMessages: OpenAIMessage[]
  usedToolSlugs: string[]
}

type QueuedApprovalResult = {
  approvalRequestId: string
  toolActionRunId: string
  preview: {
    title: string
    summary: string
    targetText: string | null
    fieldPreview: Array<{ label: string; value: string }>
    argumentsPreview: Record<string, unknown>
  }
  toolkitName: string
  toolSlug: string
}

type LinearTeamSnapshot = {
  id: string
  name: string
  memberIds: string[]
  projectIds: string[]
}

type LinearProjectSnapshot = {
  id: string
  name: string
}

type LinearUserSnapshot = {
  id: string
  name: string
  email: string | null
  active: boolean
}

type LinearIssueCreationPlan = {
  canCreate: boolean
  title: string | null
  description: string | null
  team_id: string | null
  project_id: string | null
  assignee_id: string | null
  clarification_question: string | null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeToolkitSlug(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : 'unknown'
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function getToolSchemaProperties(tool: SessionTool) {
  const normalized = normalizeToolParameters(tool.inputParameters)
  const properties =
    normalized.properties && typeof normalized.properties === 'object'
      ? (normalized.properties as Record<string, Record<string, unknown>>)
      : {}

  const required = Array.isArray(normalized.required)
    ? normalized.required.filter(
        (value): value is string => typeof value === 'string'
      )
    : []

  return { properties, required }
}

function inferToolFamily(tool: SessionTool) {
  const slug = tool.slug.toUpperCase()

  if (slug.includes('EMAIL') || slug.includes('INBOX')) return 'emails'
  if (slug.includes('MESSAGE') || slug.includes('THREAD')) return 'messages'
  if (slug.includes('CALENDAR') || slug.includes('EVENT')) return 'events'
  if (slug.includes('PROJECT')) return 'projects'
  if (slug.includes('ISSUE') || slug.includes('TICKET')) return 'issues'
  if (slug.includes('TEAM')) return 'teams'
  if (slug.includes('STATE')) return 'states'
  if (slug.includes('LABEL')) return 'labels'
  if (slug.includes('USER')) return 'users'
  if (slug.includes('CYCLE')) return 'cycles'
  if (slug.includes('COMMENT')) return 'comments'
  if (
    slug.includes('REPO') ||
    slug.includes('REPOSITORY') ||
    slug.includes('PULL_REQUEST') ||
    slug.includes('PULLREQUEST') ||
    slug.includes('PR')
  ) {
    return 'repositories'
  }
  if (slug.includes('CHANNEL')) return 'channels'
  if (slug.includes('DOC') || slug.includes('PAGE') || slug.includes('NOTE')) {
    return 'documents'
  }
  if (slug.includes('FILE') || slug.includes('FOLDER')) return 'files'
  if (slug.includes('CONTACT') || slug.includes('CUSTOMER')) return 'contacts'
  return tool.slug.toLowerCase()
}

function isSimpleGreeting(message: string) {
  return /^(hi|hello|hey|yo|sup|ping|thanks|thank you|ok|okay)[.!?]*$/i.test(
    message
  )
}

function isRuntimeAvailabilityQuestion(message: string) {
  return /\b(do you have access|can you access|are you connected|what can you do|what tools|what integrations|available actions|what do you have access to)\b/.test(
    message
  )
}

function isIntegrationSetupQuestion(message: string) {
  return /\b(set\s*up|setup|configure|integration|integrations|auth|oauth|callback|redirect|webhook|permission|permissions|policy|policies|token|secret|credential|credentials|env var|environment variable|why (?:is|isn't|does|doesn't)|not working|not work|broken|error|failed|attention needed)\b/.test(
    message
  )
}

function isLikelyWriteOnlyRequest(message: string) {
  const mentionsWriteVerb =
    /\b(create|make|open|file|log|add|send|post|update|edit|reply|comment|delete|remove|archive|share|assign|schedule|invite|draft)\b/.test(
      message
    )
  const mentionsReadVerb =
    /\b(list|show|find|search|lookup|look up|check|fetch|get|read|retrieve|summarize|review|what|which|latest|recent|today|tomorrow|upcoming|unread)\b/.test(
      message
    )

  return mentionsWriteVerb && !mentionsReadVerb
}

function isLikelyLiveDataRequest(message: string) {
  return (
    /\b(list|show|find|search|lookup|look up|check|fetch|get|read|retrieve|summarize|review|which)\b/.test(
      message
    ) ||
    /\b(latest|recent|today|tomorrow|upcoming|unread|open|assigned|left|exists)\b/.test(
      message
    ) ||
    /\bwhat\b.*\b(do we have|exists|left|open|assigned|in my|in our)\b/.test(
      message
    ) ||
    /\b(email|emails|inbox|mail|message|messages|thread|threads|calendar|event|events|repo|repos|repository|repositories|pull request|pull requests|pr|prs|issue|issues|ticket|tickets|team|teams|channel|channels|dm|project|projects|task|tasks|doc|docs|document|documents|page|pages|note|notes|file|files|folder|folders|contact|contacts|customer|customers|record|records)\b/.test(
      message
    )
  )
}

function shouldRequireToolUse(
  userMessage: string,
  runtime: Pick<
    ScopedToolRuntime,
    'allowedTools' | 'approvalTools' | 'enabledToolkits'
  >
) {
  if (runtime.allowedTools.length === 0 && runtime.approvalTools.length === 0) {
    return false
  }

  const message = userMessage.trim().toLowerCase()

  if (isSimpleGreeting(message)) {
    return false
  }

  if (
    isRuntimeAvailabilityQuestion(message) ||
    isIntegrationSetupQuestion(message)
  ) {
    return false
  }

  const toolkitTerms = uniqueStrings([
    ...runtime.enabledToolkits,
    ...runtime.allowedTools.map((tool) => tool.toolkit.slug),
    ...runtime.allowedTools.map((tool) => tool.toolkit.name.toLowerCase()),
    ...runtime.approvalTools.map((tool) => tool.toolkit.slug),
    ...runtime.approvalTools.map((tool) => tool.toolkit.name.toLowerCase()),
  ]).map((term) => term.toLowerCase())

  const mentionsToolkit = toolkitTerms.some(
    (term) => term.length > 0 && message.includes(term)
  )

  if (mentionsToolkit && !isLikelyWriteOnlyRequest(message)) {
    return true
  }

  if (isLikelyWriteOnlyRequest(message)) {
    return runtime.approvalTools.length > 0
  }

  return isLikelyLiveDataRequest(message)
}

function shouldAnswerFromRuntimeState(
  userMessage: string,
  runtime: Pick<ScopedToolRuntime, 'enabledToolkits' | 'allowedTools'>
) {
  if (runtime.enabledToolkits.length === 0) return false

  const message = userMessage.trim().toLowerCase()

  return (
    isRuntimeAvailabilityQuestion(message) && !isLikelyLiveDataRequest(message)
  )
}

function getMentionedRuntimeToolkit(
  userMessage: string,
  runtime: Pick<ScopedToolRuntime, 'enabledToolkits' | 'allowedTools'>
) {
  const message = userMessage.toLowerCase()
  const toolkitTerms = new Map<string, string>()

  for (const toolkitSlug of runtime.enabledToolkits) {
    toolkitTerms.set(toolkitSlug.toLowerCase(), toolkitSlug)
  }

  for (const tool of runtime.allowedTools) {
    toolkitTerms.set(tool.toolkit.slug.toLowerCase(), tool.toolkit.slug)
    toolkitTerms.set(tool.toolkit.name.toLowerCase(), tool.toolkit.slug)
  }

  for (const [term, toolkitSlug] of toolkitTerms) {
    if (term.length > 0 && message.includes(term)) {
      return toolkitSlug
    }
  }

  return null
}

function buildRuntimeAvailabilityAnswer(
  userMessage: string,
  runtime: Pick<
    ScopedToolRuntime,
    'allowedTools' | 'enabledToolkits' | 'allowedDecisions'
  >
) {
  const mentionedToolkit = getMentionedRuntimeToolkit(userMessage, runtime)

  if (mentionedToolkit) {
    const toolsForToolkit = runtime.allowedTools.filter(
      (tool) => tool.toolkit.slug === mentionedToolkit
    )

    if (toolsForToolkit.length === 0) {
      if (runtime.enabledToolkits.includes(mentionedToolkit)) {
        return [
          `Yes. ${mentionedToolkit} is connected for this request through Kodi's request-scoped tool runtime.`,
          'No specific executable actions were surfaced for this exact prompt yet, but the connected toolkit is available to Kodi in this request.',
          'Kodi attaches these tools at request time, so they may not appear as permanent OpenClaw gateway plugins.',
        ].join(' ')
      }

      return `No. ${mentionedToolkit} is not connected in this request scope right now.`
    }

    const readableTools = toolsForToolkit
      .filter(
        (tool) => runtime.allowedDecisions.get(tool.slug)?.category === 'read'
      )
      .map((tool) => tool.slug)
      .slice(0, 6)

    return [
      `Yes. ${mentionedToolkit} is connected for this request through Kodi's request-scoped tool runtime.`,
      readableTools.length > 0
        ? `Readable tools available right now: ${readableTools.join(', ')}.`
        : `Executable tools available right now: ${toolsForToolkit
            .map((tool) => tool.slug)
            .slice(0, 6)
            .join(', ')}.`,
      'Kodi attaches these tools at request time, so they may not appear as permanent OpenClaw gateway plugins.',
    ].join(' ')
  }

  return [
    `Connected toolkits in scope for this request: ${runtime.enabledToolkits.join(', ')}.`,
    runtime.allowedTools.length > 0
      ? `Executable tools surfaced right now: ${runtime.allowedTools
          .map((tool) => tool.slug)
          .slice(0, MAX_RELEVANT_TOOLS)
          .join(', ')}.`
      : 'No specific executable tools were surfaced for this exact prompt yet.',
    'Kodi brokers this access per request, so the gateway/plugin list is not the source of truth for tool availability.',
  ].join(' ')
}

function getAutomaticToolScore(tool: SessionTool, userMessage: string) {
  const message = userMessage.toLowerCase()
  const slug = tool.slug.toUpperCase()
  const family = inferToolFamily(tool)
  const { required } = getToolSchemaProperties(tool)

  let score = Math.max(4, 42 - tool.searchRank * 4)

  if (slug.includes('LIST')) score += 20
  if (slug.includes('SEARCH')) score += 18
  if (slug.includes('GET')) score += 10
  if (slug.includes('PROFILE')) score += 12
  if (slug.includes('RUN_QUERY_OR_MUTATION')) score -= 35

  if (message.includes('project') && slug.includes('PROJECT')) score += 55
  if (
    (message.includes('issue') || message.includes('ticket')) &&
    slug.includes('ISSUE')
  ) {
    score += 55
  }
  if (message.includes('team') && slug.includes('TEAM')) score += 45
  if (message.includes('state') && slug.includes('STATE')) score += 35
  if (
    (message.includes('email') ||
      message.includes('inbox') ||
      message.includes('mail')) &&
    (slug.includes('EMAIL') ||
      slug.includes('MESSAGE') ||
      slug.includes('THREAD'))
  ) {
    score += 55
  }
  if (
    (message.includes('message') || message.includes('thread')) &&
    (slug.includes('MESSAGE') || slug.includes('THREAD'))
  ) {
    score += 45
  }
  if (
    (message.includes('calendar') ||
      message.includes('event') ||
      message.includes('schedule')) &&
    (slug.includes('CALENDAR') || slug.includes('EVENT'))
  ) {
    score += 55
  }
  if (
    (message.includes('repo') ||
      message.includes('repository') ||
      message.includes('pull request') ||
      /\bpr\b/.test(message)) &&
    (slug.includes('REPO') ||
      slug.includes('REPOSITORY') ||
      slug.includes('PULL_REQUEST') ||
      slug.includes('PULLREQUEST'))
  ) {
    score += 55
  }
  if (
    (message.includes('channel') ||
      message.includes('slack') ||
      message.includes('dm')) &&
    slug.includes('CHANNEL')
  ) {
    score += 50
  }
  if (
    (message.includes('doc') ||
      message.includes('page') ||
      message.includes('note')) &&
    (slug.includes('DOC') || slug.includes('PAGE') || slug.includes('NOTE'))
  ) {
    score += 45
  }
  if (
    (message.includes('file') || message.includes('folder')) &&
    (slug.includes('FILE') || slug.includes('FOLDER'))
  ) {
    score += 45
  }
  if (
    /\b(my|me|current user|who am i)\b/.test(message) &&
    slug.includes('CURRENT_USER')
  ) {
    score += 45
  }
  if (
    /\b(my|me|our|today|tomorrow|latest|recent|upcoming|unread)\b/.test(
      message
    ) &&
    (slug.includes('LIST') ||
      slug.includes('FETCH') ||
      slug.includes('SEARCH') ||
      slug.includes('GET_PROFILE'))
  ) {
    score += 15
  }

  if (required.length === 0) score += 15
  score -= required.length * 25
  if (
    !/\b(id|identifier|number|key)\b/.test(message) &&
    required.some((value) => /(^|_)(id|key)$/.test(value.toLowerCase()))
  ) {
    score -= 30
  }

  if (
    family === 'users' &&
    !/\b(my|me|current user|who am i)\b/.test(message)
  ) {
    score -= 10
  }

  return score
}

function buildAutomaticToolArguments(tool: SessionTool, userMessage: string) {
  const { properties, required } = getToolSchemaProperties(tool)
  const args: Record<string, unknown> = {}
  const normalizedMessage = userMessage.trim().replace(/\s+/g, ' ')
  const loweredMessage = normalizedMessage.toLowerCase()
  const prefersRecent = /\b(latest|recent|newest|today|upcoming|unread)\b/.test(
    loweredMessage
  )
  const prefersSingleResult =
    /\b(most recent|latest|newest|last|top|first)\b/.test(loweredMessage) ||
    /\bemail\b/.test(loweredMessage) ||
    /\bmessage\b/.test(loweredMessage) ||
    /\bwhat was\b/.test(loweredMessage)

  const buildValue = (name: string) => {
    const normalized = name.toLowerCase()
    const schema = properties[name] ?? {}
    const enumValues = Array.isArray(schema.enum)
      ? schema.enum.filter(
          (value): value is string => typeof value === 'string'
        )
      : []

    if (
      [
        'query',
        'q',
        'search_query',
        'searchquery',
        'keywords',
        'keyword',
        'term',
        'text',
      ].includes(normalized)
    ) {
      return normalizedMessage
    }

    if (
      [
        'first',
        'limit',
        'page_size',
        'pagesize',
        'max_results',
        'maxresults',
      ].includes(normalized)
    ) {
      if (prefersSingleResult) return 1
      return prefersRecent ? 5 : 10
    }

    if (
      [
        'include_archived',
        'includearchived',
        'archived',
        'include_completed',
        'includecompleted',
      ].includes(normalized)
    ) {
      return false
    }

    if (
      [
        'only_unread',
        'unread_only',
        'include_unread_only',
        'is_unread',
      ].includes(normalized)
    ) {
      return loweredMessage.includes('unread')
    }

    if (
      ['sort', 'order', 'sort_order', 'order_by', 'orderby'].includes(
        normalized
      )
    ) {
      if (prefersRecent) {
        if (enumValues.includes('desc')) return 'desc'
        if (enumValues.includes('descending')) return 'descending'
        if (enumValues.includes('latest')) return 'latest'
      }

      if (enumValues.length === 1) {
        return enumValues[0]
      }
    }

    if (enumValues.length === 1) {
      return enumValues[0]
    }

    if (schema.type === 'array') {
      return []
    }

    if (schema.type === 'object') {
      return {}
    }

    if (schema.default !== undefined) {
      return schema.default
    }

    return undefined
  }

  for (const key of required) {
    const value = buildValue(key)
    if (value === undefined) {
      return null
    }

    args[key] = value
  }

  for (const key of Object.keys(properties)) {
    if (key in args) continue

    const value = buildValue(key)
    if (value !== undefined) {
      args[key] = value
    }
  }

  return args
}

function getAutomaticExecutionPlanLimit(userMessage: string) {
  const message = userMessage.trim().toLowerCase()

  if (
    /\b(most recent|latest|newest|last|top|first)\b/.test(message) ||
    /\bwhat was\b/.test(message) ||
    /\bwhich one\b/.test(message)
  ) {
    return 1
  }

  return 2
}

function shouldBrokerLinearIssueCreation(
  userMessage: string,
  runtime: Pick<ScopedToolRuntime, 'allowedDecisions'>
) {
  if (!runtime.allowedDecisions.has('LINEAR_CREATE_LINEAR_ISSUE')) {
    return false
  }

  const message = userMessage.trim().toLowerCase()

  if (
    /^(how do i|how can i|what do i need to do to)\b/.test(message) ||
    (/^(how|why|when)\b/.test(message) && message.endsWith('?'))
  ) {
    return false
  }

  if (
    /\b(how|why|when|can|could|would|should)\b/.test(message) &&
    !/\b(create|make|open|file|log|add)\b/.test(message)
  ) {
    return false
  }

  const mentionsCreate =
    /\b(create|make|open|file|log|add|submit)\b/.test(message) ||
    /\bnew\b/.test(message)
  const mentionsIssue = /\b(issue|ticket|bug|task|todo|story)\b/.test(message)

  return mentionsCreate && mentionsIssue
}

function buildSyntheticToolCall(
  toolSlug: string,
  argumentsPayload: Record<string, unknown>,
  prefix = 'broker'
) {
  return {
    id: `${prefix}-${Date.now()}-${toolSlug.toLowerCase()}`,
    type: 'function',
    function: {
      name: toolSlug,
      arguments: JSON.stringify(argumentsPayload),
    },
  } satisfies OpenAIToolCall
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeLinearTeams(payload: ToolExecutionPayload) {
  const data = asRecord(payload.data)
  if (!data) return []

  const teams = Array.isArray(data.teams) ? data.teams : []

  return teams.reduce<LinearTeamSnapshot[]>((items, team) => {
    const record = asRecord(team)
    if (!record) return items

    const id = typeof record.id === 'string' ? record.id : null
    const name = typeof record.name === 'string' ? record.name : null
    if (!id || !name) return items

    const members = Array.isArray(record.members) ? record.members : []
    const projects = Array.isArray(record.projects) ? record.projects : []

    items.push({
      id,
      name,
      memberIds: members
        .map((member) => {
          const memberRecord = asRecord(member)
          return typeof memberRecord?.id === 'string' ? memberRecord.id : null
        })
        .filter((memberId): memberId is string => Boolean(memberId)),
      projectIds: projects
        .map((project) => {
          const projectRecord = asRecord(project)
          return typeof projectRecord?.id === 'string' ? projectRecord.id : null
        })
        .filter((projectId): projectId is string => Boolean(projectId)),
    })

    return items
  }, [])
}

function normalizeLinearProjects(payload: ToolExecutionPayload) {
  const data = asRecord(payload.data)
  if (!data) return []

  const projects = Array.isArray(data.projects) ? data.projects : []

  return projects.reduce<LinearProjectSnapshot[]>((items, project) => {
    const record = asRecord(project)
    if (!record) return items

    const id = typeof record.id === 'string' ? record.id : null
    const name = typeof record.name === 'string' ? record.name : null
    if (!id || !name) return items

    items.push({ id, name })
    return items
  }, [])
}

function normalizeLinearUsers(payload: ToolExecutionPayload) {
  const data = asRecord(payload.data)
  if (!data) return []

  const users = Array.isArray(data.users) ? data.users : []

  return users.reduce<LinearUserSnapshot[]>((items, user) => {
    const record = asRecord(user)
    if (!record) return items

    const id = typeof record.id === 'string' ? record.id : null
    const name = typeof record.name === 'string' ? record.name : null
    if (!id || !name) return items

    items.push({
      id,
      name,
      email: typeof record.email === 'string' ? record.email : null,
      active: record.active === true,
    })

    return items
  }, [])
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  const withoutFences = trimmed.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return withoutFences.slice(start, end + 1)
}

function parseLinearIssueCreationPlan(text: string) {
  const json = extractJsonObject(text)
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>

    return {
      canCreate: parsed.canCreate === true,
      title: typeof parsed.title === 'string' ? parsed.title : null,
      description:
        typeof parsed.description === 'string' ? parsed.description : null,
      team_id: typeof parsed.team_id === 'string' ? parsed.team_id : null,
      project_id:
        typeof parsed.project_id === 'string' ? parsed.project_id : null,
      assignee_id:
        typeof parsed.assignee_id === 'string' ? parsed.assignee_id : null,
      clarification_question:
        typeof parsed.clarification_question === 'string'
          ? parsed.clarification_question
          : null,
    } satisfies LinearIssueCreationPlan
  } catch {
    return null
  }
}

function buildLinearIssuePlannerContext(params: {
  messages: OpenAIMessage[]
  userMessage: string
  teams: LinearTeamSnapshot[]
  projects: LinearProjectSnapshot[]
  users: LinearUserSnapshot[]
}) {
  const recentConversation = params.messages
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
    )
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n')

  const teamsText =
    params.teams.length > 0
      ? params.teams
          .map(
            (team) =>
              `${team.name} (${team.id}) projects=[${team.projectIds.join(', ')}] members=[${team.memberIds.join(', ')}]`
          )
          .join('\n')
      : 'None'

  const projectsText =
    params.projects.length > 0
      ? params.projects
          .map((project) => `${project.name} (${project.id})`)
          .join('\n')
      : 'None'

  const usersText =
    params.users.length > 0
      ? params.users
          .map(
            (user) =>
              `${user.name}${user.email ? ` <${user.email}>` : ''} (${user.id}) active=${user.active}`
          )
          .join('\n')
      : 'None'

  return [
    'Return only a JSON object with this shape:',
    '{"canCreate":boolean,"title":string|null,"description":string|null,"team_id":string|null,"project_id":string|null,"assignee_id":string|null,"clarification_question":string|null}',
    'Rules:',
    '- Use only IDs present in the metadata below.',
    '- If there is exactly one obvious team, choose it automatically.',
    '- If a project clearly maps to one team, use that team_id.',
    '- You may synthesize a concise issue title from the request when the user clearly wants a ticket created.',
    '- Put supporting detail into description when helpful.',
    '- If the request is too ambiguous to create a useful issue, set canCreate to false and ask one short clarification question.',
    '- Never mention tools, gateways, plugins, query parameters, or environment limitations.',
    '',
    `Latest user request: ${params.userMessage}`,
    recentConversation.length > 0
      ? `Recent conversation:\n${recentConversation}`
      : '',
    `Teams:\n${teamsText}`,
    `Projects:\n${projectsText}`,
    `Users:\n${usersText}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function finalizeLinearIssueCreationPlan(params: {
  plan: LinearIssueCreationPlan
  teams: LinearTeamSnapshot[]
  projects: LinearProjectSnapshot[]
  users: LinearUserSnapshot[]
}) {
  let teamId = params.plan.team_id
  let projectId = params.plan.project_id
  let assigneeId = params.plan.assignee_id

  const teamsById = new Map(params.teams.map((team) => [team.id, team]))
  const projectsById = new Map(
    params.projects.map((project) => [project.id, project])
  )
  const activeUsersById = new Map(
    params.users
      .filter((user) => user.active)
      .map((user) => [user.id, user] as const)
  )

  if (!teamId && params.teams.length === 1) {
    teamId = params.teams[0]!.id
  }

  if (projectId) {
    if (!projectsById.has(projectId)) {
      return {
        ok: false as const,
        clarificationQuestion:
          params.plan.clarification_question ??
          'Which Linear project should I use for this issue?',
      }
    }

    const matchingTeams = params.teams.filter((team) =>
      team.projectIds.includes(projectId!)
    )

    if (!teamId && matchingTeams.length === 1) {
      teamId = matchingTeams[0]!.id
    } else if (
      teamId &&
      matchingTeams.length === 1 &&
      matchingTeams[0]!.id !== teamId
    ) {
      teamId = matchingTeams[0]!.id
    } else if (!teamId && matchingTeams.length !== 1) {
      return {
        ok: false as const,
        clarificationQuestion:
          params.plan.clarification_question ??
          'Which Linear team should I create this issue in?',
      }
    }
  }

  if (!teamId || !teamsById.has(teamId)) {
    return {
      ok: false as const,
      clarificationQuestion:
        params.plan.clarification_question ??
        'Which Linear team should I create this issue in?',
    }
  }

  if (assigneeId && !activeUsersById.has(assigneeId)) {
    assigneeId = null
  }

  const title = params.plan.title?.trim() ?? ''
  if (title.length === 0) {
    return {
      ok: false as const,
      clarificationQuestion:
        params.plan.clarification_question ??
        'What should the Linear issue title be?',
    }
  }

  return {
    ok: true as const,
    argumentsPayload: {
      team_id: teamId,
      title,
      ...(params.plan.description?.trim()
        ? { description: params.plan.description.trim() }
        : {}),
      ...(projectId ? { project_id: projectId } : {}),
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
    } satisfies Record<string, unknown>,
  }
}

function buildLinearIssueCreatedMessage(
  payload: ToolExecutionPayload,
  fallbackTitle: string
) {
  const data = asRecord(payload.data)
  const identifier =
    data && typeof data.identifier === 'string' ? data.identifier : null
  const title =
    data && typeof data.title === 'string' ? data.title : fallbackTitle
  const url = data && typeof data.url === 'string' ? data.url : null
  const id = data && typeof data.id === 'string' ? data.id : null

  return [
    identifier
      ? `Created the Linear issue ${identifier}: ${title}.`
      : `Created the Linear issue "${title}".`,
    url ? `Open it here: ${url}` : id ? `Issue ID: ${id}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

function selectAutomaticToolExecutionPlans(
  userMessage: string,
  runtime: Pick<
    ScopedToolRuntime,
    'allowedTools' | 'allowedDecisions' | 'composioSessionId' | 'sessionRunId'
  >
) {
  if (!runtime.composioSessionId || !runtime.sessionRunId) {
    return []
  }

  const selectionLimit = getAutomaticExecutionPlanLimit(userMessage)

  const plans = runtime.allowedTools
    .map((tool) => {
      const decision = runtime.allowedDecisions.get(tool.slug)
      if (!decision || decision.category !== 'read') {
        return null
      }

      const argumentsPayload = buildAutomaticToolArguments(tool, userMessage)
      if (!argumentsPayload) {
        return null
      }

      return {
        argumentsPayload,
        decision,
        family: inferToolFamily(tool),
        score: getAutomaticToolScore(tool, userMessage),
        tool,
      } satisfies AutomaticToolExecutionPlan
    })
    .filter(
      (plan): plan is AutomaticToolExecutionPlan =>
        plan !== null && plan.score > -20
    )
    .sort((left, right) => right.score - left.score)

  const selected: AutomaticToolExecutionPlan[] = []
  const usedFamilies = new Set<string>()

  for (const plan of plans) {
    if (usedFamilies.has(plan.family)) continue

    selected.push(plan)
    usedFamilies.add(plan.family)

    if (selected.length >= selectionLimit) {
      break
    }
  }

  if (selected.length === 0 && plans.length > 0) {
    selected.push(plans[0]!)
  }

  return selected
}

function matchesPolicyPattern(
  patterns: string[],
  toolkitSlug: string,
  toolSlug: string,
  category: ToolActionCategory
) {
  if (patterns.length === 0) return true

  const candidates = [
    toolSlug.toLowerCase(),
    `${toolkitSlug}:${toolSlug}`.toLowerCase(),
    `${toolkitSlug}:${category}`.toLowerCase(),
    `${toolkitSlug}:*`.toLowerCase(),
  ]

  return patterns.some((pattern) => {
    const regex = new RegExp(
      `^${escapeRegex(pattern.toLowerCase()).replace(/\\\*/g, '.*')}$`
    )
    return candidates.some((candidate) => regex.test(candidate))
  })
}

function normalizeSessionTool(
  raw: Record<string, unknown>
): SessionTool | null {
  const toolkit =
    raw.toolkit && typeof raw.toolkit === 'object'
      ? (raw.toolkit as Record<string, unknown>)
      : {}

  const slug = typeof raw.slug === 'string' ? raw.slug : null
  const name = typeof raw.name === 'string' ? raw.name : null
  const description =
    typeof raw.human_description === 'string'
      ? raw.human_description
      : typeof raw.description === 'string'
        ? raw.description
        : null

  if (!slug || !name || !description) {
    return null
  }

  return {
    slug,
    name,
    description,
    inputParameters:
      raw.input_parameters && typeof raw.input_parameters === 'object'
        ? (raw.input_parameters as Record<string, unknown>)
        : { type: 'object', properties: {} },
    outputParameters:
      raw.output_parameters && typeof raw.output_parameters === 'object'
        ? (raw.output_parameters as Record<string, unknown>)
        : {},
    scopes: Array.isArray(raw.scopes)
      ? raw.scopes.filter((item): item is string => typeof item === 'string')
      : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((item): item is string => typeof item === 'string')
      : [],
    searchRank: 0,
    toolkit: {
      slug: typeof toolkit.slug === 'string' ? toolkit.slug : 'unknown',
      name: typeof toolkit.name === 'string' ? toolkit.name : 'Unknown toolkit',
      logo: typeof toolkit.logo === 'string' ? toolkit.logo : null,
    },
  }
}

function normalizeToolParameters(schema: Record<string, unknown>) {
  if (schema.type === 'object') {
    return schema
  }

  return {
    type: 'object',
    properties: schema.properties ?? {},
    required: schema.required ?? [],
    additionalProperties:
      typeof schema.additionalProperties === 'boolean'
        ? schema.additionalProperties
        : true,
  }
}

function getToolCategory(tool: SessionTool): ToolActionCategory {
  const tagSet = new Set(tool.tags.map((tag) => tag.toLowerCase()))
  const toolSignature = [tool.slug, tool.name].join(' ').toUpperCase()
  const description = tool.description.toUpperCase()

  // Shared name-based classification first. Returns admin/draft/read/write
  // based on the signature; Kodi-only refinements (description-driven
  // admin escalation, tag hints) are layered after to preserve the
  // pre-KOD-394 behavior byte-for-byte.
  const nameClass = classifyToolCall(toolSignature)
  if (nameClass === 'admin') return 'admin'

  if (
    description.includes('ADMIN') &&
    (description.includes('PERMISSION') ||
      description.includes('ROLE') ||
      description.includes('WEBHOOK') ||
      description.includes('TOKEN') ||
      description.includes('SECRET') ||
      description.includes('AUTH CONFIG'))
  ) {
    return 'admin'
  }

  if (nameClass === 'draft') return 'draft'

  if (tagSet.has('readonlyhint')) return 'read'
  if (nameClass === 'read') return 'read'

  if (tagSet.has('destructivehint') || nameClass === 'write') return 'write'

  return 'read'
}

function resolveChatAccessAllowed(
  policy: EffectiveToolkitPolicy,
  category: ToolActionCategory,
  sourceType: ToolRuntimeSourceType
): { status: ToolPermissionStatus; reason: string } {
  if (!policy.enabled) {
    return {
      status: 'denied',
      reason: 'Workspace policy disabled this toolkit.',
    }
  }

  if (category === 'read') {
    const readsEnabled =
      sourceType === 'meeting'
        ? policy.meetingReadsEnabled
        : policy.chatReadsEnabled

    return readsEnabled
      ? { status: 'allowed', reason: 'Reads are enabled by workspace policy.' }
      : {
          status: 'denied',
          reason:
            sourceType === 'meeting'
              ? 'Meeting reads are disabled by workspace policy.'
              : 'Chat reads are disabled by workspace policy.',
        }
  }

  if (category === 'draft') {
    return policy.draftsEnabled
      ? { status: 'allowed', reason: 'Draft actions are enabled.' }
      : {
          status: 'denied',
          reason: 'Draft actions are disabled by workspace policy.',
        }
  }

  if (category === 'admin') {
    if (!policy.adminActionsEnabled) {
      return {
        status: 'denied',
        reason: 'Administrative actions are disabled by workspace policy.',
      }
    }

    return policy.writesRequireApproval
      ? {
          status: 'approval_required',
          reason: 'Administrative actions require approval before execution.',
        }
      : {
          status: 'allowed',
          reason: 'Administrative actions are enabled without approval.',
        }
  }

  return policy.writesRequireApproval
    ? {
        status: 'approval_required',
        reason: 'Write actions require approval before execution.',
      }
    : {
        status: 'allowed',
        reason: 'Write actions are enabled without approval.',
      }
}

function buildRuntimeSystemPrompt(
  runtime: ScopedToolRuntime,
  options?: { mustUseTools?: boolean }
) {
  const lines = [
    'Tool access for this response is temporary and request-scoped. Only use tools that are exposed in this request.',
  ]

  if (runtime.assistivePrompt) {
    lines.push(runtime.assistivePrompt.trim())
  }

  if (runtime.enabledToolkits.length > 0) {
    lines.push(
      `Connected toolkits in scope for this request: ${runtime.enabledToolkits.join(', ')}.`
    )
  }

  if (runtime.allowedTools.length > 0) {
    lines.push(
      `Executable tools surfaced for this request: ${runtime.allowedTools
        .map((tool) => tool.slug)
        .slice(0, MAX_RELEVANT_TOOLS)
        .join(', ')}.`
    )
    lines.push(
      'When the user asks for live external data from one of these systems, return a tool call directly. Kodi executes tool calls for you; do not claim you need another channel, manual lookup, or a different environment while an executable tool is available.'
    )
    lines.push(
      'Do not inspect gateway config, plugin lists, or OpenClaw setup details to infer tool availability. Kodi is the source of truth for which request-scoped tools are available right now.'
    )
  }

  if (runtime.approvalTools.length > 0) {
    lines.push(
      `Approval-preview tools available for this request: ${runtime.approvalTools
        .map((tool) => tool.slug)
        .slice(0, MAX_RELEVANT_TOOLS)
        .join(', ')}.`
    )
    lines.push(
      'If the user asks you to create, update, send, delete, or otherwise change data in one of these systems, return the relevant tool call. Kodi will turn that into a human approval request instead of executing the write immediately.'
    )
  }

  const approvalRequired = runtime.gatedDecisions.filter(
    (decision) => decision.status === 'approval_required'
  )
  if (approvalRequired.length > 0) {
    lines.push(
      `Matching actions that require approval and are not executable right now: ${approvalRequired
        .map((decision) => decision.toolSlug)
        .slice(0, MAX_RELEVANT_TOOLS)
        .join(', ')}.`
    )
  }

  const denied = runtime.gatedDecisions.filter(
    (decision) => decision.status === 'denied'
  )
  if (denied.length > 0) {
    lines.push(
      `Matching actions blocked by workspace policy or connection state: ${denied
        .map((decision) => `${decision.toolSlug} (${decision.reason})`)
        .slice(0, 6)
        .join('; ')}.`
    )
  }

  lines.push(
    'If the user asks for a gated action, explain the constraint clearly and offer a draft or guidance instead of claiming the action was completed.'
  )

  if (options?.mustUseTools) {
    lines.push(
      'This request requires live integration handling. You must use at least one relevant executable or approval-preview tool before answering unless every relevant tool call fails.'
    )
  }

  return lines.join('\n')
}

function looksLikeInvalidIntegrationNarration(content: string) {
  const normalized = content.toLowerCase()

  return [
    /(?:do not|don't|can not|can't|cannot|unable to).{0,40}(?:access|use|query|call|execute)/,
    /(?:no direct access|not currently attached|not attached|not configured|not available in this session)/,
    /(?:gateway config|plugin list|plugin configuration|openclaw setup|current environment|different mechanism|different channel)/,
    /(?:would need|need to).{0,50}(?:set up|configure|enable|connect|install)/,
  ].some((pattern) => pattern.test(normalized))
}

function summarizeToolResult(
  toolkitSlug: string,
  toolSlug: string,
  data: Record<string, unknown> | null
) {
  if (!data) return null

  if (toolkitSlug === 'gmail') {
    if (
      toolSlug === 'GMAIL_FETCH_EMAILS' ||
      toolSlug === 'GMAIL_LIST_MESSAGES'
    ) {
      const messages = Array.isArray((data as Record<string, unknown>).messages)
        ? ((data as Record<string, unknown>).messages as unknown[])
        : Array.isArray((data as Record<string, unknown>).emails)
          ? ((data as Record<string, unknown>).emails as unknown[])
          : []

      if (messages.length > 0) {
        return `Returned ${messages.length} Gmail messages. Prefer the most recent message metadata and snippet over full MIME payloads.`
      }
    }

    if (toolSlug === 'GMAIL_LIST_THREADS') {
      const threads = Array.isArray((data as Record<string, unknown>).threads)
        ? ((data as Record<string, unknown>).threads as unknown[])
        : []

      if (threads.length > 0) {
        return `Returned ${threads.length} Gmail threads. Prefer the newest thread summary and snippet.`
      }
    }
  }

  const topLevelKeys = Object.keys(data)
  if (topLevelKeys.length === 0) return null

  return `Tool result keys: ${topLevelKeys.slice(0, 8).join(', ')}${topLevelKeys.length > 8 ? ', ...' : ''}.`
}

function compactToolValue(
  value: unknown,
  depth = 0
): { value: unknown; truncated: boolean } {
  if (value == null) {
    return { value, truncated: false }
  }

  if (typeof value === 'string') {
    if (value.length <= MAX_TOOL_STRING_CHARS) {
      return { value, truncated: false }
    }

    return {
      value: `${value.slice(0, MAX_TOOL_STRING_CHARS)}…`,
      truncated: true,
    }
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return { value, truncated: false }
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_TOOL_ARRAY_ITEMS)
    let truncated = value.length > sliced.length
    const compacted = sliced.map((item) => {
      const result = compactToolValue(item, depth + 1)
      truncated ||= result.truncated
      return result.value
    })

    return {
      value:
        value.length > sliced.length
          ? [...compacted, { _truncatedItems: value.length - sliced.length }]
          : compacted,
      truncated,
    }
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const entries = Object.entries(record)

    if (depth >= 4) {
      return {
        value: {
          _summary: `Object with ${entries.length} keys omitted at depth limit.`,
        },
        truncated: entries.length > 0,
      }
    }

    const selectedEntries = entries.slice(0, MAX_TOOL_OBJECT_KEYS)
    let truncated = entries.length > selectedEntries.length
    const compacted = Object.fromEntries(
      selectedEntries.map(([key, item]) => {
        const result = compactToolValue(item, depth + 1)
        truncated ||= result.truncated
        return [key, result.value]
      })
    )

    if (entries.length > selectedEntries.length) {
      compacted._truncatedKeys = entries.length - selectedEntries.length
    }

    return { value: compacted, truncated }
  }

  return { value: String(value), truncated: true }
}

function buildModelSafeToolPayload(params: {
  toolkitSlug: string
  toolSlug: string
  payload: ToolExecutionPayload
}): ModelSafeToolExecutionPayload {
  const compacted = compactToolValue(params.payload.data)
  const summary = summarizeToolResult(
    params.toolkitSlug,
    params.toolSlug,
    params.payload.data
  )

  let modelPayload: ModelSafeToolExecutionPayload = {
    success: params.payload.success,
    error: params.payload.error,
    data: compacted.value,
    logId: params.payload.logId,
    truncated: compacted.truncated,
    ...(summary ? { summary } : {}),
  }

  let content = JSON.stringify(modelPayload)
  if (content.length > MAX_TOOL_MESSAGE_CHARS) {
    const compactedAgain = compactToolValue(modelPayload.data, 2)
    modelPayload = {
      ...modelPayload,
      data: compactedAgain.value,
      truncated: true,
      summary:
        modelPayload.summary ??
        'Tool result was truncated before being returned to the model.',
    }
    content = JSON.stringify(modelPayload)
  }

  if (content.length > MAX_TOOL_MESSAGE_CHARS) {
    modelPayload = {
      success: params.payload.success,
      error: params.payload.error,
      data: null,
      logId: params.payload.logId,
      truncated: true,
      summary:
        modelPayload.summary ??
        'Tool result was too large to include fully in model context.',
    }
  }

  return modelPayload
}

function toOpenAITool(tool: SessionTool): OpenAIToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.slug,
      description: tool.description,
      parameters: normalizeToolParameters(tool.inputParameters),
    },
  }
}

function toLegacyToolProvider(toolkitSlug: string): LegacyToolProvider | null {
  switch (toolkitSlug) {
    case 'linear':
    case 'github':
    case 'slack':
    case 'jira':
    case 'notion':
    case 'zoom':
      return toolkitSlug
    default:
      return null
  }
}

function getActionTargetText(argumentsPayload: Record<string, unknown>) {
  const candidates = [
    argumentsPayload.title,
    argumentsPayload.subject,
    argumentsPayload.name,
    argumentsPayload.identifier,
    argumentsPayload.id,
    argumentsPayload.issue_id,
    argumentsPayload.issueId,
    argumentsPayload.project_id,
    argumentsPayload.projectId,
    argumentsPayload.channel,
    argumentsPayload.channel_id,
    argumentsPayload.repo,
    argumentsPayload.repository,
    argumentsPayload.path,
    argumentsPayload.url,
  ]

  const match = candidates.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  )

  return match?.trim() ?? null
}

function appendToolTransition(
  existing: Array<Record<string, unknown>> | null | undefined,
  entry: {
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    note?: string | null
    error?: string | null
  }
) {
  return [
    ...(existing ?? []),
    {
      status: entry.status,
      at: new Date().toISOString(),
      ...(entry.note ? { note: entry.note } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    },
  ]
}

function isTransientToolExecutionError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('network') ||
    normalized.includes('socket') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504')
  )
}

function isConnectionFailureMessage(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('expired') ||
    normalized.includes('revoked') ||
    normalized.includes('reconnect') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('invalid grant') ||
    normalized.includes('not connected')
  )
}

function parseToolCallArguments(toolCall: OpenAIToolCall) {
  try {
    const parsed = JSON.parse(toolCall.function.arguments)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true as const, value: parsed as Record<string, unknown> }
    }

    return {
      ok: false as const,
      error: 'Tool arguments must be a JSON object.',
    }
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Tool arguments were not valid JSON.',
    }
  }
}

async function searchScopedSessionTools(
  session: { sessionId: string },
  params: { query: string; toolkits: string[] }
) {
  const rawSession = session as unknown as RawSearchSession
  const raw = await rawSession.client.toolRouter.session.search(
    rawSession.sessionId,
    {
      queries: [{ use_case: params.query }],
      ...(params.toolkits.length > 0 ? { toolkits: params.toolkits } : {}),
    }
  )

  const toolSchemasSource =
    raw.tool_schemas && typeof raw.tool_schemas === 'object'
      ? (raw.tool_schemas as Record<string, unknown>)
      : {}

  const toolSchemas = Object.entries(toolSchemasSource).reduce<
    Record<string, RawSearchToolSchema>
  >((items, [slug, value]) => {
    if (!value || typeof value !== 'object') {
      return items
    }

    items[slug] = value as RawSearchToolSchema
    return items
  }, {})

  return {
    error: typeof raw.error === 'string' ? raw.error : null,
    results: Array.isArray(raw.results)
      ? raw.results.filter(
          (value): value is RawSearchResult =>
            Boolean(value) && typeof value === 'object'
        )
      : [],
    toolSchemas,
  } satisfies SearchResponse
}

async function requestOpenClawChatCompletion(params: {
  instanceUrl: string
  headers: Record<string, string>
  model?: string
  messages: OpenAIMessage[]
  tools?: OpenAIToolDefinition[]
  toolChoice?: OpenAIToolChoice
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENCLAW_REQUEST_TIMEOUT_MS
  )

  try {
    const body: Record<string, unknown> = {
      model: params.model ?? 'openclaw/default',
      messages: params.messages,
    }

    if ((params.tools?.length ?? 0) > 0) {
      body.tools = params.tools
      body.tool_choice = params.toolChoice ?? 'auto'
    }

    const response = await fetch(`${params.instanceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: params.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      throw new Error(
        `Instance responded with HTTP ${response.status}: ${bodyText}`
      )
    }

    const data = (await response.json()) as ChatCompletionResponse
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

function getAssistantContent(response: ChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('Empty response from instance')
  }

  return content
}

async function loadRuntimeState(params: {
  db: AnyDb
  orgId: string
  userId: string
}) {
  const setup = getToolAccessSetupStatus()
  let syncError: string | null = null

  if (setup.apiConfigured) {
    try {
      await syncUserConnectionsForOrg(params.db, params.orgId, params.userId)
    } catch (error) {
      syncError =
        error instanceof Error
          ? error.message
          : 'Failed to sync Composio accounts.'
    }
  }

  const [connections, policies, preferences] = await Promise.all([
    listPersistedConnections(params.db, params.orgId, params.userId),
    listToolkitPolicies(params.db, params.orgId),
    listToolkitAccountPreferences(params.db, params.orgId, params.userId),
  ])

  return {
    setup,
    syncError,
    connections,
    policies,
    preferences,
  }
}

function buildActiveToolkitState(params: {
  connections: RuntimeConnection[]
  policies: RuntimePolicy[]
  preferences: RuntimePreference[]
}) {
  const connectionsByToolkit = new Map<string, RuntimeConnection[]>()
  const policiesByToolkit = new Map<string, RuntimePolicy>(
    params.policies.map((policy) => [policy.toolkitSlug, policy])
  )
  const preferencesByToolkit = new Map<string, RuntimePreference>(
    params.preferences.map((preference) => [preference.toolkitSlug, preference])
  )

  for (const connection of params.connections) {
    const existing = connectionsByToolkit.get(connection.toolkitSlug) ?? []
    existing.push(connection)
    connectionsByToolkit.set(connection.toolkitSlug, existing)
  }

  const enabledToolkits: string[] = []
  const connectedAccountOverrides: Record<string, string> = {}
  const authConfigOverrides: Record<string, string> = {}
  const primaryConnections = new Map<string, RuntimeConnection>()
  const policies = new Map<string, EffectiveToolkitPolicy>()

  for (const [toolkitSlug, toolkitConnectionsForSlug] of connectionsByToolkit) {
    const activeConnections = toolkitConnectionsForSlug.filter(
      (connection) =>
        connection.connectedAccountStatus === ACTIVE_CONNECTION_STATUS
    )
    if (activeConnections.length === 0) continue

    const preference = preferencesByToolkit.get(toolkitSlug) ?? null
    const primary = choosePrimaryConnection(
      activeConnections,
      preference?.preferredConnectedAccountId ?? null
    )
    if (!primary) continue

    const effectivePolicy = getEffectiveToolkitPolicy(
      policiesByToolkit.get(toolkitSlug) ?? null,
      toolkitSlug
    )

    if (!effectivePolicy.enabled) continue

    enabledToolkits.push(toolkitSlug)
    connectedAccountOverrides[toolkitSlug] = primary.connectedAccountId

    if (primary.authConfigId) {
      authConfigOverrides[toolkitSlug] = primary.authConfigId
    }

    primaryConnections.set(toolkitSlug, primary)
    policies.set(toolkitSlug, effectivePolicy)
  }

  return {
    enabledToolkits,
    connectedAccountOverrides,
    authConfigOverrides,
    primaryConnections,
    policies,
  }
}

function resolveChatManageConnectionsCallbackUrl() {
  if (!env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT) {
    return undefined
  }

  if (env.COMPOSIO_OAUTH_REDIRECT_URL) {
    const url = new URL(env.COMPOSIO_OAUTH_REDIRECT_URL)
    url.searchParams.set('returnPath', '/chat')
    return url.toString()
  }

  const baseUrl = env.APP_URL ?? env.BETTER_AUTH_URL
  if (!baseUrl) {
    return undefined
  }

  return new URL('/chat', baseUrl).toString()
}

async function createScopedToolRuntime(params: {
  db: AnyDb
  orgId: string
  userId: string
  sourceType: ToolRuntimeSourceType
  sourceId?: string | null
  userMessage: string
}) {
  if (!env.KODI_FEATURE_TOOL_ACCESS) {
    return null
  }

  const runtimeState = await loadRuntimeState({
    db: params.db,
    orgId: params.orgId,
    userId: params.userId,
  })

  if (!runtimeState.setup.apiConfigured) {
    return null
  }

  const activeToolkitState = buildActiveToolkitState(runtimeState)
  if (activeToolkitState.enabledToolkits.length === 0) {
    return null
  }

  const composio = getComposioClient()
  const session = await composio.create(params.userId, {
    toolkits: {
      enable: activeToolkitState.enabledToolkits,
    },
    connectedAccounts: activeToolkitState.connectedAccountOverrides,
    authConfigs:
      Object.keys(activeToolkitState.authConfigOverrides).length > 0
        ? activeToolkitState.authConfigOverrides
        : undefined,
    manageConnections: {
      enable: env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
      waitForConnections: false,
      callbackUrl: resolveChatManageConnectionsCallbackUrl(),
    },
    workbench: {
      enable: false,
      enableProxyExecution: false,
    },
    experimental: {
      assistivePrompt: {
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  })

  const [sessionRun] = await params.db
    .insert(toolSessionRuns)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      composioSessionId: session.sessionId,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      enabledToolkits: activeToolkitState.enabledToolkits,
      connectedAccountOverrides: activeToolkitState.connectedAccountOverrides,
      manageConnectionsInChat: env.COMPOSIO_MANAGE_CONNECTIONS_IN_CHAT,
      workbenchEnabled: false,
      metadata: {
        syncError: runtimeState.syncError,
        mcpUrl: session.mcp?.url ?? null,
      },
    })
    .returning()

  if (!sessionRun) {
    throw new Error('Failed to persist the scoped tool session run.')
  }

  let relevantToolSlugs: string[] = []
  let searchError: string | null = null
  let relevantTools: SessionTool[] = []

  try {
    const searchResponse = await searchScopedSessionTools(session, {
      query: params.userMessage,
      toolkits: activeToolkitState.enabledToolkits,
    })

    const primaryResult = searchResponse.results?.[0]
    relevantToolSlugs = uniqueStrings([
      ...toStringArray(primaryResult?.primary_tool_slugs),
      ...toStringArray(primaryResult?.related_tool_slugs),
    ]).slice(0, MAX_RELEVANT_TOOLS)

    searchError =
      (typeof primaryResult?.error === 'string' ? primaryResult.error : null) ??
      searchResponse.error ??
      null

    relevantTools = relevantToolSlugs.reduce<SessionTool[]>(
      (items, slug, index) => {
        const schema = searchResponse.toolSchemas?.[slug]
        if (!schema) return items

        const toolkitSlug = normalizeToolkitSlug(schema.toolkit)
        const connection =
          activeToolkitState.primaryConnections.get(toolkitSlug) ?? null

        items.push({
          slug: typeof schema.tool_slug === 'string' ? schema.tool_slug : slug,
          name: typeof schema.tool_slug === 'string' ? schema.tool_slug : slug,
          description:
            typeof schema.description === 'string'
              ? schema.description
              : typeof schema.tool_slug === 'string'
                ? schema.tool_slug
                : slug,
          inputParameters:
            schema.input_schema &&
            typeof schema.input_schema === 'object' &&
            !Array.isArray(schema.input_schema)
              ? (schema.input_schema as Record<string, unknown>)
              : {
                  type: 'object',
                  properties: {},
                },
          outputParameters:
            schema.output_schema &&
            typeof schema.output_schema === 'object' &&
            !Array.isArray(schema.output_schema)
              ? (schema.output_schema as Record<string, unknown>)
              : {},
          scopes: toStringArray(schema.scopes),
          tags: toStringArray(schema.tags),
          searchRank: index,
          toolkit: {
            slug: toolkitSlug,
            name:
              connection?.toolkitName &&
              connection.toolkitName.trim().length > 0
                ? connection.toolkitName
                : toolkitSlug,
            logo: null,
          },
        } satisfies SessionTool)

        return items
      },
      []
    )
  } catch (error) {
    searchError =
      error instanceof Error
        ? error.message
        : 'Failed to search Composio tools.'
  }

  const decisions = relevantTools.map((tool) => {
    const policy =
      activeToolkitState.policies.get(tool.toolkit.slug) ??
      getEffectiveToolkitPolicy(null, tool.toolkit.slug)
    const primaryConnection =
      activeToolkitState.primaryConnections.get(tool.toolkit.slug) ?? null
    const category = getToolCategory(tool)

    if (!primaryConnection) {
      return {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit.slug,
        toolkitName: tool.toolkit.name,
        category,
        status: 'denied',
        reason: 'No active connected account is available for this toolkit.',
        policy,
        connectedAccountId: null,
        connectionId: null,
      } satisfies ToolPermissionDecision
    }

    if (
      !matchesPolicyPattern(
        policy.allowedActionPatterns ?? [],
        tool.toolkit.slug,
        tool.slug,
        category
      )
    ) {
      return {
        toolSlug: tool.slug,
        toolkitSlug: tool.toolkit.slug,
        toolkitName: tool.toolkit.name,
        category,
        status: 'denied',
        reason: 'This action is not allowlisted by workspace policy.',
        policy,
        connectedAccountId: primaryConnection.connectedAccountId,
        connectionId: primaryConnection.id,
      } satisfies ToolPermissionDecision
    }

    const access = resolveChatAccessAllowed(policy, category, params.sourceType)

    return {
      toolSlug: tool.slug,
      toolkitSlug: tool.toolkit.slug,
      toolkitName: tool.toolkit.name,
      category,
      status: access.status,
      reason: access.reason,
      policy,
      connectedAccountId: primaryConnection.connectedAccountId,
      connectionId: primaryConnection.id,
    } satisfies ToolPermissionDecision
  })

  const allowedDecisions = new Map<string, ToolPermissionDecision>()
  const approvalDecisions = new Map<string, ToolPermissionDecision>()
  const gatedDecisions: ToolPermissionDecision[] = []

  for (const decision of decisions) {
    if (decision.status === 'allowed') {
      allowedDecisions.set(decision.toolSlug, decision)
    } else if (decision.status === 'approval_required') {
      approvalDecisions.set(decision.toolSlug, decision)
      gatedDecisions.push(decision)
    } else {
      gatedDecisions.push(decision)
    }
  }

  const allowedTools = relevantTools.filter((tool) =>
    allowedDecisions.has(tool.slug)
  )
  const approvalTools = relevantTools.filter((tool) =>
    approvalDecisions.has(tool.slug)
  )

  const metadata: Record<string, unknown> = {
    syncError: runtimeState.syncError,
    searchError,
    relevantToolSlugs,
    allowedToolSlugs: allowedTools.map((tool) => tool.slug),
    approvalToolSlugs: approvalTools.map((tool) => tool.slug),
    gatedTools: gatedDecisions.map((decision) => ({
      toolSlug: decision.toolSlug,
      status: decision.status,
      reason: decision.reason,
    })),
    matchingToolCount: relevantTools.length,
    mcpUrl: session.mcp?.url ?? null,
  }

  await params.db
    .update(toolSessionRuns)
    .set({ metadata })
    .where(eq(toolSessionRuns.id as never, sessionRun.id as never) as never)

  return {
    sessionRunId: sessionRun.id,
    composioSessionId: session.sessionId,
    sourceType: params.sourceType,
    sourceId: params.sourceId ?? null,
    enabledToolkits: activeToolkitState.enabledToolkits,
    allowedTools,
    approvalTools,
    openAITools: [...allowedTools, ...approvalTools].map((tool) =>
      toOpenAITool(tool)
    ),
    allowedDecisions,
    approvalDecisions,
    gatedDecisions,
    assistivePrompt: session.experimental?.assistivePrompt ?? null,
    metadata,
  } satisfies ScopedToolRuntime
}

async function runPlainChatCompletion(params: {
  instanceUrl: string
  headers: Record<string, string>
  model?: string
  messages: OpenAIMessage[]
}) {
  const response = await requestOpenClawChatCompletion({
    instanceUrl: params.instanceUrl,
    headers: params.headers,
    model: params.model,
    messages: params.messages,
  })

  return {
    content: getAssistantContent(response),
    toolRuntime: null,
  }
}

async function executeAutomaticToolPlans(params: {
  actorUserId: string
  composioSessionId: string
  db: AnyDb
  orgId: string
  plans: AutomaticToolExecutionPlan[]
  sourceId: string | null
  sourceType: ToolRuntimeSourceType
  sessionRunId: string
}): Promise<AutomaticToolExecutionResult> {
  const assistantToolCalls = params.plans.map((plan, index) => ({
    id: `auto-${Date.now()}-${index}-${plan.tool.slug.toLowerCase()}`,
    type: 'function' as const,
    function: {
      name: plan.tool.slug,
      arguments: JSON.stringify(plan.argumentsPayload),
    },
  }))

  const toolMessages: OpenAIMessage[] = []
  const usedToolSlugs: string[] = []

  for (const [index, plan] of params.plans.entries()) {
    const result = await executeAllowedToolCall({
      db: params.db,
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      sessionRunId: params.sessionRunId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      composioSessionId: params.composioSessionId,
      toolCall: assistantToolCalls[index]!,
      decision: plan.decision,
    })

    toolMessages.push(result.toolMessage)
    usedToolSlugs.push(result.toolSlug)
  }

  return {
    assistantToolCalls,
    summaryMessage: {
      role: 'system',
      content: `Kodi auto-executed ${usedToolSlugs.join(', ')} because this request required live tool data. Treat the tool results above as the source of truth and answer directly from them.`,
    },
    toolMessages,
    usedToolSlugs,
  }
}

async function recordToolActionRunStart(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sessionRunId: string
  sourceType: ToolRuntimeSourceType
  sourceId: string | null
  decision: ToolPermissionDecision
  toolCallId: string
  argumentsPayload: Record<string, unknown> | null
}) {
  const [created] = await params.db
    .insert(toolActionRuns)
    .values({
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      toolSessionRunId: params.sessionRunId,
      tool: toLegacyToolProvider(params.decision.toolkitSlug),
      toolkitSlug: params.decision.toolkitSlug,
      connectedAccountId: params.decision.connectedAccountId,
      action: params.decision.toolSlug,
      actionCategory: params.decision.category,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      targetText: params.argumentsPayload
        ? getActionTargetText(params.argumentsPayload)
        : null,
      idempotencyKey: `${params.sessionRunId}:${params.toolCallId}`,
      attemptCount: 1,
      status: 'running',
      requestPayload: {
        toolCallId: params.toolCallId,
        arguments: params.argumentsPayload,
      },
      transitionHistory: appendToolTransition(null, {
        status: 'running',
        note: 'execution_started',
      }),
      startedAt: new Date(),
    })
    .returning()

  return created!
}

async function finishToolActionRun(params: {
  db: AnyDb
  existingTransitionHistory?: Array<Record<string, unknown>> | null
  toolActionRunId: string
  status: 'succeeded' | 'failed'
  externalLogId?: string | null
  responsePayload?: Record<string, unknown> | null
  error?: string | null
}) {
  await params.db
    .update(toolActionRuns)
    .set({
      status: params.status,
      responsePayload: params.responsePayload ?? null,
      externalLogId: params.externalLogId ?? null,
      error: params.error ?? null,
      transitionHistory: appendToolTransition(
        params.existingTransitionHistory,
        {
          status: params.status,
          error: params.error ?? null,
        }
      ),
      completedAt: new Date(),
    })
    .where(
      eq(toolActionRuns.id as never, params.toolActionRunId as never) as never
    )
}

async function executeAllowedToolCall(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sessionRunId: string
  sourceType: ToolRuntimeSourceType
  sourceId: string | null
  visibility?: OpenClawConversationVisibility
  composioSessionId: string
  toolCall: OpenAIToolCall
  decision: ToolPermissionDecision
}) {
  const parsedArguments = parseToolCallArguments(params.toolCall)

  if (!parsedArguments.ok) {
    const toolPayload = {
      success: false,
      error: parsedArguments.error,
      data: null,
      logId: null,
    } satisfies ToolExecutionPayload
    const modelToolPayload = buildModelSafeToolPayload({
      toolkitSlug: params.decision.toolkitSlug,
      toolSlug: params.decision.toolSlug,
      payload: toolPayload,
    })

    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify(modelToolPayload),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
      toolPayload,
    }
  }

  const run = await recordToolActionRunStart({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    sessionRunId: params.sessionRunId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    decision: params.decision,
    toolCallId: params.toolCall.id,
    argumentsPayload: parsedArguments.value,
  })

  try {
    const composio = getComposioClient()
    const session = await composio.toolRouter.use(params.composioSessionId)
    let response: {
      data?: Record<string, unknown>
      error?: string | null
      logId?: string
    } | null = null
    let lastError: string | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = (await session.execute(
          params.decision.toolSlug,
          parsedArguments.value
        )) as {
          data?: Record<string, unknown>
          error?: string | null
          logId?: string
        }

        if (
          response.error &&
          attempt === 0 &&
          params.decision.category !== 'write' &&
          params.decision.category !== 'admin' &&
          isTransientToolExecutionError(response.error)
        ) {
          lastError = response.error
          continue
        }

        break
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Tool execution failed.'
        lastError = message

        if (
          attempt === 0 &&
          params.decision.category !== 'write' &&
          params.decision.category !== 'admin' &&
          isTransientToolExecutionError(message)
        ) {
          continue
        }

        throw error
      }
    }

    if (!response && lastError) {
      throw new Error(lastError)
    }

    const toolPayload = {
      success: !response?.error,
      error: response?.error ?? null,
      data: response?.data ?? null,
      logId: response?.logId ?? null,
    } satisfies ToolExecutionPayload
    const modelToolPayload = buildModelSafeToolPayload({
      toolkitSlug: params.decision.toolkitSlug,
      toolSlug: params.decision.toolSlug,
      payload: toolPayload,
    })

    await finishToolActionRun({
      db: params.db,
      existingTransitionHistory: run.transitionHistory,
      toolActionRunId: run.id,
      status: response?.error ? 'failed' : 'succeeded',
      externalLogId: response?.logId ?? null,
      responsePayload: toolPayload,
      error: response?.error ?? null,
    })

    if (!response?.error && params.decision.toolkitSlug === 'slack') {
      const slackInput = resolveSlackMemoryEventInput({
        orgId: params.orgId,
        actorUserId: params.actorUserId,
        visibility: params.visibility ?? 'shared',
        action: params.decision.toolSlug,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        argumentsPayload: parsedArguments.value,
        responsePayload: response?.data ?? null,
      })

      if (slackInput) {
        try {
          await emitSlackMemoryUpdateEvent(slackInput)
        } catch (error) {
          console.warn('[tool-access] slack memory event dispatch failed', {
            orgId: params.orgId,
            toolSlug: params.decision.toolSlug,
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    if (
      toolPayload.error &&
      isConnectionFailureMessage(toolPayload.error) &&
      run.toolConnectionId
    ) {
      await markPersistedConnectionAttention(params.db, run.toolConnectionId, {
        status: 'FAILED',
        errorMessage: toolPayload.error,
      })
    }

    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify(modelToolPayload),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
      toolPayload,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Tool execution failed.'

    const toolPayload = {
      success: false,
      error: message,
      data: null,
      logId: null,
    } satisfies ToolExecutionPayload
    const modelToolPayload = buildModelSafeToolPayload({
      toolkitSlug: params.decision.toolkitSlug,
      toolSlug: params.decision.toolSlug,
      payload: toolPayload,
    })

    await finishToolActionRun({
      db: params.db,
      existingTransitionHistory: run.transitionHistory,
      toolActionRunId: run.id,
      status: 'failed',
      responsePayload: toolPayload,
      error: message,
    })

    if (isConnectionFailureMessage(message) && run.toolConnectionId) {
      await markPersistedConnectionAttention(params.db, run.toolConnectionId, {
        status: 'FAILED',
        errorMessage: message,
      })
    }

    return {
      toolMessage: {
        role: 'tool',
        tool_call_id: params.toolCall.id,
        content: JSON.stringify(modelToolPayload),
      } satisfies OpenAIMessage,
      toolSlug: params.decision.toolSlug,
      toolPayload,
    }
  }
}

async function executeScopedToolBySlug(params: {
  actorUserId: string
  argumentsPayload: Record<string, unknown>
  db: AnyDb
  orgId: string
  runtime: Pick<
    ScopedToolRuntime,
    | 'allowedDecisions'
    | 'approvalDecisions'
    | 'composioSessionId'
    | 'sessionRunId'
    | 'sourceId'
    | 'sourceType'
  >
  visibility?: OpenClawConversationVisibility
  toolSlug: string
}) {
  const decision = params.runtime.allowedDecisions.get(params.toolSlug)
  if (!decision) {
    return null
  }

  if (!params.runtime.composioSessionId || !params.runtime.sessionRunId) {
    return null
  }

  return executeAllowedToolCall({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    sessionRunId: params.runtime.sessionRunId,
    sourceType: params.runtime.sourceType,
    sourceId: params.runtime.sourceId,
    visibility: params.visibility,
    composioSessionId: params.runtime.composioSessionId,
    toolCall: buildSyntheticToolCall(params.toolSlug, params.argumentsPayload),
    decision,
  })
}

async function queueScopedToolApprovalBySlug(params: {
  actorUserId: string
  argumentsPayload: Record<string, unknown>
  db: AnyDb
  orgId: string
  runtime: Pick<
    ScopedToolRuntime,
    'approvalDecisions' | 'sessionRunId' | 'sourceId' | 'sourceType'
  >
  toolSlug: string
}) {
  const decision = params.runtime.approvalDecisions.get(params.toolSlug)
  if (!decision || !params.runtime.sessionRunId) {
    return null
  }

  return queueToolApprovalRequest({
    db: params.db,
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    toolCallId: buildSyntheticToolCall(
      params.toolSlug,
      params.argumentsPayload,
      'approval'
    ).id,
    sessionRunId: params.runtime.sessionRunId,
    sourceType: params.runtime.sourceType,
    sourceId: params.runtime.sourceId,
    decision,
    argumentsPayload: params.argumentsPayload,
  })
}

async function planLinearIssueCreation(params: {
  headers: Record<string, string>
  instanceUrl: string
  model?: string
  messages: OpenAIMessage[]
  teams: LinearTeamSnapshot[]
  projects: LinearProjectSnapshot[]
  userMessage: string
  users: LinearUserSnapshot[]
}) {
  const response = await requestOpenClawChatCompletion({
    instanceUrl: params.instanceUrl,
    headers: params.headers,
    model: params.model,
    messages: [
      {
        role: 'system',
        content:
          'You are a structured extraction service for Kodi. Return only JSON and do not mention tools, plugins, gateway config, or environment setup.',
      },
      {
        role: 'user',
        content: buildLinearIssuePlannerContext(params),
      },
    ],
  })

  const content = getAssistantContent(response)
  return parseLinearIssueCreationPlan(content)
}

async function maybeHandleLinearIssueCreation(params: {
  actorUserId: string
  db: AnyDb
  headers: Record<string, string>
  instanceUrl: string
  model?: string
  messages: OpenAIMessage[]
  orgId: string
  runtime: ScopedToolRuntime
  userMessage: string
  visibility: OpenClawConversationVisibility
}) {
  if (!shouldBrokerLinearIssueCreation(params.userMessage, params.runtime)) {
    return null
  }

  const usedToolSlugs: string[] = []

  const executeSupportTool = async (
    toolSlug: string,
    argumentsPayload: Record<string, unknown>
  ) => {
    const result = await executeScopedToolBySlug({
      actorUserId: params.actorUserId,
      argumentsPayload,
      db: params.db,
      orgId: params.orgId,
      runtime: params.runtime,
      visibility: params.visibility,
      toolSlug,
    })

    if (result) {
      usedToolSlugs.push(result.toolSlug)
    }

    return result
  }

  const [teamsResult, projectsResult, usersResult] = await Promise.all([
    executeSupportTool('LINEAR_LIST_LINEAR_TEAMS', {}),
    executeSupportTool('LINEAR_LIST_LINEAR_PROJECTS', {}),
    executeSupportTool('LINEAR_LIST_LINEAR_USERS', { first: 100 }),
  ])

  const teams = teamsResult ? normalizeLinearTeams(teamsResult.toolPayload) : []
  const projects = projectsResult
    ? normalizeLinearProjects(projectsResult.toolPayload)
    : []
  const users = usersResult ? normalizeLinearUsers(usersResult.toolPayload) : []

  if (teams.length === 0) {
    return {
      content:
        'I can create a Linear issue, but I could not load your available Linear teams yet. Please try again in a moment.',
      usedToolSlugs,
    }
  }

  const plan = await planLinearIssueCreation({
    headers: params.headers,
    instanceUrl: params.instanceUrl,
    model: params.model,
    messages: params.messages,
    teams,
    projects,
    userMessage: params.userMessage,
    users,
  })

  if (!plan) {
    return {
      content:
        'I can create the Linear issue, but I could not confidently structure the request from this message. Please tell me the issue title and any team or project you want it in.',
      usedToolSlugs,
    }
  }

  if (!plan.canCreate) {
    return {
      content:
        plan.clarification_question ??
        'What should the Linear issue title be, and which team should I create it in?',
      usedToolSlugs,
    }
  }

  const finalized = finalizeLinearIssueCreationPlan({
    plan,
    teams,
    projects,
    users,
  })

  if (!finalized.ok) {
    return {
      content: finalized.clarificationQuestion,
      usedToolSlugs,
    }
  }

  const createResult = await executeScopedToolBySlug({
    actorUserId: params.actorUserId,
    argumentsPayload: finalized.argumentsPayload,
    db: params.db,
    orgId: params.orgId,
    runtime: params.runtime,
    toolSlug: 'LINEAR_CREATE_LINEAR_ISSUE',
  })

  if (!createResult) {
    const approvalRequest = await queueScopedToolApprovalBySlug({
      actorUserId: params.actorUserId,
      argumentsPayload: finalized.argumentsPayload,
      db: params.db,
      orgId: params.orgId,
      runtime: params.runtime,
      toolSlug: 'LINEAR_CREATE_LINEAR_ISSUE',
    })

    if (!approvalRequest) {
      return null
    }

    return {
      content: buildApprovalResponseMessage({
        created: [approvalRequest],
      }),
      usedToolSlugs,
    }
  }

  usedToolSlugs.push(createResult.toolSlug)

  if (!createResult.toolPayload.success) {
    return {
      content: createResult.toolPayload.error
        ? `I tried to create the Linear issue, but Linear returned this error: ${createResult.toolPayload.error}`
        : 'I tried to create the Linear issue, but the write did not succeed.',
      usedToolSlugs,
    }
  }

  return {
    content: buildLinearIssueCreatedMessage(
      createResult.toolPayload,
      finalized.argumentsPayload.title as string
    ),
    usedToolSlugs,
  }
}

async function expireToolSessionRun(
  dbInstance: AnyDb,
  sessionRunId: string | null,
  metadata?: Record<string, unknown>
) {
  if (!sessionRunId) return

  await dbInstance
    .update(toolSessionRuns)
    .set({
      expiredAt: new Date(),
      ...(metadata ? { metadata } : {}),
    })
    .where(eq(toolSessionRuns.id as never, sessionRunId as never) as never)
}

export async function runChatCompletionWithToolAccess(params: {
  db: AnyDb
  orgId: string
  actorUserId: string
  sourceId?: string | null
  visibility: OpenClawConversationVisibility
  userMessage: string
  instanceUrl: string
  headers: Record<string, string>
  model?: string
  messages: Array<{ role: string; content: string }>
}) {
  const baseMessages = params.messages.map((message) => ({
    role:
      message.role === 'system' || message.role === 'assistant'
        ? message.role
        : 'user',
    content: message.content,
  })) as OpenAIMessage[]

  let scopedRuntime: ScopedToolRuntime | null = null

  try {
    scopedRuntime = await createScopedToolRuntime({
      db: params.db,
      orgId: params.orgId,
      userId: params.actorUserId,
      sourceType: 'chat',
      sourceId: params.sourceId,
      userMessage: params.userMessage,
    })
  } catch (error) {
    console.error('Tool access bootstrap failed; falling back to plain chat.', {
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      sourceId: params.sourceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })

    return runPlainChatCompletion({
      instanceUrl: params.instanceUrl,
      headers: params.headers,
      model: params.model,
      messages: baseMessages,
    })
  }

  const runtimePrompt = scopedRuntime
    ? buildRuntimeSystemPrompt(scopedRuntime, {
        mustUseTools: shouldRequireToolUse(params.userMessage, scopedRuntime),
      })
    : null

  const requestMessages =
    runtimePrompt && baseMessages[0]?.role === 'system'
      ? [
          {
            role: 'system',
            content: `${baseMessages[0].content ?? ''}\n\n${runtimePrompt}`,
          } satisfies OpenAIMessage,
          ...baseMessages.slice(1),
        ]
      : baseMessages

  const conversation = [...requestMessages]
  const usedToolSlugs: string[] = []
  const mustUseTools = scopedRuntime
    ? shouldRequireToolUse(params.userMessage, scopedRuntime)
    : false
  let automaticExecutionUsed = false
  let forcedToolRetryUsed = false
  let groundedRewriteUsed = false

  try {
    if (
      scopedRuntime &&
      shouldAnswerFromRuntimeState(params.userMessage, scopedRuntime)
    ) {
      return {
        content: buildRuntimeAvailabilityAnswer(
          params.userMessage,
          scopedRuntime
        ),
        toolRuntime: {
          sessionRunId: scopedRuntime.sessionRunId,
          composioSessionId: scopedRuntime.composioSessionId,
          usedToolSlugs: [],
          gatedToolCount: scopedRuntime.gatedDecisions.length,
          availableToolCount:
            scopedRuntime.allowedTools.length +
            scopedRuntime.approvalTools.length,
        },
      }
    }

    if (scopedRuntime) {
      const linearIssueCreation = await maybeHandleLinearIssueCreation({
        actorUserId: params.actorUserId,
        db: params.db,
        headers: params.headers,
        instanceUrl: params.instanceUrl,
        model: params.model,
        messages: conversation,
        orgId: params.orgId,
        runtime: scopedRuntime,
        userMessage: params.userMessage,
        visibility: params.visibility,
      })

      if (linearIssueCreation) {
        usedToolSlugs.push(...linearIssueCreation.usedToolSlugs)

        return {
          content: linearIssueCreation.content,
          toolRuntime: {
            sessionRunId: scopedRuntime.sessionRunId,
            composioSessionId: scopedRuntime.composioSessionId,
            usedToolSlugs: uniqueStrings(usedToolSlugs),
            gatedToolCount: scopedRuntime.gatedDecisions.length,
            availableToolCount:
              scopedRuntime.allowedTools.length +
              scopedRuntime.approvalTools.length,
          },
        }
      }
    }

    if (
      scopedRuntime &&
      mustUseTools &&
      scopedRuntime.allowedTools.length > 0 &&
      scopedRuntime.composioSessionId &&
      scopedRuntime.sessionRunId
    ) {
      const plans = selectAutomaticToolExecutionPlans(
        params.userMessage,
        scopedRuntime
      )

      if (plans.length > 0) {
        automaticExecutionUsed = true

        const automaticExecution = await executeAutomaticToolPlans({
          actorUserId: params.actorUserId,
          composioSessionId: scopedRuntime.composioSessionId,
          db: params.db,
          orgId: params.orgId,
          plans,
          sourceId: scopedRuntime.sourceId,
          sourceType: scopedRuntime.sourceType,
          sessionRunId: scopedRuntime.sessionRunId,
        })

        conversation.push({
          role: 'assistant',
          content: null,
          tool_calls: automaticExecution.assistantToolCalls,
        })
        conversation.push(...automaticExecution.toolMessages)
        conversation.push(automaticExecution.summaryMessage)
        usedToolSlugs.push(...automaticExecution.usedToolSlugs)
      }
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await requestOpenClawChatCompletion({
        instanceUrl: params.instanceUrl,
        headers: params.headers,
        model: params.model,
        messages: conversation,
        tools: scopedRuntime?.openAITools,
        toolChoice:
          scopedRuntime && mustUseTools && usedToolSlugs.length === 0
            ? 'required'
            : 'auto',
      })

      const choice = response.choices?.[0]
      const rawMessage = choice?.message

      if (!rawMessage) {
        throw new Error('Empty response from instance')
      }

      const toolCalls = (rawMessage.tool_calls ?? [])
        .map((toolCall) => {
          const id = typeof toolCall.id === 'string' ? toolCall.id : null
          const name =
            typeof toolCall.function?.name === 'string'
              ? toolCall.function.name
              : null
          const args =
            typeof toolCall.function?.arguments === 'string'
              ? toolCall.function.arguments
              : null

          if (!id || !name || !args) {
            return null
          }

          return {
            id,
            type: 'function',
            function: {
              name,
              arguments: args,
            },
          } satisfies OpenAIToolCall
        })
        .filter((toolCall): toolCall is OpenAIToolCall => toolCall !== null)

      if (toolCalls.length === 0) {
        if (
          scopedRuntime &&
          mustUseTools &&
          !automaticExecutionUsed &&
          scopedRuntime.allowedTools.length > 0 &&
          scopedRuntime.composioSessionId &&
          scopedRuntime.sessionRunId
        ) {
          const plans = selectAutomaticToolExecutionPlans(
            params.userMessage,
            scopedRuntime
          )

          if (plans.length > 0) {
            automaticExecutionUsed = true

            const automaticExecution = await executeAutomaticToolPlans({
              actorUserId: params.actorUserId,
              composioSessionId: scopedRuntime.composioSessionId,
              db: params.db,
              orgId: params.orgId,
              plans,
              sourceId: scopedRuntime.sourceId,
              sourceType: scopedRuntime.sourceType,
              sessionRunId: scopedRuntime.sessionRunId,
            })

            conversation.push({
              role: 'assistant',
              content: null,
              tool_calls: automaticExecution.assistantToolCalls,
            })
            conversation.push(...automaticExecution.toolMessages)
            conversation.push(automaticExecution.summaryMessage)
            usedToolSlugs.push(...automaticExecution.usedToolSlugs)
            continue
          }
        }

        const content = rawMessage.content?.trim()
        if (!content) {
          throw new Error('Empty response from instance')
        }

        if (
          scopedRuntime &&
          mustUseTools &&
          usedToolSlugs.length === 0 &&
          !forcedToolRetryUsed &&
          (scopedRuntime.allowedTools.length > 0 ||
            scopedRuntime.approvalTools.length > 0)
        ) {
          forcedToolRetryUsed = true
          conversation.push({
            role: 'system',
            content:
              'The previous draft was invalid because it answered without executing a live tool. This request requires current integration data. Return exactly one relevant tool call now. Do not answer in prose unless every relevant tool truly requires missing user input.',
          })
          continue
        }

        if (
          scopedRuntime &&
          usedToolSlugs.length > 0 &&
          looksLikeInvalidIntegrationNarration(content) &&
          !groundedRewriteUsed
        ) {
          groundedRewriteUsed = true
          conversation.push({
            role: 'assistant',
            content,
          })
          conversation.push({
            role: 'system',
            content:
              'The previous draft was invalid because it talked about tool availability or setup instead of answering from the tool results already in the conversation. Do not mention access, plugins, gateway config, OpenClaw setup, environment, or alternate channels. Answer the user directly from the tool results. If the tool results are insufficient, say exactly what data is still missing from those tool results.',
          })
          continue
        }

        if (scopedRuntime && mustUseTools && usedToolSlugs.length === 0) {
          return {
            content:
              'I couldn’t complete that with live integration data because Kodi did not get a real tool result for this request. Please retry, or reconnect the integration if the problem persists.',
            toolRuntime: {
              sessionRunId: scopedRuntime.sessionRunId,
              composioSessionId: scopedRuntime.composioSessionId,
              usedToolSlugs: [],
              gatedToolCount: scopedRuntime.gatedDecisions.length,
              availableToolCount:
                scopedRuntime.allowedTools.length +
                scopedRuntime.approvalTools.length,
            },
          }
        }

        return {
          content,
          toolRuntime: scopedRuntime
            ? {
                sessionRunId: scopedRuntime.sessionRunId,
                composioSessionId: scopedRuntime.composioSessionId,
                usedToolSlugs: uniqueStrings(usedToolSlugs),
                gatedToolCount: scopedRuntime.gatedDecisions.length,
                availableToolCount:
                  scopedRuntime.allowedTools.length +
                  scopedRuntime.approvalTools.length,
              }
            : null,
        }
      }

      conversation.push({
        role: 'assistant',
        content: rawMessage.content ?? null,
        tool_calls: toolCalls,
      })

      const toolMessages: OpenAIMessage[] = []
      const createdApprovals: QueuedApprovalResult[] = []

      for (const [index, toolCall] of toolCalls.entries()) {
        if (index >= MAX_TOOL_CALLS_PER_ROUND) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: `Kodi only executes up to ${MAX_TOOL_CALLS_PER_ROUND} tool calls in one round.`,
            }),
          })
          continue
        }

        const decision =
          scopedRuntime?.allowedDecisions.get(toolCall.function.name) ??
          scopedRuntime?.approvalDecisions.get(toolCall.function.name)
        const sessionRunId = scopedRuntime?.sessionRunId ?? null
        const composioSessionId = scopedRuntime?.composioSessionId ?? null

        if (!decision || !sessionRunId || !scopedRuntime) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error:
                'This tool is not executable in the current request scope.',
            }),
          })
          continue
        }

        if (decision.status === 'approval_required') {
          const parsedArguments = parseToolCallArguments(toolCall)
          if (!parsedArguments.ok) {
            toolMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                error: parsedArguments.error,
              }),
            })
            continue
          }

          const approvalRequest = await queueToolApprovalRequest({
            db: params.db,
            orgId: params.orgId,
            actorUserId: params.actorUserId,
            toolCallId: toolCall.id,
            sessionRunId,
            sourceType: scopedRuntime.sourceType,
            sourceId: scopedRuntime.sourceId,
            decision,
            argumentsPayload: parsedArguments.value,
          })

          createdApprovals.push(approvalRequest)
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: true,
              approvalRequested: true,
              approvalRequestId: approvalRequest.approvalRequestId,
              preview: approvalRequest.preview,
            }),
          })
          continue
        }

        if (!composioSessionId) {
          toolMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error:
                'This tool is not executable in the current request scope.',
            }),
          })
          continue
        }

        const result = await executeAllowedToolCall({
          db: params.db,
          orgId: params.orgId,
          actorUserId: params.actorUserId,
          sessionRunId,
          sourceType: scopedRuntime.sourceType,
          sourceId: scopedRuntime.sourceId,
          visibility: params.visibility,
          composioSessionId,
          toolCall,
          decision,
        })

        usedToolSlugs.push(result.toolSlug)
        toolMessages.push(result.toolMessage)
      }

      if (createdApprovals.length > 0) {
        return {
          content: buildApprovalResponseMessage({
            created: createdApprovals,
          }),
          toolRuntime: {
            sessionRunId: scopedRuntime?.sessionRunId ?? null,
            composioSessionId: scopedRuntime?.composioSessionId ?? null,
            usedToolSlugs: uniqueStrings(usedToolSlugs),
            gatedToolCount: scopedRuntime?.gatedDecisions.length ?? 0,
            availableToolCount:
              (scopedRuntime?.allowedTools.length ?? 0) +
              (scopedRuntime?.approvalTools.length ?? 0),
          },
        }
      }

      conversation.push(...toolMessages)
    }

    throw new Error(
      'Tool execution loop exceeded the maximum number of rounds.'
    )
  } finally {
    if (scopedRuntime?.sessionRunId) {
      await expireToolSessionRun(params.db, scopedRuntime.sessionRunId, {
        ...scopedRuntime.metadata,
        usedToolSlugs: uniqueStrings(usedToolSlugs),
      })
    }
  }
}
