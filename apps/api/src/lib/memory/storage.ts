import { Readable } from 'stream'
import {
  type CommonPrefix,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3'
import { requireMemoryStorage } from '../../env'

export type MemoryStoragePathType = 'file' | 'directory'

export type MemoryStorageListEntry = {
  path: string
  name: string
  type: MemoryStoragePathType
  size: number | null
  lastModified: Date | null
}

export type MemoryStorageStat = {
  path: string
  type: MemoryStoragePathType
  size: number | null
  lastModified: Date | null
}

export type MemoryStorageSearchResult = {
  path: string
  preview: string
  score: number
}

export type MemoryStorageWriteInput = {
  path: string
  body: Buffer | string
  contentType?: string
}

export type MemoryStorageSearchInput = {
  query: string
  prefix?: string
  limit?: number
}

export interface MemoryStorage {
  listDirectory(path?: string): Promise<MemoryStorageListEntry[]>
  readFile(path: string): Promise<Buffer>
  writeFile(input: MemoryStorageWriteInput): Promise<void>
  movePath(fromPath: string, toPath: string): Promise<void>
  deletePath(path: string): Promise<void>
  createDirectory(path: string): Promise<void>
  statPath(path: string): Promise<MemoryStorageStat | null>
  searchContent(input: MemoryStorageSearchInput): Promise<MemoryStorageSearchResult[]>
}

function normalizePath(path?: string) {
  if (!path) return ''
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function joinSegments(...parts: Array<string | undefined>) {
  return parts
    .map((part) => normalizePath(part))
    .filter(Boolean)
    .join('/')
}

function basename(path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return ''
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? ''
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0)

  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToByteArray' in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
      'function'
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray()
    return Buffer.from(bytes)
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = []
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  if (typeof body === 'string') {
    return Buffer.from(body)
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body)
  }

  throw new Error('Unsupported S3 response body type.')
}

function buildPreview(content: string, query: string) {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerContent.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return content.slice(0, 160).trim()
  }

  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(content.length, matchIndex + query.length + 100)
  return content.slice(start, end).trim()
}

export class S3MemoryStorage implements MemoryStorage {
  private readonly bucket: string
  private readonly rootPrefix: string
  private readonly client: S3Client

  constructor(options?: {
    client?: S3Client
    bucket?: string
    rootPrefix?: string
  }) {
    const config = requireMemoryStorage()

    this.client =
      options?.client ??
      new S3Client({
        region: config.MEMORY_STORAGE_REGION,
        endpoint: config.MEMORY_STORAGE_ENDPOINT,
        forcePathStyle: config.MEMORY_STORAGE_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: config.MEMORY_STORAGE_ACCESS_KEY_ID,
          secretAccessKey: config.MEMORY_STORAGE_SECRET_ACCESS_KEY,
        },
      })

