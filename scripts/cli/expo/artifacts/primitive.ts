// `bun cli primitive <Name>` (mobile) — CVA-based RN design-system primitive.
// Output lives at `packages/app/expo/components/ui/<Name>.tsx` (PascalCase file
// name, matching the existing primitives in that folder).
//
// Shape and snippet sourced from berzerk-club/feat/training-collaboration's real
// expo patterns. The majority of primitives there (Separator, Eyebrow, Input,
// CardHeader, …) are plain `export function` — `forwardRef` is reserved for the
// interactive few (Button, Card, Pill, GradientCard, StatCard) that get composed
// with `Animated.createAnimatedComponent`. Defaulting to plain matches both that
// majority and the expo `component` generator (commit 2abe087c5).
//
// Flags:
//   --variants=<spec>   CVA variant axes (variant:default,secondary|size:sm,md)
//   --with-ref          Wrap in `forwardRef<View, Props>` for interactive primitives
//                       (Button, Card, Pill, anything composed with Animated).
//
// Canonical shell lives in .claude/skills/primitive/expo/registry.yaml under
// snippet.skeleton (plain default) and snippet.skeletons.with-ref (opt-in).

import type { Generator } from '../../types'
import { renderArtifact } from '../../snippet/render'
import { parseVariantSpec, readValue } from '../util/flags'
import { toCamelCase, toPascalCase } from '../util/naming'

export const primitiveGenerator: Generator = (pos, flags) => {
	const [rawName] = pos
	if (!rawName) {
		console.error('primitive <Name> [--variants=<spec>] [--with-ref]')
		process.exit(1)
	}

	const pascal = toPascalCase(rawName)
	const camel = toCamelCase(rawName)

	// `--with-ref` opts into the `forwardRef<View, Props>` shape for primitives
	// that need ref forwarding (animated composition, focus management). Default
	// is the plain `export function` shape — matches berzerk's majority pattern
	// and the expo component generator's berzerk-style port.
	const withRef = flags['with-ref'] === 'true'

	const variantsSpec = readValue(flags, 'variants')
	const variantsParsed = variantsSpec ? parseVariantSpec(variantsSpec) : { variant: ['default', 'secondary'] }
	const variantEntries = Object.entries(variantsParsed)
	const variantBlock = variantEntries
		.map(([name, values]) => {
			const lines = values.map(v => `\t\t\t${v}: '',`).join('\n')
			return `\t\t${name}: {\n${lines}\n\t\t},`
		})
		.join('\n')
	const defaults = variantEntries.map(([name, values]) => `${name}: '${values[0]}'`).join(', ')

	const variantPropKeys = variantEntries.map(([name]) => name).join(', ')
	const variantsCall = `${camel}Variants({ ${variantPropKeys} })`

	const imports = withRef
		? `import { forwardRef } from 'react'\nimport { View, type ViewProps } from 'react-native'\nimport { cva, type VariantProps } from 'class-variance-authority'\nimport { cn } from '@/lib/utils'`
		: `import { View, type ViewProps } from 'react-native'\nimport { cva, type VariantProps } from 'class-variance-authority'\nimport { cn } from '@/lib/utils'`

	// Delegate to the canonical snippet at .claude/skills/primitive/expo/registry.yaml.
	// Bindings: assembler computes the runtime-varying parts, the snippet owns shape.
	// Default snippet is the plain `export function` shape; `--with-ref` selects
	// the `forwardRef<View, Props>` skeletons.with-ref variant.
	const content = renderArtifact('primitive', 'expo', {
		...(withRef ? { _variant: 'with-ref' } : {}),
		imports,
		Pascal: pascal,
		camel,
		variantBlock,
		defaults,
		variantPropKeys,
		variantsCall,
	})

	return [
		{
			filePath: `packages/app/expo/components/ui/${pascal}.tsx`,
			content,
		},
	]
}
