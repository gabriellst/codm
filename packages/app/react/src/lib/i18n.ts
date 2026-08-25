import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ptTranslations from '../locales/pt.json'
import enTranslations from '../locales/en.json'

const chain = i18n.use(initReactI18next)

// LanguageDetector touches `window`/`navigator`/`localStorage`. Register it
// only on the client; on the server we fall back to `lng: 'pt'`.
if (typeof window !== 'undefined') {
	// Dynamic import via runtime resolver to avoid pulling the module on the
	// server build. Using Function('return import(...)') keeps tsc happy without
	// awaiting top-level (init is sync below).
	const detectorModule = (await import('i18next-browser-languagedetector')) as { default: unknown }
	chain.use(detectorModule.default as Parameters<typeof chain.use>[0])
}

chain.init({
	resources: {
		pt: { translation: ptTranslations },
		en: { translation: enTranslations },
	},
	lng: typeof window === 'undefined' ? 'pt' : undefined,
	fallbackLng: 'pt',
	// Collapses region variants to the base language, so `i18n.language` is `pt` and never `pt-BR`.
	// This is load-bearing, not hygiene: the detector reports what `navigator` says (`pt-BR`, `en-US`)
	// and the only registered bundles are `pt`/`en`. `t()` survives that by walking the fallback chain,
	// but anything calling `i18n.getResourceBundle(i18n.language, …)` gets `undefined` and silently
	// degrades — which is why enum labels rendered raw (`DISCONNECTED` instead of "Não conectado").
	// `enumLabel` and `zod-config`'s `getEnumLabel` both read the bundle directly, because a scan over
	// every registered enum cannot be expressed through `t()`; fixing the language here fixes both.
	//
	// Do NOT add `load: 'languageOnly'` alongside it. Measured against all three configurations:
	// neither setting -> `i18n.language` stays `pt-BR` (the bug); `supportedLngs` alone -> normalizes;
	// BOTH -> `pt-BR` again, i.e. `load` UNDOES the normalization. `enums.test.ts` pins this.
	supportedLngs: ['pt', 'en'],
	defaultNS: 'translation',
	interpolation: {
		escapeValue: false,
	},
	returnNull: false,
	detection: {
		order: ['localStorage', 'navigator'],
		caches: ['localStorage'],
	},
})

export default i18n
