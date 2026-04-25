import { db, sql } from '@kodi/db'

type RequiredSchemaObject =
  | {
      kind: 'table'
      tableName: string
      migration: string
    }
  | {
      kind: 'column'
      tableName: string
      columnName: string
      migration: string
    }

const requiredChatSchema: RequiredSchemaObject[] = [
  {
    kind: 'table',
    tableName: 'chat_channels',
    migration: '0020_chat_channels_threads.sql',
  },
]

const requiredVoiceSchema: RequiredSchemaObject[] = [
  {
    kind: 'column',
    tableName: 'meeting_answers',
    columnName: 'delivered_to_voice_at',
    migration: '0025_phase_4_voice_output.sql',
  },
  {
    kind: 'column',
    tableName: 'meeting_answers',
    columnName: 'interrupted_at',
    migration: '0025_phase_4_voice_output.sql',
  },
  {
    kind: 'table',
    tableName: 'meeting_voice_media',
    migration: '0026_phase_4_durable_voice_media.sql',
  },
]

async function tableExists(tableName: string) {
  const rows = (await db.execute(
    sql`select to_regclass(${`public.${tableName}`}) as object_name`
  )) as Array<{ object_name: string | null }>

  return rows[0]?.object_name != null
}

async function columnExists(tableName: string, columnName: string) {
  const rows = (await db.execute(sql`
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    limit 1
  `)) as Array<{ '?column?': number }>

  return rows.length > 0
}

function buildMissingSchemaError(missing: RequiredSchemaObject[]) {
  const details = missing.map((item) =>
    item.kind === 'table'
      ? `public.${item.tableName} (migration: ${item.migration})`
      : `public.${item.tableName}.${item.columnName} (migration: ${item.migration})`
  )

  return [
    'Database schema is missing required meeting voice objects.',
    `Missing: ${details.join(', ')}`,
    'This environment is not ready to test live meeting voice delivery.',
    'Expected startup behavior is to run `cd /app/packages/db && bun run db:migrate` before serving traffic.',
  ].join(' ')
}

export async function ensureApiSchemaReadiness() {
  const missing: RequiredSchemaObject[] = []

  for (const item of [...requiredChatSchema, ...requiredVoiceSchema]) {
    const exists =
      item.kind === 'table'
        ? await tableExists(item.tableName)
        : await columnExists(item.tableName, item.columnName)

    if (!exists) {
      missing.push(item)
    }
  }

  if (missing.length > 0) {
    throw new Error(buildMissingSchemaError(missing))
  }

  console.info('[startup] database schema readiness check passed', {
    requiredVoiceSchemaVersion: 'phase4-durable-voice-media',
  })
}
