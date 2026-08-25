// pencil-export.test.ts — offline coverage of the bridge's PURE parts (T1, scope fence: OFFLINE).
// No process spawned, no Pen contacted — every case here works from fixtures alone. The transport
// (`PencilBridge`) and the three live stage runners are exercised for real only in Task T2/T3.
import { describe, expect, it } from 'bun:test'
import {
	assignSlugs,
	buildManifest,
	parseJsonRpcLines,
	type ScreenInput,
	type ScreensManifest,
	serializeTokensJson,
	slugify,
	withMeasuredDims,
} from './pencil-export'
import type { TokensJson } from './generate-tokens'

describe('slugify', () => {
	it('remove acentos, baixa a caixa e colapsa não-alfanuméricos', () => {
		expect(slugify('Screen 1 — Início (cheio)')).toBe('screen-1-inicio-cheio')
	})

	it('apara traços nas pontas', () => {
		expect(slugify('  Onboarding!!  ')).toBe('onboarding')
	})

	it('é determinístico', () => {
		expect(slugify('Conta & Config')).toBe(slugify('Conta & Config'))
	})
})

describe('assignSlugs', () => {
	it('usa o nome sozinho quando não há colisão', () => {
		const screens: ScreenInput[] = [
			{ id: '1', name: 'Início', area: 'Início', width: 100, height: 100 },
			{ id: '2', name: 'Login', area: 'Onboarding', width: 100, height: 100 },
		]
		const result = assignSlugs(screens)
		expect(result[0]?.slug).toBe('inicio')
		expect(result[1]?.slug).toBe('login')
	})

	it('colisão entre áreas → prefixo da área slugificada', () => {
		const screens: ScreenInput[] = [
			{ id: '1', name: 'Login', area: 'Onboarding', width: 100, height: 100 },
			{ id: '2', name: 'Login', area: 'Site público', width: 100, height: 100 },
		]
		const result = assignSlugs(screens)
		expect(result[0]?.slug).toBe('onboarding-login')
		expect(result[1]?.slug).toBe('site-publico-login')
	})

	it('colisão residual (mesma área e nome) ganha sufixo determinístico pela ordem do documento', () => {
		const screens: ScreenInput[] = [
			{ id: '1', name: 'Login', area: 'Onboarding', width: 100, height: 100 },
			{ id: '2', name: 'Login', area: 'Onboarding', width: 100, height: 100 },
			{ id: '3', name: 'Login', area: 'Onboarding', width: 100, height: 100 },
		]
		const result = assignSlugs(screens)
		expect(result[0]?.slug).toBe('onboarding-login')
		expect(result[1]?.slug).toBe('onboarding-login-2')
		expect(result[2]?.slug).toBe('onboarding-login-3')
	})
})

describe('parseJsonRpcLines', () => {
	it('parseia 2 JSONs completos e guarda o parcial em rest', () => {
		const chunk = '{"jsonrpc":"2.0","id":1,"result":{}}\n{"jsonrpc":"2.0","id":2,"result":{}}\n{"jsonrpc":"2.0","id":3'
		const { messages, rest } = parseJsonRpcLines(chunk)
		expect(messages).toEqual([
			{ jsonrpc: '2.0', id: 1, result: {} },
			{ jsonrpc: '2.0', id: 2, result: {} },
		])
		expect(rest).toBe('{"jsonrpc":"2.0","id":3')
	})

	it('o rest de uma chamada some para a próxima e completa a mensagem', () => {
		const first = parseJsonRpcLines('{"a":1}\n{"b":2')
		expect(first.messages).toEqual([{ a: 1 }])
		const second = parseJsonRpcLines(`${first.rest}}\n`)
		expect(second.messages).toEqual([{ b: 2 }])
		expect(second.rest).toBe('')
	})

	it('ignora linhas em branco', () => {
		const { messages, rest } = parseJsonRpcLines('\n{"a":1}\n\n')
		expect(messages).toEqual([{ a: 1 }])
		expect(rest).toBe('')
	})
})

