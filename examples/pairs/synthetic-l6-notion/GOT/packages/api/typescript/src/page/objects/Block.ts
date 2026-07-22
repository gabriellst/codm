import { z } from '@template/core-typescript'
import Z from 'zod'
import { BlockType } from '@template/contracts-typescript/wire/enums'

/**
 * Block is a recursive composite VALUE OBJECT modelling a typed content node in a
 * page tree. It is NOT an aggregate — no repository, use case, controller, or event.
 * The Page aggregate owns the whole tree and enforces its invariant (only TOGGLE
 * blocks may contain children). Blocks are plain records.
 */
export type BlockProps = {
	id: string
	type: BlockType
	content: string
	order: number
	children: BlockProps[]
}

// Recursive schema — z.lazy defers the self-reference so the tree validates at parse time.
export const BlockSchema: Z.ZodType<BlockProps> = z.lazy(() =>
	z.object({
		id: z.uuid(),
		type: z.enum(BlockType),
		content: z.string(),
		order: z.number().int().nonnegative(),
		children: z.array(BlockSchema),
	}),
) as Z.ZodType<BlockProps>

export const isContainer = (type: BlockType): boolean => type === BlockType.TOGGLE

export function findBlock(blocks: BlockProps[], id: string): BlockProps | undefined {
	for (const block of blocks) {
		if (block.id === id) return block
		const found = findBlock(block.children, id)
		if (found) return found
	}
	return undefined
}

/** Preorder flatten into adjacency rows for DB insertion (pageId attached by the repo). */
export function flattenTree(
	blocks: BlockProps[],
	parentBlockId: string | null,
): Array<{ id: string; parentBlockId: string | null; type: BlockType; content: string; position: number }> {
	const rows: Array<{ id: string; parentBlockId: string | null; type: BlockType; content: string; position: number }> = []
	for (const block of blocks) {
		rows.push({ id: block.id, parentBlockId, type: block.type, content: block.content, position: block.order })
		if (block.children.length > 0) rows.push(...flattenTree(block.children, block.id))
	}
	return rows
}

/** Rebuild a nested tree from adjacency rows, ordering children by position. */
export function buildTree(
	rows: Array<{ id: string; parentBlockId: string | null; type: BlockType; content: string; position: number }>,
): BlockProps[] {
	const childrenByParent = new Map<string | null, typeof rows>()
	for (const row of rows) {
		const siblings = childrenByParent.get(row.parentBlockId)
		if (siblings) siblings.push(row)
		else childrenByParent.set(row.parentBlockId, [row])
	}
	function buildChildren(parentId: string | null): BlockProps[] {
		const children = childrenByParent.get(parentId) ?? []
		children.sort((a, b) => a.position - b.position)
		return children.map(row => ({ id: row.id, type: row.type, content: row.content, order: row.position, children: buildChildren(row.id) }))
	}
	return buildChildren(null)
}
