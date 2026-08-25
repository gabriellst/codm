import { describe, expect, test } from 'bun:test'

import { ROOT } from '../../.claude/hooks/classify-edit-core'
import { defaultTargets, ruleInventory, scanContent } from './registry-scan'

// Routes to skill `component` (lang react) via the components index:
// packages/app/react/src/routes/**/-components/*/index.tsx
const COMPONENT_PATH = 'packages/app/react/src/routes/(app)/overview/-components/StatusCard/index.tsx'

// Canonical ComponentProps shape (so bp-20 stays silent) with exactly two violations:
// lucide-react import (component#bp-03) + hardcoded hex (component#bp-06).
const BAD_COMPONENT = `import type { ComponentProps } from 'react'

import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

export function StatusCard({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('p-4', className)} style={{ color: '#16a34a' }} {...props}>
			<Search />
		</div>
	)
}
`

const CLEAN_COMPONENT = `import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function StatusCard({ className, ...props }: ComponentProps<'div'>) {
	return <div className={cn('bg-primary text-primary-foreground', className)} {...props} />
}
`

describe('scanContent', () => {
	test('known-bad react component yields exactly the hex + lucide ruleIds', () => {
		const findings = scanContent(COMPONENT_PATH, BAD_COMPONENT)

		expect(findings.map(f => f.ruleId).sort()).toEqual(['bp-03', 'bp-06'])

		const lucide = findings.find(f => f.ruleId === 'bp-03')
		expect(lucide?.detector).toBe('registry-scan')
		expect(lucide?.source).toBe('component#bp-03')
		expect(lucide?.severity).toBe('error') // registry severity critical → error
		expect(lucide?.line).toBe(3)
		expect(lucide?.excerpt).toContain('lucide-react')

		const hex = findings.find(f => f.ruleId === 'bp-06')
		expect(hex?.source).toBe('component#bp-06')
		expect(hex?.severity).toBe('warning') // registry severity moderate → warning
		expect(hex?.line).toBe(9)
		expect(hex?.excerpt).toContain('#16a34a')
		expect(hex?.file).toBe(COMPONENT_PATH)
	})

	test('clean component content yields no findings', () => {
		expect(scanContent(COMPONENT_PATH, CLEAN_COMPONENT)).toEqual([])
	})

	test('skill-unmatched file still gets the universal set (as any → error)', () => {
		const findings = scanContent('packages/app/react/src/lib/probe.ts', 'const x = 1 as any\n')
		expect(findings).toHaveLength(1)
		expect(findings[0].source).toBe('universal#as-any')
		expect(findings[0].severity).toBe('error')
		expect(findings[0].line).toBe(1)
	})

	test('sanctioned cast (as const) stays silent via detect_skip', () => {
		expect(scanContent('packages/app/react/src/lib/probe.ts', "const x = ['a'] as const\n")).toEqual([])
	})

	test('absolute paths normalize to repo-relative in findings', () => {
		const abs = `${ROOT}/${COMPONENT_PATH}`
		const findings = scanContent(abs, BAD_COMPONENT)
		expect(findings.length).toBeGreaterThan(0)
		for (const f of findings) expect(f.file).toBe(COMPONENT_PATH)
	})
})

describe('defaultTargets', () => {
	// Regression guard for the RED GATE: the tracked file list under packages/ (2.47 MiB, ~24k
	// paths) exceeds execSync's 1 MiB default maxBuffer, which used to ENOBUFS-crash the whole
	// `bun detect` gate before it scanned a single file. defaultTargets now passes maxBuffer:
	// 64 MiB. This invokes the real full-repo entrypoint so the crash cannot silently reappear —
	// the old code threw here; the assertion is that it no longer does. (The real CLI run,
	// `bun scripts/detectors/registry-scan.ts`, is the end-to-end proof it completes.)
	test('git ls-files entrypoint runs to completion without throwing', () => {
		expect(() => defaultTargets()).not.toThrow()
		expect(Array.isArray(defaultTargets())).toBe(true)
	})
})

describe('ruleInventory', () => {
	test('compiles the universal set plus per-skill mechanical rules', () => {
		const inventory = ruleInventory()
		expect(inventory.length).toBeGreaterThan(10)

		const asAny = inventory.find(r => r.skill === 'universal' && r.id === 'as-any')
		expect(asAny?.regexCount).toBe(1)

		// component/react bp-06 has two detect regexes (tailwind palette + hex).
		const hex = inventory.find(r => r.skill === 'component' && r.id === 'bp-06')
		expect(hex?.regexCount).toBe(2)
	})
})
