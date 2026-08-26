/**
 * A origem pública da fatia cloud — onde o console troca o código do deep link por device token e
 * revoga a sessão no logout (`/cloud/devices/{exchange,revoke}`).
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
 * É A FONTE, não uma cópia. Até 2026-08-26 este valor "devia bater" com uma repo variable
 * `CODM_CLOUD_URL` que os workflows assavam em `VITE_CODM_CLOUD_URL` — dois lugares para o mesmo
 * fato, e um terceiro (o env do daemon empacotado) que ninguém preenchia, daí o 0.5.1 nascer sem
 * saber onde a nuvem mora. Hoje `./env` (SHELL_ENV.CODM_CLOUD_URL) lê daqui; `./generate.ts`
 * renderiza o mesmo valor na CSP e em `src-tauri/shell-env.json`; `build.rs` o entrega ao
 * supervisor Rust, que o passa ao daemon; e os workflows de release exportam `VITE_CODM_CLOUD_URL`
 * a partir do JSON comitado. Mudar a nuvem de endereço = mudar esta linha e regenerar.
 *
 * É uma decisão de shell no mesmo sentido de `UPDATER.repo`: nomeia ONDE o produto vive, não um
 * fato do workspace, então é constante aqui e não leitura de `REPO`.
 */
export const CLOUD = {
	origin: 'https://codm.up.railway.app',
} as const
