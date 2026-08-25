// `--variants=<spec>` — CVA variants declaration with empty class stubs.
// The user fills in the actual Tailwind class strings after generation.
//
// Spec example:
//   --variants='size:sm,md,lg|tone:default,muted'
// Emits:
//   const fooVariants = cva('', {
//     variants: {
//       size: { sm: '', md: '', lg: '' },
//       tone: { default: '', muted: '' },
//     },
//     defaultVariants: { size: 'sm', tone: 'default' },
//   })

import type { BlockFn } from './types'
import { parseVariantSpec } from '../util/flags'
import { renderBlock } from './fragments'

export const variantsBlock: BlockFn = (ctx, value) => {
	const groups = parseVariantSpec(value)
	const variantsLines = Object.entries(groups)
		.map(([name, values]) => {
			const items = values.map(v => `\t\t\t${v}: '',`).join('\n')
			return `\t\t${name}: {\n${items}\n\t\t},`
		})
		.join('\n')
	const defaultLines = Object.entries(groups)
		.map(([name, values]) => `\t\t${name}: '${values[0]}',`)
		.join('\n')

	const inner =
		Object.keys(groups).length === 0
			? `\t\tvariants: {},\n\t\tdefaultVariants: {},`
			: `\t\tvariants: {\n${variantsLines}\n\t\t},\n\t\tdefaultVariants: {\n${defaultLines}\n\t\t},`

	const decl = `const ${ctx.camel}Variants = cva(
\t'',
\t{
${inner}
\t},
)`

	const fragment = renderBlock('variants', 'react', {})
	return {
		...fragment,
		declarations: [decl],
	}
}
