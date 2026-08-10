// packages/app/react/tests/support/storybook.ts — arquivo final COMPLETO
import { composeStories as composeStoriesUpstream, setProjectAnnotations } from '@storybook/react'
import * as previewAnnotations from '../../.storybook/preview'

/**
 * STORY COMO FIXTURE ÚNICA (spec Decisions 2/3): o Storybook mostra, o bun test executa. Este
 * módulo aplica as anotações do projeto UMA vez e expõe o compositor que o smoke, os specs de
 * `play` e as migrações (T9–T11) consomem. Se o preview real não puder ser importado sob bun
 * (CSS), o preview é refatorado para importar de um módulo de anotações sem CSS — e este arquivo
 * importa DESSE módulo; o Storybook continua lendo o preview normalmente.
 *
 * MSW SOB BUN — MEDIDO, NÃO FUNCIONA (T4.2 spike + relato T4). Duas tentativas, as duas medidas
 * isoladamente antes de desistir:
 * 1. `msw-storybook-addon` (o `initialize()`/`mswLoader` que o preview usa) chama `setupWorker` de
 *    `msw/browser`, que depende de um Service Worker real do navegador — inexistente sob bun/
 *    happy-dom. `worker.start()` não lança, mas nunca intercepta nada.
 * 2. O fallback documentado na spec — `setupServer` de `msw/node` alimentado por
 *    `parameters.msw.handlers` — foi implementado e MEDIDO À PARTE: mesmo com a causa-raiz do
 *    "relative URL" corrigida (`configureClient` com uma base absoluta), as requisições NUNCA
 *    chegam ao interceptor — saem direto para a rede real e voltam `ECONNREFUSED`. Uma sonda
 *    isolada (`http.request()` puro, sem happy-dom/ky/story no meio) reproduziu o mesmo: o
 *    `ClientRequestInterceptor` de `@mswjs/interceptors` não intercepta `node:http` sob bun — uma
 *    incompatibilidade de runtime, não um erro de wiring deste módulo.
 *
 * Os dois caminhos previstos pela spec foram tentados e os dois falharam por causas de
 * incompatibilidade de runtime (bun), não por erro de configuração — ver
 * `tests/support/storybook.spike.test.tsx` para a prova ao vivo do estado atual. A decisão de
 * ajuste (aceitar o estado documentado, trocar de estratégia de rede para os testes de `play`, ou
 * outra coisa) é do founder — este módulo fica no comportamento SEM os dois fallbacks (nenhum dos
 * dois funciona; o segundo ainda pior, porque tenta rede real).
 *
 * RULING DO FOUNDER (pós-spike): MSW é SÓ-VISUAL — existe para o Storybook no browser, não para o
 * bun test. `preview.tsx` guarda `initialize()`/`mswLoader` atrás de `'serviceWorker' in
 * navigator` (falso sob bun/happy-dom, verdadeiro em qualquer browser real), então importar o
 * preview real AQUI (linha acima) nunca instala o interceptor quebrado — ele nem tenta subir sob
 * bun. Isso fecha um segundo bug que esse mesmo mecanismo introduzia: o interceptor de
 * `msw-storybook-addon`, mesmo não servindo mock nenhum, ENGOLIA requisições reais de QUALQUER
 * outro teste rodando no mesmo processo bun (ex.: o spike do harness de integração recebia corpo
 * vazio — `SyntaxError: Unexpected EOF` — ao chamar o backend real, só por compor uma story neste
 * mesmo `bun test`). Composição de stories agora nunca perturba testes vizinhos.
 */
let applied = false

export function ensureProjectAnnotations(): void {
	if (applied) return
	setProjectAnnotations(previewAnnotations.default ?? previewAnnotations)
	applied = true
}

export function composeStories<T extends Parameters<typeof composeStoriesUpstream>[0]>(
	storiesModule: T,
): ReturnType<typeof composeStoriesUpstream<T>> {
	ensureProjectAnnotations()
	return composeStoriesUpstream(storiesModule)
}
