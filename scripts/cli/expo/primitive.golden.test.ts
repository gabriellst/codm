// Golden tests for the expo `bun cli primitive` output. The shape was rewritten
// to match berzerk-club/feat/training-collaboration's real expo conventions —
// plain `export function` is the default (matches Separator, Eyebrow, Input,
// CardHeader, ...); `--with-ref` opts into `forwardRef<View, Props>` for the
// interactive few (Button, Card, Pill, GradientCard, StatCard — anything
// composed with `Animated.createAnimatedComponent`). Each captured fixture is
// the regression guard for that shape going forward.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { primitiveGenerator } from './artifacts/primitive'

const FIX = join(import.meta.dir, '__fixtures__')
const golden = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('expo primitive generator — berzerk-style output (rendered via registry snippet)', () => {
	it('default: plain `export function`, no forwardRef, no React import', async () => {
		const [file] = await primitiveGenerator(['Spacer'], {})
		expect(file!.content).toBe(golden('primitive.plain.txt'))
		// Spot-check the shape contract:
		expect(file!.content).toContain('export function Spacer({ className, variant, ...props }: SpacerProps)')
		expect(file!.content).not.toContain('forwardRef')
		expect(file!.content).not.toContain(`from 'react'`)
		expect(file!.filePath).toBe('packages/app/expo/components/ui/Spacer.tsx')
	})

	it('--with-ref: forwardRef<View, Props> shape for interactive primitives', async () => {
		const [file] = await primitiveGenerator(['Badge'], { 'with-ref': 'true' })
		expect(file!.content).toBe(golden('primitive.with-ref.txt'))
		expect(file!.content).toContain(`import { forwardRef } from 'react'`)
		expect(file!.content).toContain('export const Badge = forwardRef<View, BadgeProps>(function Badge(')
	})

	it('multi-axis variants: variant + size compose into the cva block + props', async () => {
		const [file] = await primitiveGenerator(['Pill'], { variants: 'variant:default,success,warning|size:sm,md' })
		expect(file!.content).toBe(golden('primitive.multi-variant.txt'))
		// Both axes appear in destructure and in the cva call:
		expect(file!.content).toContain('export function Pill({ className, variant, size, ...props }: PillProps)')
		expect(file!.content).toContain('pillVariants({ variant, size })')
		expect(file!.content).not.toContain('forwardRef')
	})
})
