// Implementation of the @unionSlot / @variant decorators (see union-slots.tsp).
//
// The decorators only ACCUMULATE declaration state and bridge it into the emitted
// OpenAPI document as `x-union-slots` / `x-union-variants` extensions on the event
// schema. All semantic validation (owner ∈ WORKSPACES manifest, slot/discriminator
// fields exist, arity association, duplicates) happens in the wire codegen
// (packages/contracts/codegen/lib/union-slots.ts), which fails the contract build.
import { setExtension } from '@typespec/openapi'

const stateKey = Symbol.for('codedm/contracts/union-slots')

/**
 * Per-model accumulator. The SAME array instances are handed to setExtension once;
 * subsequent decorator invocations mutate them, and the openapi3 emitter serializes
 * the final contents at emit time.
 */
function entryFor(context, target) {
	const map = context.program.stateMap(stateKey)
	let entry = map.get(target)
	if (!entry) {
		entry = { slots: [], variants: [] }
		map.set(target, entry)
		setExtension(context.program, target, 'x-union-slots', entry.slots)
		setExtension(context.program, target, 'x-union-variants', entry.variants)
	}
	return entry
}

export function $unionSlot(context, target, field, discriminators) {
	if (typeof field !== 'string' || field.length === 0) {
		throw new Error('@unionSlot: `field` must be a non-empty string')
	}
	if (!Array.isArray(discriminators) || discriminators.length === 0 || discriminators.some(d => typeof d !== 'string')) {
		throw new Error(`@unionSlot("${field}"): \`discriminators\` must be a non-empty string array`)
	}
	entryFor(context, target).slots.push({ field, discriminators: [...discriminators] })
}

export function $variant(context, target, ...args) {
	// Shape: (...discriminatorValues: string[], typeName: string, options: { owner: string })
	const options = args[args.length - 1]
	if (typeof options !== 'object' || options === null || typeof options.owner !== 'string') {
		throw new Error('@variant: last argument must be an options object with a string `owner` (a WORKSPACES id)')
	}
	const typeName = args[args.length - 2]
	if (typeof typeName !== 'string' || typeName.length === 0) {
		throw new Error('@variant: the argument before the options object must be the variant type name (string)')
	}
	const values = args.slice(0, -2)
	if (values.length === 0 || values.some(v => typeof v !== 'string')) {
		throw new Error(`@variant(... "${typeName}"): leading arguments must be one or more discriminator value strings`)
	}
	entryFor(context, target).variants.push({ values, typeName, owner: options.owner })
}
