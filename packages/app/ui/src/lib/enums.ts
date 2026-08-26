/**
 * O QUE VEIO PARA O PACOTE, e o que ficou no app.
 *
 * `lib/enums.ts` do console tinha DUAS funções de naturezas diferentes, e a mudança de endereço
 * expôs isso: `isEnumValue` é um type-guard PURO — `Object.values(e).includes(v)`, sem dependência
 * nenhuma — e `enumLabel` lê o bundle de i18n do app para traduzir o rótulo.
 *
 * Os primitivos (`select`, `combobox`, `toggle-group`) usam só o primeiro, nas fronteiras onde a Base
 * UI emite `string` e o handler precisa de `E[keyof E]` sem cast. O segundo continua no console: ele
 * conhece a árvore `enums.<Enum>.<VALUE>` das traduções daquele app, e um pacote de design system não
 * tem por que conhecer.
 *
 * Separar foi a única saída honesta: trazer o arquivo inteiro faria o pacote importar a instância de
 * i18n do app — a seta apontando para o lado errado.
 */

/**
 * Type-guard que estreita `v` para `T[keyof T]` (um valor de enum) sem cast.
 *
 * Use nas fronteiras de `Select`/`ToggleGroup` da Base UI, onde o primitivo emite `string` ou
 * `string[]` e você precisa chamar `onChange(v: E[keyof E])` sem `as`.
 *
 * @example
 *   onValueChange={v => { if (isEnumValue(TaxTypeEnum, v)) onChange(v) }}
 */
export function isEnumValue<T extends Record<string, string>>(e: T, v: string | null | undefined): v is T[keyof T] {
	return v != null && (Object.values(e) as string[]).includes(v)
}
