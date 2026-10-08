import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 프로젝트 루트. src/와 dist/ 모두 루트 바로 아래에 있으므로 한 단계 위가 루트다. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const VIEWS_DIR = path.join(ROOT, 'views')
export const PUBLIC_DIR = path.join(ROOT, 'public')
export const MIGRATIONS_DIR = path.join(ROOT, 'migrations')

export function vendorDir(pkg: string, sub: string): string {
  return path.join(ROOT, 'node_modules', pkg, sub)
}
