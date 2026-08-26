#!/usr/bin/env bun
/**
 * Emite o `latest.json` que o tauri-plugin-updater consome (SP1 AC-4; multi-plataforma desde o
 * plano 2026-08-25-windows-linux-build, decisão D4).
 *
 * O manifest é a ÚNICA fonte que o app instalado lê para decidir "há atualização?": `version` é
 * comparada por semver com a instalada, e `platforms.<os>-<arch>` aponta o artefato assinado DA
 * PLATAFORMA QUE ESTÁ RODANDO (.app.tar.gz / .AppImage / -setup.exe) + a assinatura minisign que o
 * cliente verifica contra a pubkey embarcada. Um manifest por canal carrega TODAS as plataformas
 * do release: o job `publish` do workflow recebe os artefatos dos três runners e chama este script
 * UMA vez, com um trio `--platform/--url/--sig-file` por plataforma. A URL é FIXA por canal no beta
 * (asset de nome estável — `config/updater.ts` explica por quê) e versionada no stable; a versão
 * vive aqui, não no nome do arquivo.
 *
 * As chaves são as que o plugin monta a partir de `std::env::consts::{OS,ARCH}` do Rust
 * (`darwin-aarch64`, `linux-x86_64`, `windows-x86_64`) — NÃO são os triples do bun/Go
 * (`build-sidecars.ts` HOST_TRIPLES: `linux-x64`), nem as pastas do bundle do Tauri. Uma chave
 * errada não quebra o CI: o app instalado só nunca encontra a própria plataforma e fica preso para
 * sempre — por isso `UPDATER_PLATFORM_KEYS` é uma lista FECHADA e `buildManifest`/`parseCliArgs`
 * recusam o que não está nela.
 *
 * Puro no núcleo (`buildManifest`, `parseCliArgs`) e fino na casca (CLI) — o teste cobre o núcleo
 * sem tocar disco além de um sig scratch.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Lista FECHADA — só entra aqui uma plataforma que o pipeline de release realmente builda e assina
 *  (D2: windows-arm64 e linux-arm64 ficam de fora — sem prebuild libsql / sem runner). */
export const UPDATER_PLATFORM_KEYS = ['darwin-aarch64', 'linux-x86_64', 'windows-x86_64'] as const
export type UpdaterPlatformKey = (typeof UPDATER_PLATFORM_KEYS)[number]

export function isUpdaterPlatformKey(value: string): value is UpdaterPlatformKey {
	return (UPDATER_PLATFORM_KEYS as readonly string[]).includes(value)
}

export interface ManifestPlatform {
	key: UpdaterPlatformKey
	url: string
	signature: string
}

export interface ManifestInput {
	version: string
	platforms: ManifestPlatform[]
	notes?: string
	/** Injetável para teste determinístico; default = agora. */
	pubDate?: string
}

export interface UpdaterManifest {
	version: string
	pub_date: string
	notes: string
	platforms: Partial<Record<UpdaterPlatformKey, { url: string; signature: string }>>
}

/** Semver com pré-release opcional — cobre `1.2.3` e `1.2.3-beta.42`. */
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

const KNOWN = UPDATER_PLATFORM_KEYS.join(', ')

