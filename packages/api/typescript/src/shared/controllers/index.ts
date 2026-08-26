// Shared (root) context controllers barrel. The root context carries seams rather than product
// surface: the PUBLIC readiness endpoint (mounted always — it is what the Tauri shell's supervisor
// probes before any session exists), the two halves of the loopback sign-in landing, and the
// TEST-ONLY gateway ingress. Exported here so the wiring-completeness rail (WIRE-03) sees them
// registered rather than orphaned; what is actually MOUNTED is the `export default` below.
export { HealthController } from './Health'
export { TestIngressController } from './TestIngressController'
export { SetCloudTokenController } from './SetCloudToken'
export { SignInLoopbackController } from './SignInLoopback'
export { ClaimSignInCodeController } from './ClaimSignInCode'

import { byEnvironment } from '@codm/core-typescript'
import { HealthController } from './Health'
import { TestIngressController } from './TestIngressController'
import { SetCloudTokenController } from './SetCloudToken'
import { SignInLoopbackController } from './SignInLoopback'
import { ClaimSignInCodeController } from './ClaimSignInCode'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10) — e aqui a seleção é CONDICIONAL.
 *
 * O `TestIngressController` é o simulador do gateway Go: existe para uma spec Playwright poder
 * semear um canal conectado contra o daemon TS sozinho. Ele é montado EXCLUSIVAMENTE sob a coluna
 * `e2e` e recusado sob produção (`setBoundedContextEnvironment`, `src/server.ts`), e nunca chega à
 * SDK/OpenAPI porque a emissão jamais seleciona `e2e`.
 *
 * Este condicional morava em `shared/index.ts`. Desceu para cá porque seleção de controller é
 * assunto de controller — e porque, com todo contexto expondo o mesmo símbolo montado, o gerador da
 * composição não precisa de um ramo para os três casos especiais.
 *
 * Despacho DECLARADO (T5, NN-5), não um `if` sobre flag crua: `byEnvironment` lê a coluna que o
 * `start()` já selecionou. É seguro avaliar no escopo do módulo porque a ordem sagrada do
 * `server.ts` chama `setBoundedContextEnvironment` ANTES de importar a composição.
 *
 * ── consequência medida, e é a razão de a lista ser explícita ────────────────────────────────────
 * Acrescentar um controller ao barril NÃO o monta. Em 2026-08-14 o `SetCloudTokenController` sumiu
 * da spec inteira (46 linhas a menos no `openapi.json`) quando mudou de contexto, e só o diff da
 * spec disse. Por isso o conjunto montado é enumerado aqui, e não um spread do módulo.
 */
const testControllers = byEnvironment<Record<string, typeof TestIngressController>>({
	default: {},
	e2e: { TestIngressController },
})

export default {
	HealthController,
	SetCloudTokenController,
	// As duas metades do pouso de loopback (RFC 8252): o navegador DEPOSITA o código, o console o
	// RETIRA. Substituem o deep link `codm://`, que no macOS não alcança um build de dev.
	SignInLoopbackController,
	ClaimSignInCodeController,
	...testControllers,
}
