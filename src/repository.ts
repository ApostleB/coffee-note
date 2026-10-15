import type { Pool } from 'pg'
import type { BeanRow } from './cafe-beans.js'
import { withTransaction } from './db.js'
import { allFields, CAFE_BEAN_FIELDS, toColumn } from './fields.js'
import { beanDef, cafeVisitDef, columnsOf, toEntity, type Entity, type Kind, type PhotoRow, type ResourceDef } from './resources.js'

const TITLE_MAX = 200
type Queryable = Pick<Pool, 'query'>

const BEAN_COLUMNS = CAFE_BEAN_FIELDS.map((field): [key: string, column: string] => [field.name, toColumn(field.name)])

/** 방문 id별 원두 행을 position 순서로 읽는다 */
async function loadBeans(db: Queryable, visitIds: number[]): Promise<Map<number, BeanRow[]>> {
  const { rows } = await db.query(
    'SELECT * FROM cafe_visit_beans WHERE cafe_visit_id = ANY($1::int[]) ORDER BY cafe_visit_id, position',
    [visitIds],
  )
  const byVisit = new Map<number, BeanRow[]>()
  for (const row of rows) {
    const bean = Object.fromEntries(BEAN_COLUMNS.map(([key, column]) => [key, row[column] ?? null])) as unknown as BeanRow
    const list = byVisit.get(row.cafe_visit_id) ?? []
    list.push(bean)
    byVisit.set(row.cafe_visit_id, list)
  }
  return byVisit
}

/** 방문의 원두를 모두 지우고 주어진 순서대로 다시 넣는다. 호출자가 트랜잭션을 잡는다. */
async function replaceBeans(db: Queryable, visitId: number, beans: BeanRow[]): Promise<void> {
  await db.query('DELETE FROM cafe_visit_beans WHERE cafe_visit_id = $1', [visitId])
  const columns = BEAN_COLUMNS.map(([, column]) => column)
  for (const [position, bean] of beans.entries()) {
    await db.query(
      `INSERT INTO cafe_visit_beans (cafe_visit_id, position, ${columns.join(', ')}) VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(', ')})`,
      [visitId, position, ...BEAN_COLUMNS.map(([key]) => bean[key as keyof BeanRow] ?? null)],
    )
  }
}

const COPY_SUFFIX_RE = / \(복사(?: \d+)?\)$/

/** n번째 복사 제목. 제목 검증(UTF-16 길이 200)을 넘지 않도록 문자 단위로 잘라 서로게이트 쌍이 깨지지 않게 한다 */
function copyTitle(root: string, n: number): string {
  const suffix = n === 1 ? ' (복사)' : ` (복사 ${n})`
  let head = ''
  for (const char of root) {
    if (head.length + char.length + suffix.length > TITLE_MAX) break
    head += char
  }
  return head + suffix
}

export type ResourceRepo = {
  list(): Promise<Entity[]>
  get(id: number): Promise<Entity | null>
  create(data: Record<string, unknown>): Promise<Entity>
  /** 글을 복사해 새로 만든다(사진 제외, 제목에 ' (복사)' 계열 접미사). 원본이 없으면 null */
  copy(id: number): Promise<Entity | null>
  update(id: number, data: Record<string, unknown>): Promise<Entity | null>
  /** 삭제된 글에 붙어 있던 사진 행(파일 정리용). 글이 없으면 null */
  remove(id: number): Promise<PhotoRow[] | null>
}

export type Repos = Record<Kind, ResourceRepo>

