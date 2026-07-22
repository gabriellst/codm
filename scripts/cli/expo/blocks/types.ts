// Mobile block contract — narrower than the web version since the mobile
// artifacts are simpler (one route family, one component shape, one form
// shape). Each block returns text fragments that the caller stitches into
// the final TSX.

export interface MobileBlockContext {
	pascal: string
	camel: string
	kebab: string
	/** Path relative to `packages/app/expo/app/` (e.g. `(tabs)/games` or `(sheets)/game-form`). */
	routePath?: string
	sdk?: string
	storeName?: string
	i18nPrefix?: string
}

export interface MobileBlockOutput {
	imports?: string[]
	hookCalls?: string[]
	jsxBefore?: string
	declarations?: string[]
	exports?: string[]
}
