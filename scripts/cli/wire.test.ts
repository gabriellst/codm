import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { backendGenerators } from './backend/typescript'
import type { GeneratedFile } from './types'
import { insertExportLine, isWirable, wireGeneratedFile, type WireStatus } from './wire'

describe('insertExportLine', () => {
	it('appends after a comment-only barrel (context bootstrap shape)', () => {
		const { content, changed } = insertExportLine(
			'// Export controllers using named exports\n',
			"export { CreateOrderController } from './CreateOrder'",
		)
		expect(changed).toBe(true)
		expect(content).toBe("// Export controllers using named exports\nexport { CreateOrderController } from './CreateOrder'\n")
	})

	it('creates content from an empty barrel', () => {
		const { content, changed } = insertExportLine('', "export { Order } from './Order'")
		expect(changed).toBe(true)
		expect(content).toBe("export { Order } from './Order'\n")
	})

	it('is idempotent on the exact line', () => {
		const barrel = "export { Order } from './Order'\n"
		const { content, changed } = insertExportLine(barrel, "export { Order } from './Order'")
		expect(changed).toBe(false)
		expect(content).toBe(barrel)
	})

	it('is idempotent when the same module specifier is already re-exported (hand-edited barrel)', () => {
		const barrel = "export { Order, type OrderProps } from './Order'\n"
		const { changed } = insertExportLine(barrel, "export { Order } from './Order'")
		expect(changed).toBe(false)
	})

	it('inserts in sort position when the barrel is sorted', () => {
		const barrel = ["export { AController } from './A'", "export { CController } from './C'", "export { DController } from './D'", ''].join(
			'\n',
		)
		const { content, changed } = insertExportLine(barrel, "export { BController } from './B'")
		expect(changed).toBe(true)
		expect(content).toBe(
			[
				"export { AController } from './A'",
				"export { BController } from './B'",
				"export { CController } from './C'",
				"export { DController } from './D'",
				'',
			].join('\n'),
		)
	})

	it('appends at the end when the barrel is unsorted (preserves author order)', () => {
		const barrel = ["export { CreateProductController } from './CreateProduct'", "export { AddTagController } from './AddTag'", ''].join(
			'\n',
		)
		const { content, changed } = insertExportLine(barrel, "export { BulkImportController } from './BulkImport'")
		expect(changed).toBe(true)
		expect(content).toBe(
			[
				"export { CreateProductController } from './CreateProduct'",
				"export { AddTagController } from './AddTag'",
				"export { BulkImportController } from './BulkImport'",
				'',
			].join('\n'),
		)
	})

	it('keeps leading comments intact on sorted insert', () => {
		const barrel = [
			'// Internal handlers — subscribe to in-process domain events.',
			"export * from './AEvent'",
			"export * from './CEvent'",
			'',
		].join('\n')
		const { content } = insertExportLine(barrel, "export * from './BEvent'")
		expect(content).toBe(
			[
				'// Internal handlers — subscribe to in-process domain events.',
				"export * from './AEvent'",
				"export * from './BEvent'",
				"export * from './CEvent'",
				'',
			].join('\n'),
		)
	})
})

describe('isWirable', () => {
	it('accepts an export statement targeting a TS barrel', () => {
		expect(
			isWirable({ filePath: 'x', content: '', exportLine: "export { X } from './X'", exportTarget: 'src/ctx/controllers/index.ts' }),
		).toBe(true)
	})
	it('rejects comment hints (repository registry.ts binding)', () => {
		expect(
			isWirable({ filePath: 'x', content: '', exportLine: '// Register in context registry.ts ...', exportTarget: 'src/ctx/registry.ts' }),
		).toBe(false)
	})
	it('rejects non-TS targets (Go module.go fx wiring)', () => {
		expect(
			isWirable({ filePath: 'x', content: '', exportLine: 'fx.Provide(usecases.NewXHandler),', exportTarget: 'internal/ctx/module.go' }),
		).toBe(false)
	})
	it('rejects files without export hints (colocated tests)', () => {
		expect(isWirable({ filePath: 'x', content: '' })).toBe(false)
	})
})

