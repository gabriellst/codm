// `bun cli onboarding-wizard <Name> --union=<sdkUnionSchema> --mode-enum=<Enum> --i18n=<prefix>`
//
// Emits the wizard ORCHESTRATION SPINE — the part measured NOT to transfer from prose
// (form FRM-P13/P15/P18/P43 failed 5 of 6 agent samples while the steps themselves were
// canonical). The spine is exactly the machinery that makes the union-typed parent form
// TRACTABLE; hand-rolling it lands in Partial<Union> type hell:
//   - `_infer<Name>Form` uncalled-fn typing trick → the accumulated form type (FRM-P18)
//   - const-asserted step tuples in a `Record<Mode, …>` sequence map (FRM-P13)
//   - `setFieldValue` merging of validated step output (FRM-P15)
//   - final `pickUnionVariant(...).safeParse` gate before submission (FRM-P43)
//   - step dispatch by map — no switch chains (CMP-P18)
// Steps themselves come from `bun cli onboarding-step`.

import { REPO } from '../../../../template.config'
import type { Generator } from '../../types'
import { writeI18n } from './i18n'
import { toPascalCase } from '../util/naming'
import { readValue, requireValue } from '../util/flags'

export const onboardingWizardGenerator: Generator = async (pos, flags) => {
	const [rawName] = pos
	if (!rawName) {
		console.error('onboarding-wizard <Name> --union=<sdkUnionSchema> --mode-enum=<Enum> --i18n=<prefix>')
		process.exit(1)
	}
	const union = requireValue(flags, 'union', 'onboarding-wizard')
	const modeEnum = requireValue(flags, 'mode-enum', 'onboarding-wizard')
	const i18nPrefix = readValue(flags, 'i18n') ?? 'onboarding'

	const pascal = toPascalCase(rawName)
	const file = `packages/app/react/src/routes/onboarding/-components/${pascal}Wizard/index.tsx`

	const content = `// SEEDED CANONICAL SPINE — complete the TODOs; do NOT rewrite or delete this file.
// The _infer typing, sequence Record, setFieldValue merging and pickUnionVariant gate
// are the measured-canonical machinery (form FRM-P13/15/18/43).
import { useState, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { ${union}, ${modeEnum}Enum, type ${modeEnum} } from '${REPO.sdkSpecifier}'
import { pickUnionVariant } from '@/lib/union'
import type { DeepPartial } from '@/lib'
import { useTranslation } from 'react-i18next'

// ─── Step sequences — const-asserted tuples in an enum-keyed map (FRM-P13) ──────────────
// TODO: adjust the step ids per mode; the CREDENTIALS sequence includes the credentials
// step, MANUAL does not.
const CREDENTIALS_STEPS = ['CONNECTION_MODE', 'TARGET', 'CREDENTIALS', 'REVIEW'] as const
const MANUAL_STEPS = ['CONNECTION_MODE', 'TARGET', 'REVIEW'] as const

export type ${pascal}StepId = (typeof CREDENTIALS_STEPS)[number] | (typeof MANUAL_STEPS)[number]

const STEP_SEQUENCES: Record<${modeEnum}, readonly ${pascal}StepId[]> = {
	[${modeEnum}Enum.CREDENTIALS]: CREDENTIALS_STEPS,
	[${modeEnum}Enum.MANUAL]: MANUAL_STEPS,
	// TODO: map every ${modeEnum} member (tsc enforces exhaustiveness here).
} as Record<${modeEnum}, readonly ${pascal}StepId[]>

// ─── The accumulated-form typing trick (FRM-P18) ─────────────────────────────────────────
// An UNCALLED function wrapping useForm: its ReturnType IS the typed form instance —
// never hand-write an interface of field names. defaultValues uses the union's
// DeepPartial so steps can merge incrementally without the Partial<Union> fight.
function _infer${pascal}Form() {
	return useForm({
		defaultValues: {} as DeepPartial<(typeof ${union})['_zod']['output']>,
	})
}
export type ${pascal}Form = ReturnType<typeof _infer${pascal}Form>

export function ${pascal}Wizard() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [stepIndex, setStepIndex] = useState(0)
	const [mode, setMode] = useState<${modeEnum}>(${modeEnum}Enum.CREDENTIALS)

	const form = _infer${pascal}Form()
	const sequence = STEP_SEQUENCES[mode]
	const stepId = sequence[stepIndex] ?? sequence[0]

	// Step output merges into the parent via setFieldValue (FRM-P15) — each step validates
	// its own slice; the parent merges and advances.
	function handleStepSubmit(data: Record<string, unknown>) {
		for (const [key, value] of Object.entries(data)) {
			form.setFieldValue(key as never, value as never)
		}
		if (stepIndex < sequence.length - 1) setStepIndex(i => i + 1)
	}
	function handleBack() {
		setStepIndex(i => Math.max(0, i - 1))
	}

	// Final submission gates through the union (FRM-P43): parse the accumulated payload
	// against the variant picked by the FULL discriminant tuple; submit result.data only.
	function handleFinish() {
		const payload = form.state.values
		// TODO: replace the match with the full discriminant tuple from the wizard state,
		// e.g. { type, platform, connectionMode: mode } — compile-checked literals.
		const result = pickUnionVariant(${union}, { connectionMode: mode } as never).safeParse(payload)
		if (!result.success) return
		// TODO: mutation.mutate(result.data, { onSuccess: () => navigate({ to: '/' }) })
		void navigate
		void result.data
	}

	// Step dispatch by map — never a switch chain (CMP-P18). Each entry receives the
	// FRM-P17 props contract; the review step may also receive the typed parent form.
	const STEP_COMPONENTS: Record<${pascal}StepId, ReactNode> = {
		CONNECTION_MODE: null, // TODO: <ConnectionModeStep defaultValues={...} onSubmit={handleStepSubmit} />
		TARGET: null, // TODO
		CREDENTIALS: null, // TODO (CREDENTIALS mode only)
		REVIEW: null, // TODO: review step receives form + handleFinish
	}
	void setMode
	void handleBack
	void handleFinish
	void handleStepSubmit
	void t

	return <main className="flex min-h-dvh flex-col">{STEP_COMPONENTS[stepId]}</main>
}
`
	if (flags['no-i18n-write'] !== 'true' && flags.print !== 'true') {
		await writeI18n({ namespace: i18nPrefix, keys: ['title'] })
	}
	return [{ filePath: file, content }]
}
