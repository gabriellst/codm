/**
 * `typeof fetch` NÃO é `(input, init) => Promise<Response>`.
 *
 * Bun declara `fetch` como função MAIS namespace (`declare namespace fetch { export function
 * preconnect(...) }`), então o tipo global é um callable COM uma propriedade estática. Um stub
 * escrito como arrow solta é estruturalmente incompleto, e `spyOn(globalThis, 'fetch')
 * .mockImplementation(...)` cobra o tipo inteiro — com razão: é exatamente esse valor que o spy
 * instala no lugar do `fetch` real, e um `fetch` sem `preconnect` não é um `fetch`.
 *
 * O conserto é dar ao stub a assinatura COMPLETA — o mesmo movimento que `integration-harness.ts`
 * já faz em `nodeHttpFetch.preconnect` —, nunca um cast: `preconnect` genuinamente faz parte do
 * valor instalado, então declará-lo é descrever a realidade, e silenciá-lo seria mentir sobre ela.
 *
 * Os parâmetros são DERIVADOS de `typeof fetch`. Redigitar `(input: RequestInfo | URL)` à mão é
 * justamente como os stubs estreitos nasceram — e como sairiam de sincronia de novo.
 */

/** A parte CHAMÁVEL de um `fetch`: o que cada teste realmente quer escrever. */
export type FetchImplementation = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>

/** Num stub, `preconnect` é no-op: nenhum teste abre socket. Ela só precisa EXISTIR, com o tipo
 *  certo, para o valor instalado ser um `fetch` inteiro. */
const noopPreconnect: typeof fetch.preconnect = () => undefined

/**
 * Completa uma implementação de teste até o `typeof fetch` inteiro.
 *
 * ```ts
 * fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(fetchStub(async input => json({ ok: true })))
 * ```
 */
export function fetchStub(implementation: FetchImplementation): typeof fetch {
	const stub = (...args: Parameters<typeof fetch>) => implementation(...args)
	stub.preconnect = noopPreconnect
	return stub
}
