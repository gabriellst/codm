/**
 * A origem do PostHog — telemetria de produto do console (SP4).
 *
 * Vive aqui pelo mesmo motivo que `./cloud.ts`: o webview roda sob uma CSP, e `connect-src` é uma
 * lista fechada renderizada no `tauri.conf.json` em tempo de GERAÇÃO. Não dá para derivá-la de
 * `VITE_POSTHOG_HOST`, que só existe no build do console — são dois lugares para o mesmo fato, e o
 * rail DSK-11 existe para eles não divergirem em silêncio.
 *
 * Sem esta entrada o app EMPACOTADO inicializa o PostHog normalmente e todo `capture`/`identify` é
 * bloqueado pelo navegador antes de sair — e o sintoma é um `TypeError: Load failed` sem status
 * HTTP, indistinguível de "servidor fora do ar". Foi assim que o login quebrou em 2026-08-07, e
 * telemetria falha em silêncio é pior que login: ninguém percebe, os números só ficam vazios.
 *
 * DEVE bater com a repo variable `VITE_POSTHOG_HOST` que os workflows assam no bundle. US cloud por
 * decisão do founder (2026-08-07); a região é imutável na criação da conta PostHog.
 */
export const ANALYTICS = {
	origin: 'https://us.i.posthog.com',
} as const
