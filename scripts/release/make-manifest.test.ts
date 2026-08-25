import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { UPDATER_PLATFORM_KEYS, buildManifest, parseCliArgs } from './make-manifest'

const R2 = 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev'

describe('make-manifest (SP1 AC-4 · multi-plataforma, plano 2026-08-25)', () => {
	const darwin = {
		key: 'darwin-aarch64' as const,
		url: `${R2}/beta/codm-aarch64.app.tar.gz`,
		signature: 'dW50cnVzdGVk…assinatura-mac…\n',
	}
	const linux = {
		key: 'linux-x86_64' as const,
		url: `${R2}/beta/codm-linux-x86_64.AppImage`,
		signature: 'dW50cnVzdGVk…assinatura-linux…\n',
	}
	const windows = {
		key: 'windows-x86_64' as const,
		url: `${R2}/beta/codm-windows-x86_64-setup.exe`,
		signature: 'dW50cnVzdGVk…assinatura-win…\n',
	}
	const base = { version: '0.1.0-beta.42', pubDate: '2026-08-25T07:00:00.000Z' }

	it('a lista fechada de chaves é exatamente a que o plugin monta de OS-ARCH', () => {
		// O falsificador: uma chave como `linux-x64` (triple do bun) ou `linux-amd64` (Go) passaria
		// no CI e o app instalado nunca acharia a própria plataforma — preso para sempre.
		expect([...UPDATER_PLATFORM_KEYS]).toEqual(['darwin-aarch64', 'linux-x86_64', 'windows-x86_64'])
	})

	it('emite a forma exata que o plugin consome, uma entrada por plataforma, assinaturas aparadas', () => {
		const m = buildManifest({ ...base, notes: 'beta abc123', platforms: [darwin, linux, windows] })
		expect(m).toEqual({
			version: '0.1.0-beta.42',
			pub_date: '2026-08-25T07:00:00.000Z',
			notes: 'beta abc123',
			platforms: {
				'darwin-aarch64': { url: darwin.url, signature: 'dW50cnVzdGVk…assinatura-mac…' },
				'linux-x86_64': { url: linux.url, signature: 'dW50cnVzdGVk…assinatura-linux…' },
				'windows-x86_64': { url: windows.url, signature: 'dW50cnVzdGVk…assinatura-win…' },
			},
		})
	})

	it('a ordem das plataformas no JSON é a canônica, não a dos argumentos', () => {
		const m = buildManifest({ ...base, platforms: [windows, darwin, linux] })
		expect(Object.keys(m.platforms)).toEqual(['darwin-aarch64', 'linux-x86_64', 'windows-x86_64'])
	})

	it('uma plataforma só continua válida (subconjunto é permitido; o "tudo ou nada" é decisão do workflow)', () => {
		const m = buildManifest({ ...base, platforms: [darwin] })
		expect(Object.keys(m.platforms)).toEqual(['darwin-aarch64'])
		expect(m.notes).toBe('')
	})

	it('aceita semver estável e com pré-release; recusa o resto', () => {
		expect(() => buildManifest({ ...base, version: '1.2.3', platforms: [darwin] })).not.toThrow()
		// O falsificador de AC-4: uma tag mal formada tem de morrer AQUI, no CI, nunca no cliente —
		// um manifest com versão não-semver faria o updater instalado falhar em silêncio para sempre.
		for (const bad of ['v1.2.3', '1.2', 'beta.42', '1.2.3-', '']) {
			expect(() => buildManifest({ ...base, version: bad, platforms: [darwin] })).toThrow('versão inválida')
		}
	})

	it('recusa lista vazia e plataforma duplicada', () => {
		expect(() => buildManifest({ ...base, platforms: [] })).toThrow('sem plataformas')
		expect(() => buildManifest({ ...base, platforms: [darwin, linux, { ...darwin, url: `${R2}/beta/outro.tar.gz` }] })).toThrow(
			"plataforma duplicada no manifest: 'darwin-aarch64'",
		)
	})

	it('recusa URL não-https e assinatura vazia — nomeando a plataforma culpada', () => {
		expect(() => buildManifest({ ...base, platforms: [darwin, { ...linux, url: 'http://inseguro/x.AppImage' }] })).toThrow(
			'https (linux-x86_64)',
		)
		expect(() => buildManifest({ ...base, platforms: [darwin, { ...windows, signature: '  \n' }] })).toThrow(
			'assinatura vazia (windows-x86_64)',
		)
	})
})

