import { isIPv4, isIPv6 } from 'node:net'

export type LoginGuardOptions = {
  maxFailures?: number
  blockMs?: number
  failureTtlMs?: number
  maxEntries?: number
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
const IPV6_PREFIX_BITS = 56

/** IPv6 문자열(축약·IPv4 꼬리 포함)을 16비트 그룹 8개로 푼다 */
function parseIPv6(address: string): number[] | null {
  let text = address
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (tail && isIPv4(tail[1]!)) {
    const [a, b, c, d] = tail[1]!.split('.').map(Number) as [number, number, number, number]
    text = `${text.slice(0, -tail[1]!.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const toGroups = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)))
  const head = toGroups(halves[0]!)
  const rest = halves.length === 2 ? toGroups(halves[1]!) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...rest]
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

/**
 * 같은 클라이언트로 볼 키를 만든다.
 * IPv4는 그대로, IPv4-mapped IPv6는 IPv4로, 그 외 IPv6는 /56 서브넷 단위로 묶는다
 */
export function clientKey(ip: string): string {
  const address = ip.split('%')[0]!.toLowerCase()
  if (isIPv4(address) || !isIPv6(address)) return address
  const groups = parseIPv6(address)
  if (!groups) return address
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join('.')
  }
  const mask = (0xffff << (16 - (IPV6_PREFIX_BITS - 48))) & 0xffff
  return `${[groups[0], groups[1], groups[2], groups[3]! & mask].map((g) => g!.toString(16)).join(':')}::/${IPV6_PREFIX_BITS}`
}

/** IP별 로그인 실패를 메모리에 세어, maxFailures번째 실패에서 blockMs 동안 차단한다 */
export function createLoginGuard({
  maxFailures = 10,
  blockMs = 10 * 60_000,
  failureTtlMs = 10 * 60_000,
  maxEntries = MAX_ENTRIES,
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

  /** 새 항목 자리를 만든다. 차단 중인 항목은 지우지 않으며, 자리가 없으면 false */
  function makeRoom(at: number): boolean {
    if (entries.size < maxEntries) return true
    prune(at)
    for (const [key, entry] of entries) {
      if (entries.size < maxEntries) break
      if (entry.blockedUntil === 0) entries.delete(key)
    }
    return entries.size < maxEntries
  }

  return {
    check(ip) {
      const key = clientKey(ip)
      const at = now()
      const entry = entries.get(key)
      if (!entry) return { blocked: false }
      if (isExpired(entry, at)) {
        entries.delete(key)
        return { blocked: false }
      }
      return entry.blockedUntil > 0 ? { blocked: true, retryAfterMs: entry.blockedUntil - at } : { blocked: false }
    },

    recordFailure(ip) {
      const key = clientKey(ip)
      const at = now()
      const found = entries.get(key)
      const current = found && !isExpired(found, at) ? found : undefined
      if (!current) {
        entries.delete(key)
        if (!makeRoom(at)) return
      }
      const entry: Entry = current ?? { failures: 0, lastFailureAt: at, blockedUntil: 0 }
      entry.failures += 1
      entry.lastFailureAt = at
      if (entry.failures >= maxFailures) entry.blockedUntil = at + blockMs
      // 갱신된 항목을 Map 맨 뒤로 보내 가장 오래된 항목이 앞에 오게 한다
      entries.delete(key)
      entries.set(key, entry)
    },

    recordSuccess(ip) {
      entries.delete(clientKey(ip))
    },
  }
}
