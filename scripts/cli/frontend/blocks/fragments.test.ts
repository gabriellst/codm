import { describe, it, expect } from 'bun:test'
import { REPO } from '../../../../template.config'
import { renderBlock } from './fragments'
import { elementBlock } from './element'
import { skeletonBlock } from './skeleton'
import { queryBlock } from './query'
import { loadRecipe } from '../recipes'

const ctx = (over: Partial<Parameters<typeof queryBlock>[0]> = {}) => ({
	pascal: 'Order',
	camel: 'order',
	kebab: 'order',
	routePath: '(app)/orders',
	...over,
})

describe('renderBlock (fragment-sourced output)', () => {
	it('element: static React + cn imports from the fragment', () => {
		expect(renderBlock('element', 'react', {}).imports).toEqual(["import * as React from 'react'", "import { cn } from '@/lib/utils'"])
	})

	it('skeleton: imports + a data===undefined jsxBefore guard', () => {
		const out = renderBlock('skeleton', 'react', {})
		expect(out.imports).toEqual(["import { Skeleton } from '@/components/ui/skeleton'"])
		expect(out.jsxBefore).toContain('if (data === undefined)')
		expect(out.jsxBefore).toContain('<Skeleton className="h-8 w-full" />')
	})

	it('query: interpolates the computed hookName', () => {
		const out = renderBlock('query', 'react', { hookName: 'useListOrders' })
		expect(out.imports).toEqual([`import { useListOrders } from '${REPO.sdkSpecifier}'`])
		expect(out.hookCalls).toEqual(['const { data, isLoading } = useListOrders()'])
	})
})

describe('block fns still produce identical output via the fragment', () => {
	it('elementBlock unchanged', () => {
		expect(elementBlock(ctx())).toEqual({
			imports: ["import * as React from 'react'", "import { cn } from '@/lib/utils'"],
		})
	})
	it('queryBlock returns {} without sdk, wires the hook with sdk', () => {
		expect(queryBlock(ctx())).toEqual({})
		const out = queryBlock(ctx({ sdk: 'Order' }))
		expect(out.hookCalls).toEqual(['const { data, isLoading } = useListOrders()'])
	})
	it('skeletonBlock unchanged', () => {
		expect(skeletonBlock(ctx()).jsxBefore).toContain('if (data === undefined)')
	})
})

import { componentGenerator } from '../artifacts/component'

describe('assembler golden equivalence (pilot blocks)', () => {
	it('a query+skeleton section component is byte-identical to the captured baseline', async () => {
		const [file] = await componentGenerator(['(app)/orders', 'OrderList'], {
			recipe: 'section',
			sdk: 'Order',
			state: 'query',
			skeleton: 'true',
			'no-i18n-write': 'true',
			i18n: 'orders',
		})
		// Captured from the pre-migration assembler (Step: run once, commit fixture).
		const { readFileSync } = await import('node:fs')
		const golden = readFileSync(new URL('./__fixtures__/order-list.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})
})

describe('assembler golden equivalence (swept blocks T2)', () => {
	const { readFileSync } = require('node:fs')

	it('sdk: bare --sdk=X type import (product-detail-sdk)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductDetail'], {
			'no-i18n-write': 'true',
			sdk: 'Product',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-detail-sdk.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('variants: CVA variants declaration (product-card-variants)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductCard'], {
			'no-i18n-write': 'true',
			variants: 'size:sm,md,lg|tone:default,muted',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-card-variants.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('store: --state=store --store=Products (product-toolbar-store)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductToolbar'], {
			'no-i18n-write': 'true',
			state: 'store',
			store: 'Products',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-toolbar-store.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('search: --state=search (product-filter-search)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductFilter'], {
			'no-i18n-write': 'true',
			state: 'search',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-filter-search.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('labels: --labels --sdk=StatusEnum (product-status-labels)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductStatus'], {
			'no-i18n-write': 'true',
			labels: 'true',
			sdk: 'StatusEnum',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-status-labels.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('consts: --consts=maxItems=20;defaultSort=name (product-list-consts)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductList'], {
			'no-i18n-write': 'true',
			consts: 'maxItems=20;defaultSort=name',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-list-consts.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})

	it('i18n: section with --i18n=products (product-header-i18n)', async () => {
		const [file] = await componentGenerator(['(app)/products', 'ProductHeader'], {
			'no-i18n-write': 'true',
			recipe: 'section',
			i18n: 'products',
		})
		const golden = readFileSync(new URL('./__fixtures__/product-header-i18n.tsx.txt', import.meta.url), 'utf8')
		expect(file!.content).toBe(golden)
	})
})

describe('recipe = fragment-refs + host body', () => {
	it('section lists its block refs and a host body fragment', () => {
		const r = loadRecipe('section', 'react')
		expect(r.blocks).toEqual(['element', 'skeleton'])
		expect(r.host).toContain("t('{{i18nPrefix}}.title')")
	})
})
