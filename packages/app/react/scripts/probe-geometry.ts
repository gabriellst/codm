// packages/app/react/scripts/probe-geometry.ts — MEDIR o DOM renderizado, em vez de deduzir do CSS.
//
// A técnica que mais rendeu na fase de fidelidade, e que nasceu improvisada num /tmp tarde demais.
// A regra que ela encapsula: **quando o delta é OFFSET (mesmo conteúdo, deslocado), a resposta está
// na ALTURA de um ancestral** — o crop diz que existe, a sonda diz qual. Casos reais resolvidos em
// uma execução cada, depois de vários turnos de dedução errada:
//
//   · a linha do painel media 48px porque o bloco de textos media 34 (line-height default) e VENCIA
//     o thumb de 30 — nenhuma leitura do CSS mostrava isso;
//   · o rodapé do ext-08 tinha 103px de altura (o `mt-auto` estava correto o tempo todo; era a
//     altura que subia a divisória);
//   · o header de "Publicados" media 34 onde os irmãos medem 25, por causa de um link de 12px.
//
// É PARALELIZÁVEL: sobe um servidor efêmero na porta 0 e lê uma story só, sem tocar o scoreboard
// nem a pasta `current/` — ao contrário de `bun fidelity`, que é serial e do orquestrador. Por isso
// um worker PODE (e deve) usá-la para falsear a própria hipótese antes de reportar: os dois piores
// erros da wave 14 vieram de workers que leram o spec certo e não mediram o resultado composto.
//
// uso:
//   bun probe <storyId>                          → filhos do <body> com altura/topo
//   bun probe <storyId> --select '[data-slot="card"]'   → todo nó que casa, e seus filhos diretos
//   bun probe <storyId> --contains "A revisar"   → o primeiro nó cujo texto contém a frase
//   bun probe <storyId> --viewport 400x600       → viewport da tela (default 1440x1040)
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { chromium } from 'playwright'

const STORYBOOK_STATIC = join(import.meta.dir, '..', 'storybook-static')

const MIME: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
}

export interface ProbedNode {
	tag: string
	slot: string | null
	top: number
	left: number
	width: number
	height: number
	text: string
	classes: string
	children: { height: number; width: number; classes: string }[]
}

export interface ProbeOptions {
	storyId: string
	select?: string
	contains?: string
	viewport?: { width: number; height: number }
	storybookStatic?: string
}

export async function probeGeometry(options: ProbeOptions): Promise<ProbedNode[]> {
	const root = options.storybookStatic ?? STORYBOOK_STATIC
	if (!existsSync(join(root, 'iframe.html'))) {
		throw new Error(`storybook-static não encontrado em ${root} — rode o build do storybook antes da sonda`)
	}
	const server = createServer((req, res) => {
		const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://probe').pathname).replace(/^\//, '')
		const file = join(root, rel || 'index.html')
		if (!existsSync(file)) {
			res.writeHead(404)
			res.end()
			return
		}
		res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
		res.end(readFileSync(file))
	})
	await new Promise<void>(resolve => server.listen(0, resolve))
	const address = server.address()
	const port = typeof address === 'object' && address !== null ? address.port : 0
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage({ viewport: options.viewport ?? { width: 1440, height: 1040 } })
		await page.goto(`http://localhost:${port}/iframe.html?id=${options.storyId}&viewMode=story`, { waitUntil: 'networkidle' })
		// As stories conectadas resolvem query + imagem depois do networkidle; sem esta folga a sonda
		// mede o esqueleto em vez do conteúdo (erro que já custou uma leitura errada).
		await page.waitForTimeout(1200)
		return await page.evaluate(
			({ select, contains }) => {
				const describe = (el: Element) => {
					const box = el.getBoundingClientRect()
					return {
						tag: el.tagName.toLowerCase(),
						slot: el.getAttribute('data-slot'),
						top: Math.round(box.top),
						left: Math.round(box.left),
						width: Math.round(box.width),
						height: Math.round(box.height),
						text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
						classes: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
						children: [...el.children].map(c => ({
							height: Math.round(c.getBoundingClientRect().height),
							width: Math.round(c.getBoundingClientRect().width),
							classes: (typeof c.className === 'string' ? c.className : '').slice(0, 46),
						})),
					}
				}
				if (contains) {
					const all = [...document.querySelectorAll<HTMLElement>(select ?? '*')]
					const hit = all.find(el => (el.textContent ?? '').includes(contains))
					return hit ? [describe(hit)] : []
				}
				if (select) return [...document.querySelectorAll(select)].map(describe)
				// Nesta versão do Storybook o <body> tem 8 filhos estáticos de template
				// (.sb-preparing-story, .sb-preparing-docs, ...) — firstElementChild é um wrapper
				// vazio (0×0). O root real da story renderizada é #storybook-root.
				return [...(document.querySelector('#storybook-root')?.children ?? [])].map(describe)
			},
			{ select: options.select ?? null, contains: options.contains ?? null },
		)
	} finally {
		await browser.close()
		server.close()
	}
}

if (import.meta.main) {
	const [storyId, ...rest] = process.argv.slice(2)
	if (!storyId) {
		console.error('uso: bun probe <storyId> [--select <css>] [--contains <texto>] [--viewport 400x600]')
		process.exit(2)
	}
	const flag = (name: string): string | undefined => {
		const at = rest.indexOf(`--${name}`)
		return at >= 0 ? rest[at + 1] : undefined
	}
	const viewportRaw = flag('viewport')
	const [w, h] = viewportRaw?.split('x').map(Number) ?? []
	const nodes = await probeGeometry({
		storyId,
		select: flag('select'),
		contains: flag('contains'),
		viewport: w && h ? { width: w, height: h } : undefined,
	})
	if (nodes.length === 0) {
		console.log('nenhum nó casou — confira o seletor/texto')
		process.exit(1)
	}
	for (const node of nodes) {
		console.log(`\n${node.tag}${node.slot ? `[${node.slot}]` : ''}  ${node.width}×${node.height} @ (${node.left},${node.top})`)
		if (node.text) console.log(`  "${node.text}"`)
		for (const child of node.children) console.log(`    ${String(child.height).padStart(4)}px  ${child.classes}`)
	}
}
