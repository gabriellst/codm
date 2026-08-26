// `bun cli primitive <name>` — CVA-based UI primitive template.

import type { Generator } from '../../types'
import { toPascalCase } from '../util/naming'

function template(name: string): string {
	const pascal = toPascalCase(name)
	const lower = name.toLowerCase()

	return `import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

const ${lower}Variants = cva(
	'inline-flex items-center',
	{
		variants: {
			variant: {
				default: '',
				secondary: '',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
)

interface ${pascal}Props
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof ${lower}Variants> {}

export const ${pascal} = React.forwardRef<HTMLDivElement, ${pascal}Props>(
	function ${pascal}({ className, variant, ...props }, ref) {
		return (
			<div
				ref={ref}
				className={cn(${lower}Variants({ variant }), className)}
				data-slot="${lower}"
				{...props}
			/>
		)
	},
)
${pascal}.displayName = '${pascal}'
`
}

export const primitiveGenerator: Generator = pos => {
	const [name] = pos
	if (!name) {
		console.error('primitive <name>')
		process.exit(1)
	}
	const lower = name.toLowerCase()
	return [
		{
			filePath: `packages/app/ui/src/components/${lower}.tsx`,
			content: template(name),
		},
	]
}