export function createResourceRepo(pool: Pool, def: ResourceDef): ResourceRepo {
  // 테이블·컬럼 이름은 코드의 정의에서만 오므로 SQL에 직접 넣어도 안전하다
  const columns = columnsOf(def)
  const names = columns.map(([, column]) => column)
  const values = (data: Record<string, unknown>) => columns.map(([key]) => data[key] ?? null)

  async function hydrate(rows: Record<string, unknown>[]): Promise<Entity[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id as number)
    const { rows: photos } = await pool.query<PhotoRow>(
      `SELECT * FROM photos WHERE ${def.photoFk} = ANY($1::int[]) ORDER BY sort_order, id`,
      [ids],
    )
    const byOwner = new Map<number, PhotoRow[]>()
    for (const photo of photos) {
      const ownerId = photo[def.photoFk] as number
      const list = byOwner.get(ownerId) ?? []
      list.push(photo)
      byOwner.set(ownerId, list)
    }
    const beans = def.hasBeans ? await loadBeans(pool, ids) : new Map<number, BeanRow[]>()
    return rows.map((row) => toEntity(def, row, byOwner.get(row.id as number) ?? [], beans.get(row.id as number) ?? []))
  }

  const beansOf = (data: Record<string, unknown>) => (def.hasBeans ? ((data.beans as BeanRow[] | undefined) ?? []) : null)

  const insert = (db: Pick<Pool, 'query'>, data: Record<string, unknown>) =>
    db.query(
      `INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      values(data),
    )

  return {
    async list() {
      const { rows } = await pool.query(`SELECT * FROM ${def.table} ORDER BY id DESC`)
      return hydrate(rows)
    },

    async get(id) {
      const { rows } = await pool.query(`SELECT * FROM ${def.table} WHERE id = $1`, [id])
      const [entity] = await hydrate(rows)
      return entity ?? null
    },

    async create(data) {
      const beans = beansOf(data)
      const created = await withTransaction(pool, async (client) => {
        const { rows } = await insert(client, data)
        if (beans) await replaceBeans(client, rows[0].id, beans)
        return rows
      })
      const [entity] = await hydrate(created)
      return entity
    },

    async copy(id) {
      // 같은 종류의 복사는 직렬화해서, 제목을 고른 뒤 INSERT하기 전에 다른 복사가 끼어들지 못하게 한다
      return withTransaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`copy:${def.table}`])
        // 원본 방문을 잠가 원두 읽기·복사가 끝날 때까지 update/remove 가 끼어들지 못하게 한다 (advisory lock 다음 순서)
        const { rows } = await client.query(`SELECT * FROM ${def.table} WHERE id = $1 FOR UPDATE`, [id])
        if (rows.length === 0) return null
        const sourceBeans = def.hasBeans ? ((await loadBeans(client, [id])).get(id) ?? []) : []
        const source = toEntity(def, rows[0], [], sourceBeans)
        const fields: Record<string, unknown> = Object.fromEntries(allFields(def.sections).map((f) => [f.name, source[f.name]]))
        if (def.hasBeans) fields.beans = sourceBeans
        const titleColumn = toColumn(def.card.title)
        const root = String(source[def.card.title]).replace(COPY_SUFFIX_RE, '')
        let title = ''
        for (let n = 1; ; n += 1) {
          title = copyTitle(root, n)
          const { rowCount } = await client.query(`SELECT 1 FROM ${def.table} WHERE ${titleColumn} = $1 LIMIT 1`, [title])
          if (!rowCount) break
        }
        fields[def.card.title] = title
        const { rows: created } = await insert(client, { ...fields, ...def.derive(fields) })
        if (def.hasBeans) await replaceBeans(client, created[0].id, sourceBeans)
        return toEntity(def, created[0], [], sourceBeans)
      })
    },

    async update(id, data) {
      const sets = names.map((name, i) => `${name} = $${i + 1}`).join(', ')
      const beans = beansOf(data)
      const rows = await withTransaction(pool, async (client) => {
        const { rows: updated } = await client.query(
          `UPDATE ${def.table} SET ${sets}, updated_at = now() WHERE id = $${names.length + 1} RETURNING *`,
          [...values(data), id],
        )
        if (beans && updated.length > 0) await replaceBeans(client, id, beans)
        return updated
      })
      const [entity] = await hydrate(rows)
      return entity ?? null
    },

    async remove(id) {
      // 사진 조회와 삭제 사이에 사진이 추가·삭제되지 않도록 부모 행을 잠그고 한 트랜잭션에서 처리한다
      return withTransaction(pool, async (client) => {
        const { rowCount: found } = await client.query(`SELECT id FROM ${def.table} WHERE id = $1 FOR UPDATE`, [id])
        if (!found) return null
        const { rows: photos } = await client.query<PhotoRow>(`SELECT * FROM photos WHERE ${def.photoFk} = $1`, [id])
        await client.query(`DELETE FROM ${def.table} WHERE id = $1`, [id])
        return photos
      })
    },
  }
}

export function createRepos(pool: Pool): Repos {
  return { bean: createResourceRepo(pool, beanDef), cafe: createResourceRepo(pool, cafeVisitDef) }
}
