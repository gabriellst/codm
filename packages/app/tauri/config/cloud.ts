/**
 * A origem pública da fatia cloud — onde o console troca o código do deep link por device token e
 * revoga a sessão no logout (`/v1/cloud/devices/{exchange,revoke}`).
 *
 * Por que vive AQUI e não só na env: o webview roda sob uma CSP, e `connect-src` é uma lista
 * fechada renderizada no `tauri.conf.json` em tempo de GERAÇÃO — não há como derivá-la de uma env
 * que só existe no build do console. Sem esta entrada o navegador do app bloqueia a requisição
 * antes de sair, e o sintoma no console é um `TypeError: Load failed` sem status HTTP nenhum —
 * indistinguível de "servidor fora do ar" para quem está lendo o erro.
 *
 * Medido em 2026-08-07: o login da v0.1.8 falhava exatamente assim; a cloud respondia 200 a um
 * `curl` do terminal enquanto o app apanhava `NETWORK_ERROR`, porque a CSP só liberava
 * `localhost:3030`.
 *
 * DEVE bater com a repo variable `CODM_CLOUD_URL` que os workflows de release assam em
 * `VITE_CODM_CLOUD_URL` (o console usa aquela para montar as URLs; esta autoriza o tráfego). Mudar
 * uma sem a outra volta a bloquear o login — por isso o rail DSK-11 exige a origem na CSP, e este
 * comentário é o lembrete de que são dois lugares para o mesmo fato.
 *
 * É uma decisão de shell no mesmo sentido de `UPDATER.repo`: nomeia ONDE o produto vive, não um
 * fato do workspace, então é constante aqui e não leitura de `REPO`.
 */
export const CLOUD = {
	origin: 'https://codm.up.railway.app',
} as const
