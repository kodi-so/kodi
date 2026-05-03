import { describe, expect, test } from 'bun:test'
import {
  ADMIN_KEYWORDS,
  DRAFT_VERBS,
  READ_VERBS,
  WRITE_VERBS,
  classifyToolCall,
  type ToolActionClass,
} from './action-class'

describe('classifyToolCall — admin', () => {
  test.each<[string, string]>([
    ['admin keyword in slug', 'GMAIL_ADMIN_LIST'],
    ['SCIM keyword', 'SCIM_USERS_LIST'],
    ['PERMISSION keyword', 'GITHUB_REPO_PERMISSION_GET'],
    ['ROLE keyword', 'SLACK_ROLE_LIST'],
    ['INSTALL keyword', 'INSTALL_APP'],
    ['UNINSTALL keyword', 'UNINSTALL_APP'],
    ['WEBHOOK keyword', 'GITHUB_WEBHOOK_CREATE'],
    ['TOKEN keyword', 'API_TOKEN_LIST'],
    ['SECRET keyword', 'PROJECT_SECRET_LIST'],
    ['AUTH_CONFIG keyword', 'AUTH_CONFIG_UPDATE'],
    ['INTEGRATION keyword', 'INTEGRATION_LIST'],
    ['DELETE_USER as substring', 'GOOGLE_DELETE_USER_API'],
    ['MANAGE_ as substring', 'WORKSPACE_MANAGE_USERS'],
  ])('classifies as admin: %s', (_label, name) => {
    expect(classifyToolCall(name)).toBe('admin')
  })
})

describe('classifyToolCall — draft', () => {
  test.each<[string, string]>([
    ['DRAFT in signature', 'GMAIL_DRAFT_REPLY'],
    ['PREVIEW token', 'NOTION_PREVIEW_PAGE'],
    ['PREPARE token', 'BILLING_PREPARE_INVOICE'],
    ['SUGGEST token', 'CALENDAR_SUGGEST_TIMES'],
    ['PLAN token', 'TRIP_PLAN_BUILD'],
    ['OUTLINE token', 'BLOG_OUTLINE_GENERATE'],
    ['SUMMARIZE token', 'DOC_SUMMARIZE_TEXT'],
  ])('classifies as draft: %s', (_label, name) => {
    expect(classifyToolCall(name)).toBe('draft')
  })

  test('DRAFT substring beats READ verb', () => {
    // "GMAIL_DRAFT_GET" — has GET (read) but signature contains DRAFT
    expect(classifyToolCall('GMAIL_DRAFT_GET')).toBe('draft')
  })
})

describe('classifyToolCall — read', () => {
  test.each<[string, string]>([
    ['LIST', 'GMAIL_LIST_MESSAGES'],
    ['GET', 'NOTION_PAGE_GET'],
    ['SEARCH', 'GITHUB_SEARCH_ISSUES'],
    ['FIND', 'CALENDAR_FIND_EVENTS'],
    ['FETCH', 'STRIPE_FETCH_CUSTOMER'],
    ['READ', 'FILE_READ_CONTENT'],
    ['RETRIEVE', 'PAYMENT_RETRIEVE_INTENT'],
    ['QUERY', 'AIRTABLE_QUERY_RECORDS'],
    ['LOOKUP', 'CRM_LOOKUP_CONTACT'],
    ['DESCRIBE', 'AWS_DESCRIBE_INSTANCE'],
    ['VIEW', 'DASHBOARD_VIEW_METRICS'],
    ['CHECK', 'BUILD_CHECK_STATUS'],
    ['COUNT', 'STORE_COUNT_ITEMS'],
    ['INSPECT', 'CONTAINER_INSPECT_CONFIG'],
  ])('classifies as read: %s', (_label, name) => {
    expect(classifyToolCall(name)).toBe('read')
  })
})

