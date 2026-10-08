import type { Pool } from 'pg'
import { withTransaction } from './db.js'
import { beanDef, cafeVisitDef, columnsOf, toEntity, type Entity, type Kind, type PhotoRow, type ResourceDef } from './resources.js'

export type ResourceRepo = {
  list(): Promise<Entity[]>
  get(id: number): Promise<Entity | null>
  create(data: Record<string, unknown>): Promise<Entity>
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
    return rows.map((row) => toEntity(def, row, byOwner.get(row.id as number) ?? []))
  }

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
      const params = names.map((_, i) => `$${i + 1}`).join(', ')
      const { rows } = await pool.query(
        `INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${params}) RETURNING *`,
        values(data),
      )
      const [entity] = await hydrate(rows)
      return entity
    },

    async update(id, data) {
      const sets = names.map((name, i) => `${name} = $${i + 1}`).join(', ')
      const { rows } = await pool.query(
        `UPDATE ${def.table} SET ${sets}, updated_at = now() WHERE id = $${names.length + 1} RETURNING *`,
        [...values(data), id],
      )
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
