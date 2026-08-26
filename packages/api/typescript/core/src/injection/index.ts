/**
 * INJECTION — o vocabulário de DI da casa, e o ÚNICO lugar da árvore onde o cast do tsyringe é legal.
 *
 * ── O PROBLEMA, medido ────────────────────────────────────────────────────────────────────────────
 * O padrão desta árvore é resolver e registrar pela ABSTRAÇÃO, nunca pela implementação: o token é
 * `abstract class HttpRouter` e o registry liga `FastifyHttpRouter`, de modo que trocar o transporte
 * é uma linha de registry e a raiz de composição nunca nomeia o concreto.
 *
 * O tsyringe-neo não consegue expressar isso. Os tipos dele são:
 *
 *   type ConstructorType<T> = { new (...args: any[]): T }
 *   type InjectionToken<T>  = ConstructorType<T> | string | symbol | DelayedConstructor<T>
 *
 * e uma classe abstrata NÃO é atribuível a `new (...) => T`. O compilador diz exatamente isso:
 * *"Cannot assign an abstract constructor type to a non-abstract constructor type"*. Por isso as
 * chamadas de `container.resolve` carregavam `as any` na entrada e `as X` na saída — o cast não
 * compensava modelagem errada, compensava um tipo estreito demais da biblioteca.
 *
 * ── POR QUE NÃO MODULE AUGMENTATION ───────────────────────────────────────────────────────────────
 * Foi tentado e MEDIDO em 2026-08-10. Não funciona, e por um motivo estrutural: `DependencyContainer`
 * e `InjectionToken` são **type alias**, não `interface`, e declaration merging só funde interface.
 * Uma `declare module 'tsyringe-neo' { interface DependencyContainer { … } }` não funde — cria um
 * SEGUNDO `DependencyContainer`, e os dois deixam de ser o mesmo tipo:
 *
 *   Argument of type 'DependencyContainer' is not assignable to parameter of type
 *     import(".../tsyringe-neo/dist/index").DependencyContainer.
 *
 * E a armadilha vizinha, que custa mais caro: um `.d.ts` com `declare module` e SEM `import` no topo
 * não é augmentation — é declaração AMBIENTE, e ela SUBSTITUI o módulo inteiro. O probe fez
 * `container`, `injectable` e `singleton` desaparecerem de uma vez.
 *
 * ── A FORMA, que já existia na metade da escrita ──────────────────────────────────────────────────
 * `RegistryToken` (abaixo, movido do antigo `types/Registry.ts`) já resolvia isto do lado do
 * REGISTRO desde sempre: por isso `{ token: HttpRouter, real: FastifyHttpRouter }` sempre compilou
 * sem cast. O que faltava era o par de LEITURA. Este módulo junta os dois lados no mesmo arquivo,
 * e é isso que torna a regra enunciável em uma frase: **`as any` junto de uma chamada do tsyringe é
 * ilegal em toda a árvore, exceto aqui.** O rail em `scripts/` cobra isso.
 *
 * ── O QUE NÃO ESTÁ AQUI, e por quê ────────────────────────────────────────────────────────────────
 * Nada de `injectAll`, `resolveAll` ou um wrapper de `@inject`. Medido: a árvore importa do tsyringe
 * apenas `injectable`, `container`, o tipo `DependencyContainer` e `singleton`. Escrever os
 * wrappers agora seria API para zero chamadas. (As contagens exatas do docblock original eram do
 * template; não foram recontadas aqui, então saíram — um número medido noutra árvore é a forma de
 * defeito 'piso numérico por repo' que este programa já pagou três vezes.)
 * GATILHO para adicionar `inject` aqui: o dia em que alguém escrever `@inject(AlgumaClasseAbstrata)`
 * e o compilador reclamar — é a mesma falha, na mesma lib, e a cura mora neste arquivo.
 */

import type { DependencyContainer, InjectionToken } from 'tsyringe-neo'

/**
 * Um token de DI COM O TIPO PRESERVADO — a abstração, nunca a implementação.
 *
 * Aceita construtor abstrato, que é o ponto inteiro: `Token<HttpRouter>` casa com
 * `abstract class HttpRouter`, e `resolve` devolve `HttpRouter` sem que o call-site escreva um cast.
 */
export type Token<T> = abstract new (...args: any[]) => T

/**
 * Um token de DI SEM tipo — a forma que o registro usa, onde o valor ligado é heterogêneo
 * (instância, fábrica, classe concreta) e o par token↔valor é conferido pelo `BindingDecl`, não pelo
 * construtor.
 *
 * Vivia em `types/Registry.ts`; veio para cá porque é a mesma pergunta que o `Token<T>` responde, e
 * mantê-las em arquivos diferentes foi o que fez a metade da leitura passar seis meses sem cura.
 */
export type RegistryToken = string | (abstract new (...args: any[]) => any)

/**
 * `container.resolve` que aceita token abstrato.
 *
 * A conversão aqui dentro é a ÚNICA da árvore, e ela é segura por um motivo que vale escrever: em
 * runtime o tsyringe usa o token apenas como CHAVE de mapa — ele nunca faz `new token()` quando há
 * binding registrado, e um token abstrato sem binding é erro de registry, não de tipo. O que a
 * conversão apaga é uma restrição de compilação que descreve um `new` que nunca acontece.
 */
export function resolve<T>(container: DependencyContainer, token: Token<T>): T {
	return container.resolve(token as InjectionToken<T>)
}

/**
 * O token como o `container.register*` do tsyringe o quer.
 *
 * Existe para que `registerAll` não precise repetir `as any` em cada uma das suas três chamadas de
 * registro — e para que a proibição do rail possa ser literal ("nenhum `as any` junto de tsyringe
 * fora de `core/src/injection/`") em vez de ter exceções espalhadas.
 */
export function asInjectionToken(token: RegistryToken): InjectionToken<any> {
	return token as InjectionToken<any>
}

/**
 * Um VALOR de runtime como `Token<T>` — para classe de construtor PRIVADO.
 *
 * `Token<T>` aceita construtor abstrato, mas uma classe de fábrica estática (`Client.create`, ctor
 * privado) não é atribuível a construtor NENHUM — o compilador a exclui de `new` e de `abstract new`
 * igualmente. Em runtime nada muda: o tsyringe usa o token como CHAVE de mapa (ver `resolve` acima),
 * e a classe é um objeto perfeitamente hasheável. Sem esta porta, quem precisa do token redige
 * `as unknown as abstract new (...)` no próprio arquivo — o double-cast que o detector proíbe,
 * fora do único módulo onde a conversão é legal (o caso medido: `ClientToken` no SdkClient).
 *
 * O cast é ÚNICO (sem `unknown`): `Token<T>` é subtipo de `object`, então isto é um downcast que o
 * compilador confere de verdade — um `asToken(42)` não compila.
 */
export function asToken<T>(key: object): Token<T> {
	return key as Token<T>
}
