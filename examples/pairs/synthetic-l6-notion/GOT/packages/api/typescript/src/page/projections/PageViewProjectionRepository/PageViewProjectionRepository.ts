import type { Transaction } from '@template/core-typescript'
import type { PageViewProjection } from '../PageView'

/**
 * Read + projection-write surface for PageViewProjection.
 *
 * Canonical (mandatory) methods:
 *   - findByKey: read half of `find → applyEvent → save`
 *   - save:      write half (upsert by natural key — pageId)
 *   - insertIfNew: replay-safe creation (ON CONFLICT DO NOTHING)
 */
export abstract class PageViewProjectionRepository {
	// ── Canonical (always required) ──────────────────────────────────────
	abstract findByKey(pageId: string, tx?: Transaction): Promise<PageViewProjection | null>
	abstract save(projection: PageViewProjection, tx?: Transaction): Promise<void>
	abstract insertIfNew(projection: PageViewProjection, tx?: Transaction): Promise<boolean>
}
