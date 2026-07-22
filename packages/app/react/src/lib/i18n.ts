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
