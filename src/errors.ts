import type { ErrorRequestHandler, RequestHandler } from 'express'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** URL의 id 파라미터. 양의 정수가 아니면 404 */
export function parseId(value: string): number {
  const id = Number(value)
  // PostgreSQL integer 범위(2^31-1) 안의 양의 정수 표기만 허용한다
  if (!/^[1-9]\d{0,9}$/.test(value) || id > 2147483647) throw new HttpError(404, '기록을 찾을 수 없습니다')
  return id
}

export const notFound: RequestHandler = () => {
  throw new HttpError(404, '페이지를 찾을 수 없습니다')
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const rawStatus = err instanceof HttpError ? err.status : Number(err?.status)
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500
  if (status >= 500) console.error(err)
  const message =
    err instanceof HttpError
      ? err.message
      : status === 404
        ? '페이지를 찾을 수 없습니다'
        : status < 500
          ? '잘못된 요청입니다'
          : '서버 오류가 발생했습니다'
  res.status(status).render('error', { title: '오류', status, message })
}
