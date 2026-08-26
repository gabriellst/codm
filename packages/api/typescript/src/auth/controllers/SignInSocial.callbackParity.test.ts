import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { DESKTOP_CALLBACK } from '@auth/controllers/SignInSocial'

/**
 * desktop-callback-parity — O `callbackURL` APONTA PARA UMA ROTA QUE EXISTE DE VERDADE.
 *
 * ── o defeito que este trilho existe para pegar, e que já aconteceu ──────────────────────────────
 * O `SignInSocialController` manda `callbackURL` ao better-auth, e o provedor devolve o browser para lá
 * DEPOIS de autenticar. Quando os controllers saíram da pasta `cloud/`, a ponte passou de
 * `/cloud/desktop-callback` para `/desktop-callback` e o literal do `callbackURL` ficou para
 * trás. Nada ficou vermelho: a suíte só assegurava que a ORIGEM do `callbackURL` era confiável,
 * nunca que o CAMINHO existia.
 *
 * O modo de falha é o pior tipo — silencioso e TARDIO. O operador clica, o Google autentica com
 * SUCESSO, e só então o navegador aterrissa num 404: o deep link `codm://` nunca dispara, o app fica
 * na tela de login, e nada diz o que houve. Quem depurasse procuraria no provedor, que é o único
 * lugar onde o problema não está. Medido ao vivo em 2026-08-15 contra a nuvem local:
 * `/desktop-callback` → 401 (existe, faltou sessão); `/cloud/desktop-callback` → 404.
 *
 * ── por que a asserção é contra o OPENAPI, e não contra o `path` do controller ───────────────────
 * `DESKTOP_CALLBACK` deriva de `DESKTOP_CALLBACK_PATH`, exportado pelo próprio
 * `DesktopCallbackController`, então um rename move os dois juntos e o `tsc` cobra. O que este
 * trilho guarda é a outra metade — que o controller esteja MONTADO no deployment que o `callbackURL`
 * aponta (o `auth` é cloud-only): o openapi é o retrato do que foi realmente montado, e é lá que a
 * constante e o roteador se encontram. Quando o `MainRouter` ainda prefixava a versão (`/v1`), este
 * mesmo teste era o único que via o prefixo, porque nenhum dos dois arquivos o conhecia.
 */
describe('desktop-callback-parity — o callbackURL do login aponta para uma rota montada', () => {
	const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..')
	const CLOUD_SPEC = path.join(REPO_ROOT, 'packages/api/typescript/public/docs/openapi.cloud.json')

	it('DCB-01: a rota do callbackURL está no spec do deployment que a serve', () => {
		const spec = JSON.parse(readFileSync(CLOUD_SPEC, 'utf-8')) as { paths: Record<string, unknown> }

		expect(
			Object.keys(spec.paths),
			`o callbackURL aponta para ${DESKTOP_CALLBACK}, que o deployment de nuvem não serve — ` +
				'o login morreria num 404 DEPOIS de o provedor autenticar',
		).toContain(DESKTOP_CALLBACK)
	})
})
