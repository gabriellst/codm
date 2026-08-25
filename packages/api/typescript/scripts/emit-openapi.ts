/**
 * Generates `packages/api/typescript/public/docs/openapi.json` without booting the
 * full HTTP server. Requires EMIT_OPENAPI=true IN THE ENVIRONMENT (set by the nx `emit-openapi`
 * target / `bun sdk`) so openapi.generateSpecification() writes the file, then exits.
 *
 * The guard MUST be set in the env, not assigned here: ESM evaluates the composition-root import
 * (`@codm/core-typescript` → `../src/manifest`) before this module's body, so an in-body
 * `process.env.EMIT_OPENAPI = 'true'` runs too late and the real embedded database would boot (mkdir +
 * migrate the real data dir + start the outbox dispatcher). `./require-emit-env` (imported first, no
 * composition-root dependency) asserts the env is set and fails loud on direct invocation without it.
 *
 * ref: dev:packages/api/src/shared/index.ts (openapi.generateSpecification pattern)
 */

// MUST be first — asserts EMIT_OPENAPI is already set in the env before the composition root loads.
import './require-emit-env'

// reflect-metadata must be evaluated before the composition root (decorator metadata).
import 'reflect-metadata'

import { openapi } from '@codm/core-typescript'

// A emissão compõe pelo MESMO laço do boot, com os mesmos critérios do desktop (`local`): a spec
// documenta o que o servidor local serve. Importar o manifesto não monta nada — quem monta é o
// `composeContexts`, e é por isso que este arquivo agora chama a composição em vez de depender de um
// import que montava tudo como efeito colateral.
//
// Uma segunda lista de routers aqui seria a cópia paralela que o `routers.ts` existia para evitar; a
// diferença é que agora a lista é DERIVADA da tabela de alocação, não declarada.
import { MANIFEST } from '@generated/composition.generated'
import { bindContexts, composeContexts } from '../composition/compose'
import { criteriaFromEnv } from '../src/shared/deployment'

/**
 * UMA emissão por PERFIL, e o perfil vem de `CODM_PROFILE` pelo mesmo `criteriaFromEnv` que o boot
 * usa — nunca de um flag próprio deste script. Um segundo jeito de dizer "qual deployment" é a
 * segunda cópia que a tabela de alocação existe para não ter.
 *
 * Processos SEPARADOS por perfil, de propósito: o `openapi` acumula paths/enums/schemas ao longo do
 * boot, então emitir os dois aqui faria a spec da nuvem herdar as rotas do desktop. O alvo nx roda
 * este script duas vezes.
 */
const criteria = criteriaFromEnv()
const fileName = criteria.deployment === 'cloud' ? 'openapi.cloud.json' : 'openapi.json'

// FASE A antes da FASE B (ADR 0007), e a emissão precisa dela tanto quanto o boot: `create` não
// registra mais, e o Router passou a FALHAR ALTO quando um controller não resolve. Sem isto, emitir
// a spec morreria no primeiro controller com dependência — que é exatamente o que aconteceu, e só o
// `bun sdk` disse, porque este arquivo não está no escopo de nenhum tsconfig que a bateria roda.
bindContexts(MANIFEST, criteria, 'real')

const { mounted, routers } = await composeContexts(MANIFEST, criteria)
await openapi.generateSpecification(routers, fileName)

console.log(`✅ ${fileName} emitted (${criteria.deployment}: ${mounted.join(', ')})`)
process.exit(0)
