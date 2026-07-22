// Mobile CVA variants block. Same `class-variance-authority` API as the web
// stack — the difference is what the classes mean: on web they're Tailwind
// classes interpreted by the browser; on mobile they're uniwind classes
// interpreted by NativeWind/Uniwind at runtime. The block is the same.

import { parseVariantSpec } from '../util/flags'
import type { MobileBlockContext, MobileBlockOutput } from './types'

export function variantsBlock(ctx: MobileBlockContext, spec?: string): MobileBlockOutput {
	const parsed = parseVariantSpec(spec)
	const variantEntries = Object.entries(parsed)
	if (variantEntries.length === 0) {
		// Default scaffold — give the user a `variant` axis they can tweak.
		const decl = `const ${ctx.camel}Variants = cva('flex-row items-center', {
	variants: {
		variant: {
			default: '',
			secondary: '',
		},
	},
	defaultVariants: { variant: 'default' },
})`
		return {
			imports: [`import { cva, type VariantProps } from 'class-variance-authority'`],
			declarations: [decl],
		}
	}

	const variantBlock = variantEntries
		.map(([name, values]) => {
			const lines = values.map(v => `\t\t\t${v}: '',`).join('\n')
			return `\t\t${name}: {\n${lines}\n\t\t},`
		})
		.join('\n')
	const defaults = variantEntries.map(([name, values]) => `${name}: '${values[0]}'`).join(', ')
	const decl = `const ${ctx.camel}Variants = cva('flex-row items-center', {
	variants: {
${variantBlock}
	},
	defaultVariants: { ${defaults} },
})`

	return {
		imports: [`import { cva, type VariantProps } from 'class-variance-authority'`],
		declarations: [decl],
	}
}