describe('make-manifest CLI — trios --platform/--url/--sig-file repetidos', () => {
	const triple = (key: string, asset: string) => ['--platform', key, '--url', `${R2}/beta/${asset}`, '--sig-file', `dist/${asset}.sig`]

	it('parseia N trios na ordem dada + version/out/notes', () => {
		const args = parseCliArgs([
			'--version',
			'0.1.0-beta.7',
			...triple('darwin-aarch64', 'codm-aarch64.app.tar.gz'),
			...triple('linux-x86_64', 'codm-linux-x86_64.AppImage'),
			...triple('windows-x86_64', 'codm-windows-x86_64-setup.exe'),
			'--notes',
			'beta — main@abc',
			'--out',
			'dist/latest.json',
		])
		expect(args).toEqual({
			version: '0.1.0-beta.7',
			out: 'dist/latest.json',
			notes: 'beta — main@abc',
			platforms: [
				{ key: 'darwin-aarch64', url: `${R2}/beta/codm-aarch64.app.tar.gz`, sigFile: 'dist/codm-aarch64.app.tar.gz.sig' },
				{ key: 'linux-x86_64', url: `${R2}/beta/codm-linux-x86_64.AppImage`, sigFile: 'dist/codm-linux-x86_64.AppImage.sig' },
				{ key: 'windows-x86_64', url: `${R2}/beta/codm-windows-x86_64-setup.exe`, sigFile: 'dist/codm-windows-x86_64-setup.exe.sig' },
			],
		})
	})

	it('recusa --url/--sig-file antes de qualquer --platform, trio incompleto, chave desconhecida, flag sem valor', () => {
		const head = ['--version', '1.0.0', '--out', 'x.json']
		expect(() => parseCliArgs([...head, '--url', `${R2}/a`, '--platform', 'darwin-aarch64', '--sig-file', 'a.sig'])).toThrow(
			'--url antes de qualquer --platform',
		)
		expect(() => parseCliArgs([...head, '--platform', 'darwin-aarch64', '--url', `${R2}/a`])).toThrow(
			'--platform darwin-aarch64 sem --url ou --sig-file',
		)
		expect(() => parseCliArgs([...head, ...triple('linux-x64', 'a')])).toThrow("plataforma desconhecida: 'linux-x64'")
		expect(() => parseCliArgs([...head, ...triple('windows-aarch64', 'a')])).toThrow('plataforma desconhecida')
		expect(() => parseCliArgs([...head, '--platform'])).toThrow('flag sem valor: --platform')
		expect(() => parseCliArgs([...head, '--bogus', '1'])).toThrow('flag desconhecida: --bogus')
	})

	it('recusa --version/--out ausentes e nenhum --platform', () => {
		expect(() => parseCliArgs(['--out', 'x.json', ...triple('darwin-aarch64', 'a')])).toThrow('uso:')
		expect(() => parseCliArgs(['--version', '1.0.0', ...triple('darwin-aarch64', 'a')])).toThrow('uso:')
		expect(() => parseCliArgs(['--version', '1.0.0', '--out', 'x.json'])).toThrow('nenhum --platform')
	})

	it('end-to-end: a casca lê cada .sig do disco e grava o latest.json com todas as plataformas', () => {
		const dir = mkdtempSync(join(tmpdir(), 'codm-make-manifest-'))
		try {
			writeFileSync(join(dir, 'mac.sig'), 'sig-mac\n')
			writeFileSync(join(dir, 'win.sig'), 'sig-win\n')
			const out = join(dir, 'out', 'latest.json')
			const proc = Bun.spawnSync(
				[
					'bun',
					resolve(import.meta.dirname, 'make-manifest.ts'),
					'--version',
					'1.2.3',
					'--platform',
					'windows-x86_64',
					'--url',
					`${R2}/stable/CODM_v1.2.3_windows-x86_64-setup.exe`,
					'--sig-file',
					join(dir, 'win.sig'),
					'--platform',
					'darwin-aarch64',
					'--url',
					`${R2}/stable/CODM_v1.2.3_aarch64.app.tar.gz`,
					'--sig-file',
					join(dir, 'mac.sig'),
					'--notes',
					'stable v1.2.3',
					'--out',
					out,
				],
				{ stdout: 'pipe', stderr: 'pipe' },
			)
			expect(proc.exitCode).toBe(0)
			const written = JSON.parse(readFileSync(out, 'utf8'))
			expect(written.version).toBe('1.2.3')
			expect(written.notes).toBe('stable v1.2.3')
			expect(Object.keys(written.platforms)).toEqual(['darwin-aarch64', 'windows-x86_64'])
			expect(written.platforms['windows-x86_64']).toEqual({
				url: `${R2}/stable/CODM_v1.2.3_windows-x86_64-setup.exe`,
				signature: 'sig-win',
			})
			expect(written.platforms['darwin-aarch64'].signature).toBe('sig-mac')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('end-to-end: argumentos inválidos saem com código 2 e a mensagem de uso, sem gravar nada', () => {
		const dir = mkdtempSync(join(tmpdir(), 'codm-make-manifest-'))
		try {
			const proc = Bun.spawnSync(
				['bun', resolve(import.meta.dirname, 'make-manifest.ts'), '--version', '1.0.0', '--out', join(dir, 'latest.json')],
				{
					stdout: 'pipe',
					stderr: 'pipe',
				},
			)
			expect(proc.exitCode).toBe(2)
			expect(proc.stderr.toString()).toContain('nenhum --platform')
			expect(() => readFileSync(join(dir, 'latest.json'))).toThrow()
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
