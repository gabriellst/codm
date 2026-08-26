import { test, expect } from '../utils/test'
import { createOwner, setActiveOwner, getSession } from '@codm/client-typescript/typescript-cloud'
import { cloudClient } from '../utils/given'

/**
 * Canonical flow 3 — owner (tenant) lifecycle over the single ownerId axis.
 *
 * ── A SPEC QUE ATRAVESSA OS DOIS DEPLOYMENTS (F7.4) ──────────────────────────────────────────────
 * Desde o ADR 0001 esta é a única spec da suíte que fala com AMBOS os daemons, e o cliente por
 * chamada é o que torna isso explícito:
 *
 *   - `createOwner` / `setActiveOwner` vêm do subpath `typescript-cloud` da SDK e só existem no
 *     daemon de NUVEM (`PLACEMENT`: `owner` e `auth` montam sob `{ deployment: 'cloud' }`);
 *   - a leitura de volta é `getSession`, também da nuvem — é lá que a sessão vive.
 *
 * Até a F7 esta spec mandava as três contra o local e recebia `Route POST:/owners not found` —
 * que era a PLACEMENT funcionando, não um defeito. A sonda de prontidão quebrada escondeu isso por
 * meses: a suíte nunca chegava a rodar para dizer.
 *
 * O Bearer do `cloudClient` é a MESMA credencial que o daemon local usa para perguntar quem é o
 * operador, então os dois lados falam da mesma sessão — não são dois logins que por acaso combinam.
 *
 * ── E POR QUE ELA VOLTOU DO SKIP ─────────────────────────────────────────────────────────────────
 * Ela chegou a ser desligada com skip honesto: as duas rotas de owner estavam INALCANÇÁVEIS por
 * construção. Declaravam `mcpScopes`, o que faz o `Controller` anexar o `AgentIdentityMiddleware`
 * automaticamente — e run tokens são cunhados por agentes, em memória, por processo, com `agent`
 * montando só no local e `owner` só na nuvem. Nenhum agente roda no processo que serve estas rotas.
 *
 * A medição que destravou: `agent/mcp/exposure.ts` importa controllers de artifact, issue, thread,
 * ui, workspace e agent — e NÃO de owner. Nenhuma ferramenta MCP jamais saiu daqui, então o escopo
 * só trancava a porta sem abrir nenhuma outra. Removê-lo REDUZ exposição e devolve as rotas à
 * autenticação por sessão.
 */
test('create owner → set active → a sessão reporta o novo dono ativo', async ({ daemonSession }) => {
	const cloud = cloudClient(daemonSession.token)

	const created = await createOwner({ name: 'E2E Owner' }, { client: cloud })
	expect(created.ownerId).toBeTruthy()

	await setActiveOwner(created.ownerId, { client: cloud })

	// A LEITURA DE VOLTA, e ela ficou MAIS forte do que era.
	//
	// A versão anterior assertava por `getUserInfo` — projeção do BFF LOCAL — e o próprio docblock
	// dela admitia que o dono ativo armazenado "nunca é lido de volta", de modo que a troca era "uma
	// superfície no-op sob um operador". Ou seja: assertava a listagem porque a troca não tinha como
	// ser observada.
	//
	// Com o daemon de nuvem real na topologia (F7), o `setActiveOwner` PERSISTE
	// `sessions.activeOwnerId` e o `getSession` o devolve — pela MESMA credencial que o daemon local
	// usa para perguntar quem é o operador. A troca deixou de ser no-op e passou a ser verificável,
	// então a spec assere a troca em vez de contorná-la.
	const session = await getSession({ client: cloud })
	expect(session.session.ownerId).toBe(created.ownerId)
})
