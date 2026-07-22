// Mobile SDK import block. The expo workspace imports from
// REPO.sdkSpecifier — the TS-backend subpath of the cross-stack SDK
// (template.config.ts). Keeping a dedicated block here (rather than reusing
// the web one) so the mobile artifacts can extend it independently if needed.

import { REPO } from '../../../../template.config'
import type { MobileBlockContext, MobileBlockOutput } from './types'

export const MOBILE_SDK_PACKAGE = REPO.sdkSpecifier

export function sdkImport(symbols: string[]): string {
	if (symbols.length === 0) return ''
	if (symbols.length === 1) return `import { ${symbols[0]} } from '${MOBILE_SDK_PACKAGE}'`
	return `import {\n\t${symbols.join(',\n\t')},\n} from '${MOBILE_SDK_PACKAGE}'`
}

export function sdkBlock(_ctx: MobileBlockContext, sdk?: string): MobileBlockOutput {
	if (!sdk) return {}
	return {
		imports: [`import type { ${sdk} } from '${MOBILE_SDK_PACKAGE}'`],
	}
}
