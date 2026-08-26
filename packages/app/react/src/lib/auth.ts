import { createAuthClient } from 'better-auth/react'
import { oneTimeTokenClient } from 'better-auth/client/plugins'
import { Config } from './config'

/**
 * O CLIENT DO BETTER-AUTH — a mesma biblioteca que serve as rotas, falando com elas.
 *
 * ── o que ele substitui ──────────────────────────────────────────────────────────────────────────
 * Este arquivo era um STUB: uma sessão constante, `useSession()` devolvendo um `operator` de
 * compile-time e `signOut()` no-op, sob a justificativa de que *"CODM has no accounts, no sign-in,
 * and no better-auth client"*. Isso descrevia o mundo do `OPERATOR_ID` — o mesmo que o **ADR 0001
 * aboliu** quando decidiu que identidade vem da NUVEM. O stub já previa a própria morte: *"swapping
 * a real auth client back in is a one-file change here"*.
 *
 * Um id constante é perfeitamente consistente consigo mesmo, e é por isso que nada quebrava: toda
 * asserção sobre "o dono" comparava a constante com ela mesma. O buraco só aparece quando se
 * pergunta DE ONDE o id veio — que é a pergunta que o `CloudSessionMiddleware` passou a fazer.
 *
 * ── por que `cloudUrl` e não `baseUrl` — a diferença para o repo de referência ───────────────────
 * No fork de origem isto é `${Config.baseUrl}/authentication`: lá o mesmo servidor serve o app e a
 * identidade. Aqui não. O contexto `auth` é **cloud-only** na `PLACEMENT` (ADR 0002), então o
 * daemon local não monta nenhuma dessas rotas — apontar para `baseUrl` daria 404 em tudo, que é o
 * beco sem saída que `config.ts` documenta ter custado um login quebrado em 2026-08-07.
 *
 * O caminho é `/auth` porque é o `basePath` que o `BetterAuth` do backend declara, e o
 * `AuthPassthroughController` (`/auth/*`) é quem o entrega — o `MainRouter` prefixa a versão.
 * Medido contra o processo de nuvem: `/auth/get-session` e `/auth/ok` respondem 200.
 *
 * ── e o desktop não navega o webview ─────────────────────────────────────────────────────────────
 * Provedores OAuth recusam webview embutido, então o login abre o NAVEGADOR DO SISTEMA. Quem faz
 * isso é `LoginSection`, com `signIn.social({ ..., disableRedirect: true })`: o better-auth devolve
 * `{ url }` em vez de redirecionar, e a URL vai para `openBrowser`. É a mesma rota que o client
 * usaria sozinho — só quem a abre é diferente.
 *
 * ── e o resgate do código volta por aqui também ──────────────────────────────────────────────────
 * O deep link `codm://auth?code=…` traz um token de uso único, e quem o troca por sessão é
 * `auth.oneTimeToken.verify` — o plugin, não uma rota nossa. As rotas `/cloud/devices/exchange` e
 * `/cloud/devices/revoke` que faziam isso à mão foram removidas; `signOut()` cobre a segunda.
 */
export const auth = createAuthClient({
	baseURL: `${Config.cloudUrl}/auth`,
	/**
	 * O par-cliente do plugin `one-time-token` do servidor. Ele não carrega implementação — só o
	 * `$InferServerPlugin`, que é o que faz `auth.oneTimeToken.verify({ token })` existir COM TIPO
	 * aqui, derivado do plugin declarado em `BetterAuth.ts`. Se o servidor deixar de montá-lo, a
	 * chamada não some silenciosamente: o tipo deixa de existir e o `tsc` aponta a linha.
	 *
	 * É por ele que passa o resgate do deep link `codm://auth?code=…` (`useLoopbackAuth`), no lugar
	 * do antigo `POST /cloud/devices/exchange`.
	 */
	plugins: [oneTimeTokenClient()],
	/**
	 * RESOLVE `fetch` NA HORA DA CHAMADA, e não no import.
	 *
	 * O client do better-auth (via better-fetch) captura `globalThis.fetch` quando o módulo carrega.
	 * Isso torna a chamada INALCANÇÁVEL para qualquer dobro instalado depois — e o sintoma foi
	 * medido: o teste do deep link instalava `spyOn(globalThis, 'fetch')`, o client ignorava o
	 * espião, e o POST SAIU DE VERDADE, batendo no daemon de dev em `localhost:3030` e voltando 404.
	 * Um teste que fala com a máquina de quem o roda não está testando o código; está testando o
	 * ambiente, e passa ou falha por motivos que ninguém escreveu.
	 *
	 * O lambda não é indireção decorativa: ele adia a LEITURA de `globalThis.fetch` até a chamada,
	 * que é a mesma correção que o `PollingHealthCheck` do backend recebeu pela mesma causa — um
	 * retrato tirado no boot descrevendo um mundo que já mudou.
	 */
	fetchOptions: {
		customFetchImpl: (input, init) => globalThis.fetch(input as RequestInfo, init as RequestInit),
	},
})
