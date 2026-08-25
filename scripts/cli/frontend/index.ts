// Frontend CLI dispatch registry. Imported by scripts/cli.ts and merged into the
// top-level `generators` record.

import type { Generator } from '../types'
import { i18nGenerator } from './artifacts/i18n'
import { routeGenerator } from './artifacts/route'
import { componentGenerator } from './artifacts/component'
import { dialogGenerator } from './artifacts/dialog'
import { formGenerator } from './artifacts/form'
import { onboardingStepGenerator } from './artifacts/onboarding-step'
import { onboardingWizardGenerator } from './artifacts/onboarding-wizard'
import { maskGenerator } from './artifacts/mask'
import { storeGenerator } from './artifacts/store'
import { primitiveGenerator } from './artifacts/primitive'

export const frontendGenerators: Record<string, Generator> = {
	i18n: i18nGenerator,
	route: routeGenerator,
	component: componentGenerator,
	dialog: dialogGenerator,
	form: formGenerator,
	'onboarding-step': onboardingStepGenerator,
	'onboarding-wizard': onboardingWizardGenerator,
	mask: maskGenerator,
	store: storeGenerator,
	primitive: primitiveGenerator,
}

export function isFrontendVerb(verb: string): boolean {
	return verb in frontendGenerators
}
