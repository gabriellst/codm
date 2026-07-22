import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { NativeModules, Platform } from 'react-native'

import en from '../locales/en.json'
import pt from '../locales/pt.json'

function getDeviceLanguage(): string {
	try {
		const locale =
			Platform.OS === 'ios'
				? (NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0])
				: NativeModules.I18nManager?.localeIdentifier
		return typeof locale === 'string' ? locale.slice(0, 2) : 'en'
	} catch {
		return 'en'
	}
}

i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		pt: { translation: pt },
	},
	lng: getDeviceLanguage(),
	fallbackLng: 'en',
	interpolation: { escapeValue: false },
	returnNull: false,
})

export default i18n
