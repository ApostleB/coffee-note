export type LoginGuardOptions = {
  maxFailures?: number
  blockMs?: number
  failureTtlMs?: number
  now?: () => number
}

export type LoginCheck = { blocked: false } | { blocked: true; retryAfterMs: number }

export type LoginGuard = {
  check(ip: string): LoginCheck
  recordFailure(ip: string): void
  recordSuccess(ip: string): void
}

type Entry = { failures: number; lastFailureAt: number; blockedUntil: number }

const MAX_ENTRIES = 10_000

/** IP별 로그인 실패를 메모리에 세어, maxFailures번째 실패에서 blockMs 동안 차단한다 */
export function createLoginGuard({
  maxFailures = 10,
  blockMs = 10 * 60_000,
  failureTtlMs = 10 * 60_000,
  now = () => Date.now(),
}: LoginGuardOptions = {}): LoginGuard {
  const entries = new Map<string, Entry>()

  const isExpired = (entry: Entry, at: number) =>
    entry.blockedUntil > 0 ? entry.blockedUntil <= at : at - entry.lastFailureAt >= failureTtlMs

  function prune(at: number): void {
    for (const [ip, entry] of entries) {
      if (isExpired(entry, at)) entries.delete(ip)
    }
  }

  return {
    check(ip) {
      const at = now()
      const entry = entries.get(ip)
      if (!entry) return { blocked: false }
      if (isExpired(entry, at)) {
        entries.delete(ip)
        return { blocked: false }
      }
      return entry.blockedUntil > 0 ? { blocked: true, retryAfterMs: entry.blockedUntil - at } : { blocked: false }
    },

    recordFailure(ip) {
      const at = now()
      const current = entries.get(ip)
      const entry: Entry = current && !isExpired(current, at) ? current : { failures: 0, lastFailureAt: at, blockedUntil: 0 }
      entry.failures += 1
      entry.lastFailureAt = at
      if (entry.failures >= maxFailures) entry.blockedUntil = at + blockMs
      // 갱신된 항목을 Map 맨 뒤로 보내 가장 오래된 항목이 앞에 오게 한다
      entries.delete(ip)
      entries.set(ip, entry)
      if (entries.size > MAX_ENTRIES) {
        prune(at)
        while (entries.size > MAX_ENTRIES) {
          const oldest = entries.keys().next()
          if (oldest.done) break
          entries.delete(oldest.value)
        }
      }
    },

    recordSuccess(ip) {
      entries.delete(ip)
    },
  }
}
