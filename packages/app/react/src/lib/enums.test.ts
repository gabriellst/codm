import { describe, it, expect, afterAll } from 'bun:test'
import i18n from './i18n'
import { enumLabel } from './enums'

/**
 * REGRESSION: enum labels rendered as raw values in the UI (`DISCONNECTED` instead of "Não conectado").
 *
 * `enumLabel` reads `i18n.getResourceBundle(i18n.language, …)` directly, because a value→label lookup
 * that scans every registered enum cannot be expressed through `t()`. That read is exact: it does NOT
 * walk i18next's fallback chain. The browser detector reports what `navigator` says — `pt-BR`, `en-US` —
 * and the only registered bundles are `pt` and `en`, so `getResourceBundle('pt-BR')` returned undefined
 * and the helper degraded to its raw-value fallback. `t()` never showed the bug because it resolves the
 * chain itself, which is why the strings around the enum looked translated and the enum did not.
 *
 * Fixed at the cause in `i18n.ts` with `supportedLngs`, which normalizes `i18n.language` before anything
 * reads it. Measured: without it these cases fail; with `load: 'languageOnly'` ALSO set they fail again,
 * because `load` undoes the normalization — hence the warning in i18n.ts.
 */
const original = i18n.language

afterAll(async () => {
	await i18n.changeLanguage(original)
})

describe('enumLabel under a region-variant language', () => {
	it('resolves through the base-language bundle when the detector reports pt-BR', async () => {
		await i18n.changeLanguage('pt-BR')
		expect(i18n.language).toBe('pt')
		expect(enumLabel('ChannelStatus', 'DISCONNECTED')).toBe('Não conectado')
		expect(enumLabel('ChannelStatus', 'CONNECTED')).not.toBe('CONNECTED')
	})

	it('does the same for en-US', async () => {
		await i18n.changeLanguage('en-US')
		expect(i18n.language).toBe('en')
		expect(enumLabel('ChannelStatus', 'DISCONNECTED')).toBe('Not connected')
	})

	it('still falls back to the raw value for an unregistered member', async () => {
		await i18n.changeLanguage('pt')
		expect(enumLabel('ChannelStatus', 'NO_SUCH_MEMBER')).toBe('NO_SUCH_MEMBER')
		expect(enumLabel('NoSuchEnum', 'DISCONNECTED')).toBe('DISCONNECTED')
	})
})
