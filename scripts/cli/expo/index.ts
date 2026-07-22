// Expo CLI dispatch registry. Imported by scripts/cli.ts and used for the
// platform-aware verbs (`route`, `component`, `primitive`, `form`) when the
// active platform resolves to `expo`, plus the expo-only `sheet` verb.

import type { Generator } from '../types'
import { routeGenerator } from './artifacts/route'
import { componentGenerator } from './artifacts/component'
import { primitiveGenerator } from './artifacts/primitive'
import { formGenerator } from './artifacts/form'
import { sheetGenerator } from './artifacts/sheet'

export const expoGenerators: Record<string, Generator> = {
	route: routeGenerator,
	component: componentGenerator,
	primitive: primitiveGenerator,
	form: formGenerator,
	sheet: sheetGenerator,
}

export function isExpoVerb(verb: string): boolean {
	return verb in expoGenerators
}
