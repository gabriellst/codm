import { describe, it, expect } from 'bun:test'
import { REPO } from '../../../../template.config'
import { renderBlock } from './fragments'
import { elementBlock } from './element'
import { skeletonBlock } from './skeleton'
import { queryBlock } from './query'
import { composerBlock } from './composer'
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

describe('composer block', () => {
	// `interpolate` throws on ANY unbound placeholder, so the fragment's three bindings are all passed
	// here — the block fn is what derives `mutationVar` from `mutationHook` (asserted further down).
	const bindings = { mutationHook: 'useSteerIssue', mutationVar: 'steerIssue', i18nPrefix: 'session' }

	it('imports the textarea, the button, the arrow icon and the mutation hook from the SDK', () => {
		expect(renderBlock('composer', 'react', bindings).imports).toEqual([
			"import { useState } from 'react'",
			"import { IconArrowUp } from '@tabler/icons-react'",
			`import { useSteerIssue } from '${REPO.sdkSpecifier}'`,
			"import { Button } from '@/components/ui/button'",
			"import { Textarea } from '@/components/ui/textarea'",
		])
	})

	it('the textarea sends on Enter and breaks a line on Shift+Enter', () => {
		const { jsxBody } = renderBlock('composer', 'react', bindings)
		expect(jsxBody).toContain("e.key === 'Enter' && !e.shiftKey")
		expect(jsxBody).toContain('e.preventDefault()')
		expect(jsxBody).toContain('onClick={send}')
	})

	// `send()` closes over `text`/`setText`, so it ships as `jsxBefore` (inside the component fn body,
	// where `skeleton` already puts its guard) and NOT as `declarations` — those are emitted at module
	// top level, where `text` does not exist.
	it('send() guards on empty text AND on the in-flight mutation — the double-send trap', () => {
		const out = renderBlock('composer', 'react', bindings)
		expect(out.hookCalls).toEqual(["const [text, setText] = useState('')", 'const steerIssue = useSteerIssue()'])
		expect(out.jsxBefore).toContain('const trimmed = text.trim()')
		expect(out.jsxBefore).toContain('if (!trimmed || steerIssue.isPending) return')
	})
})

describe('block fns still produce identical output via the fragment', () => {
	it('composerBlock returns {} without a mutation hook, and derives mutationVar with it', () => {
		expect(composerBlock(ctx())).toEqual({})
		const out = composerBlock(ctx({ mutationHook: 'useSteerIssue', i18nPrefix: 'session' }))
		expect(out.hookCalls).toContain('const steerIssue = useSteerIssue()')
		expect(out.jsxBody).toContain("t('session.placeholder')")
	})

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

describe('assembler golden equivalence (composer block)', () => {
	const { readFileSync } = require('node:fs')

	// The golden is the FALSIFIER of the wiring, not just of the strings: `--mutation=<Hook>` has to
	// activate the block AND the block's jsxBody has to reach the emitted root element. A fragment that
	// renders perfectly in isolation and never lands in the file would pass every assert above.
	it('mutation: --mutation=useSteerThread --i18n=session (thread-composer)', async () => {
		const [file] = await componentGenerator(['(app)/threads/$threadId', 'ThreadComposer'], {
			'no-i18n-write': 'true',
			mutation: 'useSteerThread',
			i18n: 'session',
		})
		const golden = readFileSync(new URL('./__fixtures__/thread-composer.tsx.txt', import.meta.url), 'utf8')
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
