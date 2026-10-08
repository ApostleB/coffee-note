import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8),
  SESSION_SECRET: z.string().min(32),
  UPLOAD_DIR: z.string().default('./uploads'),
  PORT: z.coerce.number().int().positive().default(4000),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
})

export type Config = {
  databaseUrl: string
  adminPassword: string
  sessionSecret: string
  /** 절대 경로 */
  uploadDir: string
  port: number
  cookieSecure: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    throw new Error(`환경변수를 확인하세요: ${names.join(', ')}`)
  }
  const e = parsed.data
  return {
    databaseUrl: e.DATABASE_URL,
    adminPassword: e.ADMIN_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
    uploadDir: path.resolve(e.UPLOAD_DIR),
    port: e.PORT,
    cookieSecure: e.COOKIE_SECURE === 'true',
  }
}
