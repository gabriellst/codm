/**
 * O build do console para o shell desktop — em TypeScript porque a linha de comando que ele
 * substitui era shell POSIX, e o `cmd.exe` do Windows não a entende.
 *
 * O alvo nx trazia isto, numa linha só:
 *
 *     CODM_DESKTOP=true vite build && if [ ! -f dist/client/_shell.html ]; then echo '…' >&2; exit 1;
 *     fi && cp dist/client/_shell.html dist/client/index.html
 *
 * Três construções POSIX (atribuição de env como prefixo, `if [ … ]`, `cp`) que funcionaram por meses
 * porque todo build acontecia em macOS ou Linux. No primeiro `tauri build` nativo em `windows-latest`
 * (2026-08-26) o `cmd.exe` respondeu `! was unexpected at this time.` — mesma classe do defeito que o
 * `emit-openapi-run.ts` corrigiu no mesmo dia, e o segundo sinal de que shell script embutido em
 * alvo nx é uma dependência de plataforma escondida.
 *
 * A GUARDA É O CORAÇÃO DAQUI, não o build. `vite build` com o preset SPA do TanStack Start emite a
 * casca em `dist/client/_shell.html`, e o Tauri serve `index.html` — a cópia é o que liga os dois. Se
 * um dia o Start renomear aquela saída, o build continuaria "passando" e o app empacotado abriria uma
 * tela branca, porque o `index.html` seria o de ontem (ou nenhum). Então a ausência do arquivo é erro
 * ALTO, com a mensagem dizendo exatamente o que aconteceu e onde consertar.
 */
import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

const SHELL = join('dist', 'client', '_shell.html')
const INDEX = join('dist', 'client', 'index.html')

// `CODM_DESKTOP` liga o modo desktop do vite.config (base `/`, casca SPA, sem nitro). Vai no env do
// FILHO, em vez de prefixo de linha de comando: é a mesma informação, sem depender de shell.
const build = Bun.spawnSync(['bun', 'x', 'vite', 'build'], {
	env: { ...process.env, CODM_DESKTOP: 'true' },
	stdout: 'inherit',
	stderr: 'inherit',
})

if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

if (!existsSync(SHELL)) {
	console.error(
		`build-spa: ${SHELL} missing — TanStack Start renamed its SPA shell output; update packages/app/react/scripts/build-spa.ts`,
	)
	process.exit(1)
}

await copyFile(SHELL, INDEX)
