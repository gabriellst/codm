/**
 * API discovery — quais superfícies este repo publica, e onde cada spec mora.
 *
 * Até 2026-08-14 a resposta era "uma por pasta de serviço": `packages/api/<service>/` → 1 spec →
 * 1 client. O ADR 0001 quebrou essa premissa. O mesmo backend TypeScript passa a servir DUAS
 * superfícies — o daemon local (oito contextos) e o deployment de nuvem (auth + owner + shared) —
 * porque a composição explícita monta contextos diferentes sob critérios diferentes. Duas
 * composições, duas specs, dois clients.
 *
 * O PERFIL É EIXO DECLARADO, nunca inferido de nome de arquivo. A regra é a do `CLAUDE.md`
 * ("contrato antes de implementação"): a tabela abaixo diz quais perfis existem e qual arquivo cada
 * um escreve; o nome do arquivo é CONSEQUÊNCIA da declaração, não a fonte dela. Um walker que
 * deduzisse "cloud" de um `.cloud.` no nome transformaria uma convenção de nome em contrato — e a
 * primeira spec chamada `openapi.cloudflare.json` viraria um perfil.
 *
 * Spec fica em `<service>/public/docs/<arquivo>` (convenção utoipa) ou `<service>/public/<arquivo>`
 * (saída do walker Go).
 */
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Os perfis que existem. Um perfil novo é UMA linha aqui, e propaga para todos os geradores. */
export type ApiProfile = 'local' | 'cloud'

interface ProfileDecl {
	readonly profile: ApiProfile
	/** O arquivo que ESTE perfil escreve, dentro de `public/` ou `public/docs/`. */
	readonly specFile: string
	/** Por que este perfil existe — nunca "porque o arquivo estava lá". */
	readonly why: string
}

const PROFILES: readonly ProfileDecl[] = [
	{
		profile: 'local',
		specFile: 'openapi.json',
		why: 'o daemon de desktop: os oito contextos que o ADR 0002 aloca em `local`. É o perfil default, e mantém o nome de arquivo histórico para que um repo de uma superfície só não aprenda que existe um eixo.',
	},
	{
		profile: 'cloud',
		specFile: 'openapi.cloud.json',
		why: 'o deployment de nuvem: `auth` + `owner` + `shared`. Existe porque identidade e tenancy vivem na nuvem (ADR 0001) e o desktop precisa de um client TIPADO para falar com ela — é a mesma SDK, apontada para outra URL, e não um segundo cliente HTTP à mão.',
	},
]

export interface ApiSource {
	readonly service: string
	readonly profile: ApiProfile
	/**
	 * A chave de SAÍDA dos geradores. `local` mantém o nome do serviço — nenhum caminho gerado muda
	 * para quem só tem a superfície default. Os demais ganham sufixo, para que dois clients do mesmo
	 * serviço nunca disputem a mesma pasta.
	 */
	readonly clientId: string
	readonly specPath: string
}

const SPEC_DIRS = [['public', 'docs'], ['public']] as const

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function findSpec(rootDir: string, specFile: string): Promise<string | null> {
	for (const dir of SPEC_DIRS) {
		const candidate = join(rootDir, ...dir, specFile)
		if (await fileExists(candidate)) return candidate
	}
	return null
}

/** `local` fica com o nome do serviço; qualquer outro perfil ganha sufixo. */
export const clientIdOf = (service: string, profile: ApiProfile): string => (profile === 'local' ? service : `${service}-${profile}`)

export async function discoverApis(repoRoot: string): Promise<ApiSource[]> {
	const apiRoot = join(repoRoot, 'packages', 'api')
	if (!(await fileExists(apiRoot))) return []

	const services = (await readdir(apiRoot, { withFileTypes: true }))
		.filter(d => d.isDirectory())
		.map(d => d.name)
		.sort()

	const sources: ApiSource[] = []
	for (const service of services) {
		for (const decl of PROFILES) {
			const spec = await findSpec(join(apiRoot, service), decl.specFile)
			// Um serviço que não publica um perfil simplesmente não o tem — o gateway Go serve uma
			// superfície só, e isso é um fato sobre ele, não uma lacuna a preencher.
			if (spec) sources.push({ service, profile: decl.profile, clientId: clientIdOf(service, decl.profile), specPath: spec })
		}
	}
	return sources
}

export function formatSpecPath(source: ApiSource, repoRoot: string): string {
	return relative(repoRoot, source.specPath)
}