export function buildManifest(input: ManifestInput): UpdaterManifest {
	if (!SEMVER.test(input.version)) {
		throw new Error(`versão inválida para o manifest: '${input.version}' (esperado semver, ex. 0.1.0 ou 0.1.0-beta.42)`)
	}
	if (input.platforms.length === 0) {
		throw new Error('manifest sem plataformas — o publish precisa de pelo menos um trio --platform/--url/--sig-file')
	}
	const seen: UpdaterManifest['platforms'] = {}
	for (const p of input.platforms) {
		if (!isUpdaterPlatformKey(p.key)) {
			throw new Error(`plataforma desconhecida: '${String(p.key)}' (esperado uma de: ${KNOWN})`)
		}
		if (seen[p.key]) {
			throw new Error(`plataforma duplicada no manifest: '${p.key}'`)
		}
		if (!p.url.startsWith('https://')) {
			throw new Error(`URL do artefato deve ser https (${p.key}): '${p.url}'`)
		}
		if (p.signature.trim().length === 0) {
			throw new Error(`assinatura vazia (${p.key}) — o build não emitiu o .sig? (createUpdaterArtifacts + TAURI_SIGNING_PRIVATE_KEY)`)
		}
		seen[p.key] = { url: p.url, signature: p.signature.trim() }
	}
	// Ordem canônica (a da lista fechada), independente da ordem dos argumentos — o JSON é
	// determinístico e o diff entre dois releases mostra só o que mudou de fato.
	const platforms: UpdaterManifest['platforms'] = {}
	for (const key of UPDATER_PLATFORM_KEYS) {
		const entry = seen[key]
		if (entry) platforms[key] = entry
	}
	return {
		version: input.version,
		pub_date: input.pubDate ?? new Date().toISOString(),
		notes: input.notes ?? '',
		platforms,
	}
}

export interface CliPlatform {
	key: UpdaterPlatformKey
	url: string
	sigFile: string
}

export interface CliArgs {
	version: string
	out: string
	notes?: string
	platforms: CliPlatform[]
}

const USAGE =
	'uso: make-manifest.ts --version <semver> --out <latest.json> [--notes <texto>] (--platform <darwin-aarch64|linux-x86_64|windows-x86_64> --url <https://…> --sig-file <path.sig>)+'

/**
 * Puro sobre argv (sem process.argv, sem process.exit) — testável. `--platform` ABRE um grupo;
 * `--url`/`--sig-file` pertencem ao grupo aberto mais recente. Toda flag consome exatamente um
 * valor, e um valor que começa com `--` é uma flag sem valor, não um valor.
 */
export function parseCliArgs(argv: string[]): CliArgs {
	let version: string | undefined
	let out: string | undefined
	let notes: string | undefined
	const groups: { key: UpdaterPlatformKey; url?: string; sigFile?: string }[] = []
	const current = (flag: string) => {
		const last = groups[groups.length - 1]
		if (!last) throw new Error(`${flag} antes de qualquer --platform\n${USAGE}`)
		return last
	}
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i]
		const value = argv[i + 1]
		if (value === undefined || value.startsWith('--')) throw new Error(`flag sem valor: ${flag}\n${USAGE}`)
		switch (flag) {
			case '--version':
				version = value
				break
			case '--out':
				out = value
				break
			case '--notes':
				notes = value
				break
			case '--platform':
				if (!isUpdaterPlatformKey(value)) throw new Error(`plataforma desconhecida: '${value}' (esperado uma de: ${KNOWN})`)
				groups.push({ key: value })
				break
			case '--url':
				current(flag).url = value
				break
			case '--sig-file':
				current(flag).sigFile = value
				break
			default:
				throw new Error(`flag desconhecida: ${flag}\n${USAGE}`)
		}
	}
	if (!version || !out) throw new Error(USAGE)
	if (groups.length === 0) throw new Error(`nenhum --platform informado\n${USAGE}`)
	const platforms = groups.map((g): CliPlatform => {
		if (!g.url || !g.sigFile) throw new Error(`--platform ${g.key} sem --url ou --sig-file\n${USAGE}`)
		return { key: g.key, url: g.url, sigFile: g.sigFile }
	})
	return { version, out, notes, platforms }
}

function parseOrExit(argv: string[]): CliArgs {
	try {
		return parseCliArgs(argv)
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e))
		process.exit(2)
	}
}

if (import.meta.main) {
	const args = parseOrExit(process.argv.slice(2))
	const manifest = buildManifest({
		version: args.version,
		notes: args.notes,
		platforms: args.platforms.map(p => ({ key: p.key, url: p.url, signature: readFileSync(p.sigFile, 'utf8') })),
	})
	mkdirSync(dirname(args.out), { recursive: true })
	writeFileSync(args.out, `${JSON.stringify(manifest, null, '\t')}\n`)
	console.log(`✓ ${args.out} (${manifest.version}: ${Object.keys(manifest.platforms).join(', ')})`)
}
