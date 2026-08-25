#!/usr/bin/env bun
/**
 * Emite o `latest.json` que o tauri-plugin-updater consome (SP1, AC-4).
 *
 * O manifest é a ÚNICA fonte que o app instalado lê para decidir "há atualização?": `version` é
 * comparada por semver com a instalada, e `platforms.darwin-aarch64` aponta o artefato assinado
 * (.app.tar.gz) + a assinatura minisign que o cliente verifica contra a pubkey embarcada. A URL é
 * FIXA por canal (asset de nome estável — `config/updater.ts` explica por quê); a versão vive
 * aqui, não no nome do arquivo.
 *
 * Puro no núcleo (`buildManifest`) e fino na casca (CLI) — o teste cobre o núcleo sem tocar disco
 * além de um sig scratch.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** darwin/arm64 é o único alvo do SP1 (decisão 7 do spec); novos alvos = novas chaves aqui. */
export interface ManifestInput {
	version: string
	url: string
	signature: string
	notes?: string
	/** Injetável para teste determinístico; default = agora. */
	pubDate?: string
}

export interface UpdaterManifest {
	version: string
	pub_date: string
	notes: string
	platforms: Record<'darwin-aarch64', { url: string; signature: string }>
}

/** Semver com pré-release opcional — cobre `1.2.3` e `1.2.3-beta.42`. */
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

export function buildManifest(input: ManifestInput): UpdaterManifest {
	if (!SEMVER.test(input.version)) {
		throw new Error(`versão inválida para o manifest: '${input.version}' (esperado semver, ex. 0.1.0 ou 0.1.0-beta.42)`)
	}
	if (!input.url.startsWith('https://')) {
		throw new Error(`URL do artefato deve ser https: '${input.url}'`)
	}
	if (input.signature.trim().length === 0) {
		throw new Error('assinatura vazia — o build não emitiu o .sig? (createUpdaterArtifacts + TAURI_SIGNING_PRIVATE_KEY)')
	}
	return {
		version: input.version,
		pub_date: input.pubDate ?? new Date().toISOString(),
		notes: input.notes ?? '',
		platforms: { 'darwin-aarch64': { url: input.url, signature: input.signature.trim() } },
	}
}

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 ? process.argv[i + 1] : undefined
}

if (import.meta.main) {
	const version = arg('version')
	const url = arg('url')
	const sigFile = arg('sig-file')
	const out = arg('out')
	if (!version || !url || !sigFile || !out) {
		console.error('uso: make-manifest.ts --version <semver> --url <https://…> --sig-file <path.sig> --out <latest.json> [--notes <texto>]')
		process.exit(2)
	}
	const manifest = buildManifest({ version, url, signature: readFileSync(sigFile, 'utf8'), notes: arg('notes') })
	mkdirSync(dirname(out), { recursive: true })
	writeFileSync(out, `${JSON.stringify(manifest, null, '\t')}\n`)
	console.log(`✓ ${out} (${manifest.version})`)
}
