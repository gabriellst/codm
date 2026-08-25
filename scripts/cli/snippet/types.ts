// The canonical snippet shape, parsed from a skill registry.yaml `snippet:` block.
// `skeleton` is the whole-file default body. `skeletons` are named whole-file
// variants selected by a binding's `_variant`. `fragments` are reusable sub-bodies
// a binding can reference via { fragment: '<key>' } (e.g. a controller's class body).
// `imports` is reserved for frontend fragment composition (Plan C) and unused by
// backend whole-file skeletons. `exemplar` is the rich teaching form read by
// /review + /plan (migrated from the legacy `canonical_snippet` field).
export interface Snippet {
	skeleton: string
	skeletons?: Record<string, string>
	fragments?: Record<string, string>
	imports?: string[]
	exemplar?: string
}

// A binding value is either a literal string substituted for {{key}}, or a
// reference to a `fragments` entry that the renderer resolves+interpolates first.
export type BindingValue = string | { fragment: string }

// `_variant` (optional) selects a named skeleton. All other keys are {{placeholders}}.
export type Bindings = Record<string, BindingValue> & { _variant?: string }