describe('buildManifest', () => {
	const screens: ScreenInput[] = [
		{ id: 'node-b', name: 'Zebra', area: 'Início', width: 1440, height: 900 },
		{ id: 'node-a', name: 'Abacaxi', area: 'Início', width: 1440, height: 900 },
	]

	it('ordena por slug, não pela ordem de descoberta', () => {
		const manifest = buildManifest(screens, undefined)
		expect(manifest.screens.map(s => s.slug)).toEqual(['abacaxi', 'zebra'])
	})

	it('preserva exportNodeId de um manifesto pré-existente, casado por id', () => {
		const existing: ScreensManifest = {
			generatedFrom: 'design/codm.pen',
			screens: [{ id: 'node-b', slug: 'zebra', area: 'Início', name: 'Zebra', width: 1440, height: 900, exportNodeId: 'inner-frame-42' }],
		}
		const manifest = buildManifest(screens, existing)
		const zebra = manifest.screens.find(s => s.id === 'node-b')
		const abacaxi = manifest.screens.find(s => s.id === 'node-a')
		expect(zebra?.exportNodeId).toBe('inner-frame-42')
		expect(abacaxi?.exportNodeId).toBeUndefined()
	})

	it('generatedFrom é fixo em design/codm.pen por padrão', () => {
		const manifest = buildManifest(screens, undefined)
		expect(manifest.generatedFrom).toBe('design/codm.pen')
	})
})

describe('withMeasuredDims', () => {
	const manifest: ScreensManifest = {
		generatedFrom: 'design/codm.pen',
		screens: [
			{ id: 'node-a', slug: 'abacaxi', area: 'Início', name: 'Abacaxi', width: 0, height: 0 },
			{ id: 'node-b', slug: 'zebra', area: 'Início', name: 'Zebra', width: 0, height: 0, exportNodeId: 'inner-frame-42' },
		],
	}

	it('atualiza width/height dos slugs medidos', () => {
		const result = withMeasuredDims(manifest, { abacaxi: { width: 1440, height: 900 }, zebra: { width: 800, height: 600 } })
		expect(result.screens.find(s => s.slug === 'abacaxi')).toMatchObject({ width: 1440, height: 900 })
		expect(result.screens.find(s => s.slug === 'zebra')).toMatchObject({ width: 800, height: 600 })
	})

	it('preserva exportNodeId e a ordenação por slug', () => {
		const result = withMeasuredDims(manifest, { abacaxi: { width: 1440, height: 900 } })
		expect(result.screens.map(s => s.slug)).toEqual(['abacaxi', 'zebra'])
		expect(result.screens.find(s => s.slug === 'zebra')?.exportNodeId).toBe('inner-frame-42')
	})

	it('ignora slug desconhecido em dims (não inventa entrada nova)', () => {
		const result = withMeasuredDims(manifest, { 'nao-existe': { width: 99, height: 99 } })
		expect(result.screens).toHaveLength(2)
		expect(result.screens.find(s => s.slug === 'abacaxi')).toMatchObject({ width: 0, height: 0 })
	})

	it('deixa intocado o slug sem entrada em dims', () => {
		const result = withMeasuredDims(manifest, { abacaxi: { width: 1440, height: 900 } })
		expect(result.screens.find(s => s.slug === 'zebra')).toMatchObject({ width: 0, height: 0 })
	})
})

describe('serializeTokensJson', () => {
	const tokens: TokensJson = {
		variables: {
			zeta: { type: 'color', value: '#000000' },
			alpha: { type: 'number', value: 8 },
			mid: { type: 'string', value: '400' },
		},
	}

	it('ordena as chaves de variables', () => {
		const json = JSON.parse(serializeTokensJson(tokens)) as TokensJson
		expect(Object.keys(json.variables)).toEqual(['alpha', 'mid', 'zeta'])
	})

	it('é estável — mesma entrada produz os mesmos bytes', () => {
		expect(serializeTokensJson(tokens)).toBe(serializeTokensJson(tokens))
	})

	it('preserva o shape TokensJson (type/value) por variável', () => {
		const json = JSON.parse(serializeTokensJson(tokens)) as TokensJson
		expect(json.variables.alpha).toEqual({ type: 'number', value: 8 })
	})
})
