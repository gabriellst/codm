/**
 * O HANDSHAKE DE IDENTIDADE DO E2E (F7.3) — dois hops, na ordem em que a produção os faz.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────────────────────────
 * O ADR 0001 levou `auth` e `owner` para a nuvem. O daemon LOCAL não tem mais identidade própria: o
 * `CloudSessionMiddleware` — declarado em praticamente todo controller local — chama
 * `CloudSession.identity()`, que pergunta à nuvem com o device token guardado. Sem esse token, TODA
 * rota local devolve 401. Eram 10 das 11 specs reprovando por isso.
 *
 * ── OS DOIS HOPS ─────────────────────────────────────────────────────────────────────────────────
 * 1. A NUVEM cunha a sessão e devolve o token (`POST /_test/session`, costura montada só sob a
 *    coluna `e2e` — ver o docblock dela para por que o caminho de produção, OAuth device-code pelo
 *    navegador do sistema, é indirigível numa suíte).
 * 2. O DAEMON LOCAL recebe o token por `POST /session/cloud-token` — que é a MESMA porta que o
 *    console de verdade usa depois de trocar o deep-link code, e que é deliberadamente sem
 *    middleware (a porta de login não pode exigir login).
 *
 * Do hop 2 em diante nada é encurtado: o `FileCloudSession` cacheia por TTL, pergunta à nuvem com
 * `Authorization: Bearer`, o plugin `bearer` do better-auth resolve a sessão, o
 * `AuthAccountMiddleware` monta o `ctx`. O único atalho é a EMISSÃO da credencial.
 *
 * ── IDENTIDADE É DECLARADA, NÃO HERDADA ──────────────────────────────────────────────────────────
 * O `ownerId` é passado explicitamente daqui, e a costura da nuvem tem `null` como default (que é o
 * estado real "logado, ainda sem tenant" do ADR 0001). Mesma disciplina que a F3/T3 impôs ao
 * maquinário do backend: quem precisa de identidade DIZ qual é, o mecanismo não inventa uma.
 */

/** O tenant desta suíte. Fixo para que as linhas sobrevivam entre specs do mesmo run, e opaco. */
export const E2E_OWNER_ID = '55555555-5555-4555-8555-555555555555'

const cloudUrl = () => process.env.CODM_CLOUD_URL ?? 'http://127.0.0.1:3134'
const daemonUrl = () => process.env.API_URL ?? 'http://127.0.0.1:3130'

export interface DaemonSession {
	token: string
	userId: string
	ownerId: string
}

/**
 * Autentica o daemon local contra o de nuvem e devolve a credencial resultante.
 *
 * Idempotente por e-mail: a costura da nuvem faz upsert do usuário, então chamar de novo devolve
 * outro token para o MESMO operador — o que é o comportamento certo para um relogin, e não cria um
 * segundo tenant por acidente.
 */
export async function authenticateDaemon(ownerId: string = E2E_OWNER_ID): Promise<DaemonSession> {
	const minted = await fetch(`${cloudUrl()}/_test/session`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', Origin: cloudUrl() },
		body: JSON.stringify({ ownerId }),
	})
	if (!minted.ok) {
		throw new Error(`authenticateDaemon: a nuvem (${cloudUrl()}) recusou cunhar a sessão — ${minted.status} ${await minted.text()}`)
	}
	const { token, userId } = (await minted.json()) as { token: string; userId: string }

	const pushed = await fetch(`${daemonUrl()}/session/cloud-token`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', Origin: daemonUrl() },
		body: JSON.stringify({ token }),
	})
	if (!pushed.ok) {
		throw new Error(`authenticateDaemon: o daemon (${daemonUrl()}) recusou o token — ${pushed.status} ${await pushed.text()}`)
	}

	return { token, userId, ownerId }
}