describe('classifyToolCall — write', () => {
  test.each<[string, string]>([
    ['SEND', 'GMAIL_SEND_EMAIL'],
    ['CREATE', 'GITHUB_CREATE_ISSUE'],
    ['UPDATE', 'NOTION_PAGE_UPDATE'],
    ['UPSERT', 'CRM_UPSERT_CONTACT'],
    ['DELETE', 'GMAIL_DELETE_MESSAGE'],
    ['POST', 'SLACK_POST_MESSAGE'],
    ['EDIT', 'DOC_EDIT_PARAGRAPH'],
    ['REMOVE', 'CART_REMOVE_ITEM'],
    ['ADD', 'GROUP_ADD_MEMBER'],
    ['REPLY', 'EMAIL_REPLY_THREAD'],
    ['COMMENT', 'PR_COMMENT_LINE'],
    ['MERGE', 'PR_MERGE_BRANCH'],
    ['APPROVE', 'PR_APPROVE_REVIEW'],
    ['REJECT', 'PR_REJECT_REVIEW'],
    ['ASSIGN', 'TICKET_ASSIGN_USER'],
    ['MOVE', 'CARD_MOVE_COLUMN'],
    ['ARCHIVE', 'CHAT_ARCHIVE_CHANNEL'],
    ['UNARCHIVE', 'CHAT_UNARCHIVE_CHANNEL'],
    ['CLOSE', 'ISSUE_CLOSE_RESOLVE'],
    ['OPEN', 'ISSUE_OPEN_FROM_TEMPLATE'],
    ['COMPLETE', 'TASK_COMPLETE_DONE'],
    ['CANCEL', 'BOOKING_CANCEL_NOW'],
    ['PUBLISH', 'BLOG_PUBLISH_POST'],
    ['SHARE', 'DOC_SHARE_LINK'],
    ['TAG', 'POST_TAG_ADD'],
    ['UNTAG', 'POST_UNTAG_REMOVE'],
    ['STAR', 'REPO_STAR_FAVORITE'],
    ['UNSTAR', 'REPO_UNSTAR_REMOVE'],
    ['SYNC', 'CALENDAR_SYNC_EVENTS'],
    ['RUN', 'WORKFLOW_RUN_TRIGGER'],
    ['EXECUTE', 'JOB_EXECUTE_NOW'],
    ['TRIGGER', 'PIPELINE_TRIGGER_BUILD'],
    ['UPLOAD', 'FILE_UPLOAD_BYTES'],
    ['IMPORT', 'CSV_IMPORT_BATCH'],
    ['EXPORT', 'CSV_EXPORT_BATCH'],
  ])('classifies as write: %s', (_label, name) => {
    expect(classifyToolCall(name)).toBe('write')
  })
})

describe('classifyToolCall — fallback + edge cases', () => {
  test('unknown verb → fallback read', () => {
    expect(classifyToolCall('GMAIL_FROBNICATE')).toBe('read')
  })

  test('empty string → read', () => {
    expect(classifyToolCall('')).toBe('read')
  })

  test('case-insensitive', () => {
    expect(classifyToolCall('gmail_send_email')).toBe('write')
    expect(classifyToolCall('GiThUb_LiSt_IsSuEs')).toBe('read')
  })

  test('admin beats write (e.g., DELETE_USER)', () => {
    expect(classifyToolCall('DELETE_USER')).toBe('admin')
  })

  test('admin beats draft (e.g., ADMIN keyword wins)', () => {
    expect(classifyToolCall('ADMIN_DRAFT_VIEW')).toBe('admin')
  })

  test('signature with separators normalizes', () => {
    expect(classifyToolCall('gmail.send.email')).toBe('write')
    expect(classifyToolCall('gmail-send-email')).toBe('write')
    expect(classifyToolCall('gmail send email')).toBe('write')
  })

  test('verb-only token without context still classifies', () => {
    expect(classifyToolCall('LIST')).toBe('read')
    expect(classifyToolCall('CREATE')).toBe('write')
  })
})

describe('exports', () => {
  test('verb sets are non-empty and immutable in surface', () => {
    expect(READ_VERBS.size).toBeGreaterThan(0)
    expect(DRAFT_VERBS.size).toBeGreaterThan(0)
    expect(WRITE_VERBS.size).toBeGreaterThan(0)
    expect(ADMIN_KEYWORDS.length).toBeGreaterThan(0)
  })

  test('ToolActionClass type exported', () => {
    const x: ToolActionClass = 'read'
    expect(x).toBe('read')
  })
})
