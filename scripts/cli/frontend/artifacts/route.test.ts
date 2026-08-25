// scripts/cli/frontend/artifacts/route.test.ts
import { describe, expect, it } from 'bun:test'
import { routeGenerator } from './route'

// `no-i18n-write` evita side effects de locale nos testes; flags booleanas chegam como 'true'.
const base = { i18n: 'products', 'no-i18n-write': 'true' }

describe('routeGenerator --loader', () => {
	it('deriva o queryOptions do --extend e emite loaderDeps + ensureQueryData', async () => {
		const files = await routeGenerator(['(app)/products'], {
			...base,
			extend: 'listProductsQueryParamsSchema',
			loader: 'true',
		})
		const content = files[0].content
		expect(content).toContain('loaderDeps: ({ search }) => search,')
		expect(content).toContain(
			'await context.queryClient.ensureQueryData(listProductsQueryOptions({ params: deps })).catch(() => null)',
		)
		expect(content).toContain('listProductsQueryOptions,')
	})

	it('usa o nome explícito de --loader=<name> em vez da derivação', async () => {
		const files = await routeGenerator(['(app)/products'], {
			...base,
			extend: 'listProductsQueryParamsSchema',
			loader: 'getProductBoardQueryOptions',
		})
		const content = files[0].content
		expect(content).toContain('getProductBoardQueryOptions({ params: deps })')
		expect(content).not.toContain('listProductsQueryOptions')
	})

	it('emite loader por path param no --detail (nome explícito obrigatório), sem loaderDeps', async () => {
		const files = await routeGenerator(['(app)/products/$productId'], {
			...base,
			detail: 'true',
			loader: 'getProductDetailsQueryOptions',
		})
		const content = files[0].content
		expect(content).toContain('getProductDetailsQueryOptions({ productId: params.productId })')
		expect(content).toContain('.catch(() => null)')
		expect(content).not.toContain('loaderDeps')
	})

	it('não emite loader sem a flag', async () => {
		const files = await routeGenerator(['(app)/products'], {
			...base,
			extend: 'listProductsQueryParamsSchema',
		})
		expect(files[0].content).not.toContain('loader')
	})
})