describe('wireGeneratedFile (scaffold into a temp fixture tree)', () => {
	let root: string

	const CTX_BASE = 'packages/api/typescript/src/billing'

	// Mirror what `bun cli context` bootstraps for the barrels we exercise.
	const seedContext = async () => {
		const seed: Record<string, string> = {
			[`${CTX_BASE}/controllers/index.ts`]: '// Export controllers using named exports\n',
			[`${CTX_BASE}/handlers/internal.ts`]: '// Export internal handlers here\n',
			[`${CTX_BASE}/handlers/external.ts`]: '// Export external handlers here\n',
		}
		for (const [path, content] of Object.entries(seed)) {
			await mkdir(join(root, dirname(path)), { recursive: true })
			await writeFile(join(root, path), content)
		}
	}

	const scaffoldAndWire = async (
		verb: string,
		pos: string[],
		flags: Record<string, string> = {},
	): Promise<{ files: GeneratedFile[]; statuses: WireStatus[] }> => {
		const generator = backendGenerators[verb]
		if (!generator) throw new Error(`No generator for verb: ${verb}`)
		const files = await generator(pos, flags)
		const statuses: WireStatus[] = []
		for (const f of files) {
			await mkdir(join(root, dirname(f.filePath)), { recursive: true })
			await writeFile(join(root, f.filePath), f.content)
			statuses.push(await wireGeneratedFile(f, root))
		}
		return { files, statuses }
	}

	const barrel = (path: string) => readFile(join(root, path), 'utf8')

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'cli-wire-'))
		await seedContext()
	})

	afterEach(async () => {
		await rm(root, { recursive: true, force: true })
	})

	it('controller: export lands in controllers/index.ts and re-run is idempotent', async () => {
		const first = await scaffoldAndWire('controller', ['billing', 'CreateInvoice'])
		expect(first.statuses).toEqual(['wired'])
		const after = await barrel(`${CTX_BASE}/controllers/index.ts`)
		expect(after).toBe("// Export controllers using named exports\nexport { CreateInvoiceController } from './CreateInvoice'\n")

		const second = await scaffoldAndWire('controller', ['billing', 'CreateInvoice'])
		expect(second.statuses).toEqual(['already-wired'])
		expect(await barrel(`${CTX_BASE}/controllers/index.ts`)).toBe(after)
	})

	it('handler: internal goes to handlers/internal.ts, external to handlers/external.ts', async () => {
		const internal = await scaffoldAndWire('handler', ['billing', 'InvoicePaid'])
		// Colocated .test.ts has no export hint → skipped.
		expect(internal.statuses).toEqual(['wired', 'skipped'])
		expect(await barrel(`${CTX_BASE}/handlers/internal.ts`)).toContain("export { InvoicePaidHandler } from './InvoicePaidHandler'")
		expect(await barrel(`${CTX_BASE}/handlers/external.ts`)).not.toContain('InvoicePaidHandler')

		const external = await scaffoldAndWire('handler', ['billing', 'OrderShipped'], { external: 'true' })
		expect(external.statuses).toEqual(['wired', 'skipped'])
		expect(await barrel(`${CTX_BASE}/handlers/external.ts`)).toContain("export { OrderShippedHandler } from './OrderShippedHandler'")
		expect(await barrel(`${CTX_BASE}/handlers/internal.ts`)).not.toContain('OrderShippedHandler')

		const again = await scaffoldAndWire('handler', ['billing', 'InvoicePaid'])
		expect(again.statuses).toEqual(['already-wired', 'skipped'])
	})

	it('projector: creates projections/projectors/index.ts when absent', async () => {
		const { statuses } = await scaffoldAndWire('projector', ['billing', 'Invoice'])
		expect(statuses).toEqual(['wired'])
		expect(await barrel(`${CTX_BASE}/projections/projectors/index.ts`)).toBe("export * from './InvoiceProjector'\n")

		const again = await scaffoldAndWire('projector', ['billing', 'Invoice'])
		expect(again.statuses).toEqual(['already-wired'])
	})

	it('projection: both export lines land in projections/index.ts', async () => {
		const { statuses } = await scaffoldAndWire('projection', ['billing', 'Invoice'])
		expect(statuses).toEqual(['wired', 'wired'])
		const content = await barrel(`${CTX_BASE}/projections/index.ts`)
		expect(content).toContain("from './Invoice'")
		expect(content).toContain("from './InvoiceProjectionRepository'")
	})

	it('repository: abstract export is wired, Drizzle registry.ts hint stays manual', async () => {
		const { statuses } = await scaffoldAndWire('repository', ['billing', 'Invoice'])
		// [abstract → wired, drizzle hint → skipped, colocated test → skipped]
		expect(statuses).toEqual(['wired', 'skipped', 'skipped'])
		expect(await barrel(`${CTX_BASE}/repositories/index.ts`)).toContain("export * from './InvoiceRepository'")
		// registry.ts must not be created/touched by wiring.
		await expect(readFile(join(root, `${CTX_BASE}/registry.ts`), 'utf8')).rejects.toThrow()
	})
})
