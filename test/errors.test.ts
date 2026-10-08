import { describe, expect, it } from 'vitest'
import { HttpError, parseId } from '../src/errors.js'

describe('parseId', () => {
  it.each(['0', '-1', '1.5', '1e3', '0x10', ' 7', '2147483648', '', '01'])('%j는 404', (value) => {
    expect(() => parseId(value)).toThrow(HttpError)
    try {
      parseId(value)
    } catch (err) {
      expect((err as HttpError).status).toBe(404)
    }
  })

  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
  ])('%s는 통과', (value, expected) => {
    expect(parseId(value)).toBe(expected)
  })
})
