// Block primitive contract — shared between the block fns and the component assembler.
//
// Each block is a small fn that contributes chunks to a TSX file. The assembler
// in artifacts/component.ts dedupes imports, threads declarations, and renders
// the final source.

export interface BlockContext {
	pascal: string
	camel: string
	kebab: string
	routePath: string
	sdk?: string
	// The SDK mutation hook a block fires (`--mutation=useSteerThread`). Distinct from `sdk`, which is
	// a type/query identifier — a single component legitimately reads one and writes with the other.
	mutationHook?: string
	storeName?: string
	i18nPrefix?: string
}

export interface BlockOutput {
	imports?: string[] // each entry is one import statement
	hookCalls?: string[] // lines inserted at the top of the component fn body
	jsxBefore?: string // statements/JSX before the main `return (...)`
	jsxBody?: string // JSX inside the root element (between <Root>...</Root>)
	exports?: string[] // additional `export ...` lines after the component
	declarations?: string[] // top-level const/type declarations
	i18nSlots?: string[] // i18n key tails (without the prefix) referenced by this block
}

export type BlockFn = (ctx: BlockContext, flagValue?: string) => BlockOutput
