// `bun cli store <Name> [--global]` — Zustand store template.

import type { Generator } from '../../types'
import { toPascalCase } from '../util/naming'

function template(name: string): string {
	const pascal = toPascalCase(name)

	return `import { create } from 'zustand'

interface ${pascal}State {
	// UI-only state (not URL-worthy — use search params for shareable state)
	selectedId: string | null
	isOpen: boolean
}

interface ${pascal}Actions {
	setSelectedId: (id: string | null) => void
	setIsOpen: (open: boolean) => void
	reset: () => void
}

type ${pascal}Store = ${pascal}State & ${pascal}Actions

const initialState: ${pascal}State = {
	selectedId: null,
	isOpen: false,
}

export const use${pascal}Store = create<${pascal}Store>()(set => ({
	...initialState,
	setSelectedId: (id: string | null) => set({ selectedId: id }),
	setIsOpen: (open: boolean) => set({ isOpen: open }),
	reset: () => set(initialState),
}))
`
}

export const storeGenerator: Generator = pos => {
	const [name] = pos
	if (!name) {
		console.error('store <name> [--global]')
		process.exit(1)
	}
	const pascal = toPascalCase(name)
	// Note: --global was previously a flag but both paths went to the same place,
	// so it's a no-op preserved for backward compat.
	return [
		{
			filePath: `packages/app/react/src/stores/use${pascal}Store.ts`,
			content: template(name),
		},
	]
}
