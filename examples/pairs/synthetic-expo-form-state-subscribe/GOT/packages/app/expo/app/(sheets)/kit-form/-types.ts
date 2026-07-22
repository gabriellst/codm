// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-types.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// packages/app/expo/app/(sheets)/kit-form/-types.ts
//
// The form-data schema is the API mutation request PLUS UI-only fields
// tracking the in-sheet item editor state. Submit-time we re-parse with
// `createKitMutationRequestSchema` to strip the UI fields.
//
// `KitForm` is exported as a TYPE only — `_inferKitForm` is never invoked
// at runtime. Its presence lets every downstream component type its
// `form: KitForm` prop without re-deriving TanStack Form's generics.

import { z } from 'zod/v4'
import { useForm } from '@tanstack/react-form'
import {
	createKitMutationRequestSchema,
	quantityModifierSchema,
} from '@codedm/client-typescript/typescript'
import type { DeepPartial } from '@/lib/types'

/**
 * `null` = add-new-item mode.
 * `{ index }` = editing the item at that index in `items[]`.
 */
export const editingSelectionSchema = z.object({ index: z.number().int().min(0) }).nullable()
export type EditingSelection = z.infer<typeof editingSelectionSchema>

/**
 * Form schema = API mutation request + UI-only editor fields.
 * Validators run against this merged shape; at submit time we re-parse
 * the API subset with `createKitMutationRequestSchema` to strip the UI fields.
 */
export const kitFormSchema = createKitMutationRequestSchema.and(
	z.object({
		editingSelection: editingSelectionSchema,
		editorProductId: z.string().nullable(),
		editorQuantity: z.number().int().positive(),
		editorQuantityModifier: quantityModifierSchema,
	}),
)

export type KitFormData = z.infer<typeof kitFormSchema>

/**
 * Type-only inference helper. NEVER invoked at runtime — exists solely
 * so consumer components can type their `form` prop as `KitForm` without
 * re-deriving TanStack Form's generic arguments.
 */
function _inferKitForm() {
	const defaults: DeepPartial<KitFormData> = {}
	return useForm({
		defaultValues: defaults,
		validators: { onChange: kitFormSchema },
	})
}
export type KitForm = ReturnType<typeof _inferKitForm>