    this.bucket = options?.bucket ?? config.MEMORY_STORAGE_BUCKET
    this.rootPrefix = normalizePath(
      options?.rootPrefix ?? config.MEMORY_STORAGE_PREFIX
    )
  }

  async listDirectory(path = '') {
    const normalizedPath = normalizePath(path)
    const directoryPrefix = this.directoryPrefix(normalizedPath)

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: directoryPrefix,
        Delimiter: '/',
      })
    )

    const directories =
      response.CommonPrefixes?.flatMap((prefixEntry: CommonPrefix) => {
        const relativePath = this.relativeDirectoryPath(prefixEntry.Prefix)
        if (!relativePath || relativePath === normalizedPath) return []

        return [
          {
            path: relativePath,
            name: basename(relativePath),
            type: 'directory' as const,
            size: null,
            lastModified: null,
          },
        ]
      }) ?? []

    const files =
      response.Contents?.flatMap((entry: _Object) => {
        const relativePath = this.relativeFilePath(entry)
        if (!relativePath) return []

        return [
          {
            path: relativePath,
            name: basename(relativePath),
            type: 'file' as const,
            size: entry.Size ?? null,
            lastModified: entry.LastModified ?? null,
          },
        ]
      }) ?? []

    return [...directories, ...files].sort((left, right) =>
      left.path.localeCompare(right.path)
    )
  }

  async readFile(path: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.fileKey(path),
      })
    )

    return bodyToBuffer(response.Body)
  }

  async writeFile(input: MemoryStorageWriteInput) {
    const normalizedPath = normalizePath(input.path)
    await this.ensureParentDirectories(normalizedPath)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.fileKey(normalizedPath),
        Body:
          typeof input.body === 'string'
            ? Buffer.from(input.body)
            : input.body,
        ContentType: input.contentType ?? 'text/markdown; charset=utf-8',
      })
    )
  }

  async movePath(fromPath: string, toPath: string) {
    const source = normalizePath(fromPath)
    const destination = normalizePath(toPath)
    const stat = await this.statPath(source)

    if (!stat) {
      throw new Error(`Path not found: ${source}`)
    }

    if (stat.type === 'file') {
      await this.ensureParentDirectories(destination)
      await this.copyObject(this.fileKey(source), this.fileKey(destination))
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.fileKey(source),
        })
      )
      return
    }

    await this.createDirectory(destination)

    const keys = await this.listAllObjectKeys(this.directoryPrefix(source))
    for (const key of keys) {
      const suffix = key.slice(this.directoryPrefix(source).length)
      const targetKey = `${this.directoryPrefix(destination)}${suffix}`
      await this.copyObject(key, targetKey)
    }

    for (const key of keys) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
    }
  }

  async deletePath(path: string) {
    const normalizedPath = normalizePath(path)
    const stat = await this.statPath(normalizedPath)

    if (!stat) return

    if (stat.type === 'file') {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.fileKey(normalizedPath),
        })
      )
      return
    }

    const keys = await this.listAllObjectKeys(this.directoryPrefix(normalizedPath))
    for (const key of keys) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      )
    }
  }

  async createDirectory(path: string) {
    const normalizedPath = normalizePath(path)
    if (!normalizedPath) return

    await this.ensureParentDirectories(normalizedPath)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.directoryPrefix(normalizedPath),
        Body: '',
      })
    )
  }

  async statPath(path: string) {
    const normalizedPath = normalizePath(path)

    if (!normalizedPath) {
      return {
        path: '',
        type: 'directory' as const,
        size: null,
        lastModified: null,
      }
    }

    try {
      const file = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.fileKey(normalizedPath),
        })
      )

      return {
        path: normalizedPath,
        type: 'file' as const,
        size: file.ContentLength ?? null,
        lastModified: file.LastModified ?? null,
      }
    } catch {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.directoryPrefix(normalizedPath),
          MaxKeys: 1,
        })
      )

      if ((response.Contents?.length ?? 0) > 0) {
        return {
          path: normalizedPath,
          type: 'directory' as const,
          size: null,
          lastModified: null,
        }
      }
    }

    return null
  }

  async searchContent(input: MemoryStorageSearchInput) {
    const query = input.query.trim()
    if (!query) return []

    const limit = input.limit ?? 20
    const prefix = this.directoryPrefix(normalizePath(input.prefix))
    const keys = await this.listAllObjectKeys(prefix)
    const results: MemoryStorageSearchResult[] = []

    for (const key of keys) {
      if (key.endsWith('/')) continue

      const relativePath = this.relativeKey(key)
      if (!relativePath) continue

      const content = (await this.readFile(relativePath)).toString('utf8')
      const matches = content.toLowerCase().split(query.toLowerCase()).length - 1

      if (matches <= 0) continue

      results.push({
        path: relativePath,
        preview: buildPreview(content, query),
        score: matches,
      })

      if (results.length >= limit) break
    }

    return results.sort((left, right) => right.score - left.score)
  }

  private async ensureParentDirectories(path: string) {
    const segments = normalizePath(path).split('/').slice(0, -1)
    for (let index = 0; index < segments.length; index += 1) {
      const directoryPath = segments.slice(0, index + 1).join('/')
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.directoryPrefix(directoryPath),
          Body: '',
        })
      )
    }
  }

  private async listAllObjectKeys(prefix: string) {
    let continuationToken: string | undefined
    const keys: string[] = []

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      )

      keys.push(
        ...(response.Contents?.map((entry: _Object) => entry.Key).filter(
          (key: string | undefined): key is string => Boolean(key)
        ) ?? [])
      )

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined
    } while (continuationToken)

    return keys
  }

  private async copyObject(sourceKey: string, destinationKey: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      })
    )
  }

  private fileKey(path: string) {
    return this.prefixedKey(normalizePath(path))
  }

  private directoryPrefix(path: string) {
    const normalizedPath = normalizePath(path)
    const joined = [this.rootPrefix, normalizedPath]
      .map((segment) => normalizePath(segment))
      .filter(Boolean)
      .join('/')

    return joined ? `${joined}/` : ''
  }

  private prefixedKey(path: string) {
    const normalizedPath = path.replace(/^\/+/, '')
    return joinSegments(this.rootPrefix, normalizedPath)
  }

  private relativeKey(key: string) {
    const normalizedKey = normalizePath(key)
    if (!this.rootPrefix) return normalizedKey
    if (!normalizedKey.startsWith(`${this.rootPrefix}/`)) return null
    return normalizedKey.slice(this.rootPrefix.length + 1)
  }

  private relativeDirectoryPath(prefix?: string) {
    const relative = this.relativeKey(prefix ?? '')
    if (!relative) return ''
    return normalizePath(relative)
  }

  private relativeFilePath(entry: _Object) {
    const key = entry.Key
    if (!key || key.endsWith('/')) return null

    const relative = this.relativeKey(key)
    if (!relative) return null

    return normalizePath(relative)
  }
}

export function createMemoryStorage() {
  return new S3MemoryStorage()
}
