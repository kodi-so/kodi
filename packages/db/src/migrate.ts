import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../drizzle')

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  console.log('🔄 Running database migrations...')

  // Use a dedicated connection for migrations (not the lazy singleton)
  const client = postgres(connectionString, { prepare: false, max: 1 })
  const db = drizzle(client)

  try {
    await migrate(db, { migrationsFolder })
    console.log('✅ Migrations complete')
  } finally {
    await client.end()
  }
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
