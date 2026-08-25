import pt from '../../app/react/src/locales/pt.json' with { type: 'json' }

type NestedKeys<T, Prefix extends string = ''> =
	T extends Record<string, unknown>
		? { [K in keyof T & string]: NestedKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> }[keyof T & string]
		: Prefix

type TranslationKey = NestedKeys<typeof pt>

export function t(key: TranslationKey): string {
	return key.split('.').reduce<any>((obj, k) => obj?.[k], pt) ?? key
}
