import i18n from './i18n'

/**
 * O QUE FICOU NO APP — a metade que conhece as traduções DESTE console.
 *
 * A outra metade (`isEnumValue`, um type-guard puro) foi para `@codm/app-ui/enums` quando os
 * primitivos viraram pacote: `select`, `combobox` e `toggle-group` a usam nas fronteiras onde a Base
 * UI emite `string`, e mantê-la aqui faria o design system depender do app que ele serve.
 *
 * `enumLabel` não pode ir junto: ela lê o bundle de i18n deste app (a árvore
 * `enums.<Enum>.<VALUE>`).
 */

/**
 * Translate a typed enum value to its display label via the shared `enums.<EnumName>.<VALUE>` i18n
 * subtree — the same subtree `lib/zod-config.ts` reads for validation messages. The VALUE is
 * type-checked at the call site against the SDK enum type; the label lives once in i18n, so there's
 * no per-enum member list to hand-maintain. Falls back to the raw value when no label is registered.
 *
 * Reads the active-language bundle directly (like `getEnumLabel` in zod-config), so call it from a
 * language-reactive context (e.g. inside a render / `useMemo` that depends on `i18n.language`).
 *
 * To iterate an enum (e.g. `<Select>` options), use the SDK const directly — it is iterable:
 *   import { OperationalCostRecurrencyEnum } from '@codm/client-typescript/typescript'
 *   Object.values(OperationalCostRecurrencyEnum).map(v => ({ value: v, label: enumLabel('OperationalCostRecurrency', v) }))
 */
export function enumLabel<V extends string>(enumName: string, value: V): string {
	const bundle = i18n.getResourceBundle(i18n.language, 'translation') as { enums?: Record<string, Record<string, string>> } | undefined
	return bundle?.enums?.[enumName]?.[value] ?? value
}
