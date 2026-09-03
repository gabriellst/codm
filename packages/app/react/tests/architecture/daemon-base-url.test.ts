import { describe, expect, it } from 'bun:test'
import { scanPosix } from './support/scan'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL — QUEM MONTA UMA URL DO DAEMON LÊ A PORTA QUE O HOST RESOLVEU, NUNCA A ASSADA NO BUNDLE.
 *
 * O bug do founder (26/08/2026): "login com GitHub leva para `http://127.0.0.1:3030/sign-in/loopback?code=…`
 * em vez do servidor de fato". Nada no fluxo de OAuth estava errado — o provedor autenticava, o
 * `/desktop-callback` da nuvem cunhava o código de uso único e redirecionava certinho. O que estava
 * errado era o NÚMERO que o console mandou junto: `buildSignInUrl` lia `new URL(Config.baseUrl).port`,
 * e `Config.baseUrl` é `VITE_API_URL` — o valor ASSADO no build, `3030`, a família de portas do
 * `bun dev`. Num app empacotado o daemon deixou de escutar ali em 25/08: o shell tenta as candidatas
 * de `packages/app/tauri/config/ports.ts` (47330/47340/…) e fica com a primeira livre. O navegador
 * então entregava o código a uma porta sem ninguém do outro lado, e da cadeira do operador o login
 * simplesmente não fechava — falha tardia e silenciosa, DEPOIS da senha já digitada.
 *
 * A causa não era do login: era de LER O VALOR ERRADO. Toda URL montada à mão sofria do mesmo mal —
 * o stream SSE (`useServerEvents`), o terminal (`useTerminalStream`), os avatares (`ThreadAvatar`) e
 * a pré-visualização de artefato (`ArtifactPreview`) apontavam todos para `3030`. As chamadas
 * GERADAS pela SDK nunca sofreram: elas resolvem pelo registro que o `ServicesProvider` reescreve no
 * boot (`configureClient`) com a porta que o host informou. `daemonBaseUrl()` é esse mesmo registro,
 * exposto para quem precisa de uma string — logo, uma fonte, não duas.
 *
 * O predicado é QUALQUER `Config.<algo>BaseUrl` FORA de `lib/config.ts` — não só `Config.baseUrl`.
 * A diferença não é zelo: `Config` também expunha um `gatewayBaseUrl` (`${baseUrl}/external/channel`),
 * a MESMA fórmula sobre o MESMO valor assado. Ninguém o consumia, então ele saiu junto com este
 * conserto — mas um predicado preso ao nome `baseUrl` teria ficado VERDE no dia em que alguém
 * montasse uma URL do gateway à mão a partir dele: o mesmo bug, com outro nome. `Config.cloudUrl`
 * não casa, e é certo que não case — a nuvem é outra origem, decidida em build por
 * `VITE_CODM_CLOUD_URL`, e ler dela é legítimo.
 *
 * `lib/config.ts` é o dono isento (é lá que `serviceBaseUrls` semeia o registro e que o fallback
 * vive), e comentários/docblocks continuam livres para CITAR os nomes — a rail lê código, não prosa.
 *
 * FALSEADO nas duas metades: trocar `daemonBaseUrl()` por `Config.baseUrl` em qualquer um dos seis
 * call sites deixa esta rail vermelha, e a fixture negativa abaixo prova que um `Config.gatewayBaseUrl`
 * reintroduzido fora do dono também cai — que é exatamente a folga que o predicado antigo tinha.
 */

const REACT_SRC = resolve(import.meta.dirname, '../../src')

/** O dono do valor — é aqui que ele nasce, é semeado no registro da SDK e serve de fallback. */
const OWNER = 'lib/config.ts'

/**
 * A leitura proibida — em CÓDIGO. `Config.baseUrl`, `Config.gatewayBaseUrl` e qualquer irmão futuro
 * com a mesma terminação: todos são o valor ASSADO no build, e todos reintroduzem o mesmo defeito.
 *
 * Comentários de linha (`//`) e de bloco (` * `) são removidos antes do teste: os docblocks que
 * EXPLICAM esta regra precisam nomear `Config.baseUrl` para serem úteis, e um predicado cego à
 * diferença transformaria a própria documentação da rail em violação.
 */
const FORBIDDEN = /\bConfig\.[A-Za-z]*[Bb]aseUrl\b/

function stripComments(source: string): string {
	return source
		.split('\n')
		.map(line => line.replace(/^\s*\*.*$/, '').replace(/\/\/.*$/, ''))
		.join('\n')
}

async function sourceFiles(): Promise<string[]> {
	const out: string[] = []
	for (const pattern of ['**/*.ts', '**/*.tsx']) out.push(...(await scanPosix(pattern, REACT_SRC)))
	return out.filter(entry => !/\.(test|stories)\.tsx?$/.test(entry) && entry !== OWNER).sort()
}

describe('rail — a origem do daemon é a que o host resolveu, não a assada no build', () => {
	it('nenhum arquivo fora de lib/config.ts lê Config.baseUrl', async () => {
		const offenders = (await sourceFiles()).filter(f => FORBIDDEN.test(stripComments(readFileSync(join(REACT_SRC, f), 'utf8'))))

		expect(offenders).toEqual([])
	})

	it('os call sites que montam URL do daemon à mão passam por daemonBaseUrl()', async () => {
		// Os seis que o incidente alcançou. Listados NOMINALMENTE porque a metade que importa desta
		// rail é positiva: a asserção acima só prova que ninguém lê o valor errado, e um call site que
		// perdesse a origem inteira (URL relativa, literal `127.0.0.1`) passaria por ela em silêncio.
		const CALL_SITES = [
			'components/console/ThreadAvatar.tsx',
			'hooks/useServerEvents.ts',
			'hooks/useTerminalStream.ts',
			'routes/(app)/-hooks/useLoopbackAuth.ts',
			'routes/(app)/threads/$threadId/-components/ArtifactPreview/index.tsx',
			'routes/login/-components/LoginSection/index.tsx',
		]

		const missing = CALL_SITES.filter(f => !readFileSync(join(REACT_SRC, f), 'utf8').includes('daemonBaseUrl()'))

		expect(missing).toEqual([])
	})

	it('o predicado pega um irmão de Config, não só o nome que causou o incidente', () => {
		// FIXTURE NEGATIVA — a folga que o predicado antigo (`\bConfig\.baseUrl\b`) tinha. Sem esta
		// asserção, alargá-lo seria uma afirmação sobre o regex que ninguém verificou, e encolhê-lo de
		// volta num refactor não faria barulho nenhum.
		expect(FORBIDDEN.test('const url = `${Config.gatewayBaseUrl}/pair`')).toBe(true)
		expect(FORBIDDEN.test('const url = `${Config.baseUrl}/ui/home`')).toBe(true)

		// E a fronteira do outro lado: a NUVEM é outra origem, decidida em build de propósito
		// (`VITE_CODM_CLOUD_URL`), e `LoginSection` a lê legitimamente ao montar a URL do OAuth. Um
		// predicado que a pegasse tornaria a rail impossível de satisfazer sem quebrar o login.
		expect(FORBIDDEN.test('const url = `${Config.cloudUrl}/sign-in/social`')).toBe(false)
	})
})
