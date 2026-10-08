import { describe, expect, it, vi } from 'vitest'
import { createPool } from '../src/db.js'

describe('createPool', () => {
  it('유휴 연결 오류가 프로세스를 죽이지 않고 로그로 남는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pool = createPool('postgres://unused')
    try {
      expect(() => pool.emit('error', new Error('x'))).not.toThrow()
      expect(spy).toHaveBeenCalledWith('유휴 DB 연결 오류', expect.any(Error))
    } finally {
      await pool.end()
      spy.mockRestore()
    }
  })
})
