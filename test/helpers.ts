import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Config } from '../src/config.js'

export const TEST_PASSWORD = 'test-password'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: 'postgres://unused',
    adminPassword: TEST_PASSWORD,
    sessionSecret: 's'.repeat(32),
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-note-')),
    port: 0,
    cookieSecure: false,
    ...overrides,
  }
}
