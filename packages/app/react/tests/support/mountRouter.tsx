import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	type AnyRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * O CANON DE MONTAGEM DE ROTA, EMPACOTADO (spec Decision 11) — quem monta rota em teste não
 * consegue esquecer o `router.load()`, porque não escreve essa parte.
 *
 * A armadilha que isto mata, medida em 10/08: sem `load()` o RouterProvider monta VAZIO e só
 * resolve num tick futuro. O build de produção do React descarrega o render sem honrar `act()` e
 * mascarava o buraco; o de desenvolvimento (que o nx ativa via NODE_ENV do .env) o expõe — 18
 * testes passavam por acidente. O rail irmão (`tests/architecture/router-load.test.ts`) pega quem
 * montar na mão.
 */
/**
 * GRAVADOR DE REDE — existe para que um estouro de espera diga POR QUE, não só QUE.
 *
 * Medido em 2026-08-27: um teste morreu com `a tile aparecer nunca aconteceu` depois de 30s, e essa
 * frase é IDÊNTICA nos dois casos que pedem correções OPOSTAS — "está lento" e "nunca vai
 * acontecer". Descobrir de qual se tratava custou uma investigação inteira, e o sinal que faltava
 * estava a um passo: o cliente da SDK é ky, cujo timeout PADRÃO é 30s — o MESMO número do deadline
 * daqui. Uma requisição pendurada e uma espera vazia terminam no mesmo instante e, sem este log,
 * com a mesma mensagem.
 *
 * Instrumenta `globalThis.fetch` UMA vez por processo e nunca desinstala: o wrapper é passthrough
 * puro (só anota), então deixá-lo instalado sai mais barato e menos frágil que contar montagens
 * para restaurar — um contador desbalanceado por um teste que estoura ANTES do `unmount` seria
 * exatamente o tipo de bug que este arquivo existe para não ter. O ky resolve `fetch` na hora da
 * chamada, então o wrapper o alcança sem o cliente precisar saber de nada.
 */
interface RequestRecord {
	method: string
	url: string
	startedAt: number
	endedAt?: number
	status?: number
	error?: string
}

let netLog: RequestRecord[] = []
let fetchInstrumented = false

function instrumentFetchOnce(): void {
	if (fetchInstrumented) return
	fetchInstrumented = true
	const base = globalThis.fetch.bind(globalThis)
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
		const method = (init?.method ?? (input as Request)?.method ?? 'GET').toUpperCase()
		const record: RequestRecord = { method, url, startedAt: Date.now() }
		netLog.push(record)
		if (netLog.length > 60) netLog.shift()
		try {
			const response = await base(input, init)
			record.endedAt = Date.now()
			record.status = response.status
			return response
		} catch (error) {
			record.endedAt = Date.now()
			record.error = error instanceof Error ? error.message : String(error)
			throw error
		}
	}) as typeof globalThis.fetch
}

/** O relatório que substitui "nunca aconteceu" por uma leitura. */
function diagnose(host: HTMLDivElement, label: string, elapsedMs: number): string {
	const now = Date.now()
	const inFlight = netLog.filter(r => r.endedAt === undefined)
	const failed = netLog.filter(r => r.endedAt !== undefined && (r.error !== undefined || (r.status ?? 0) >= 400))
	const completed = netLog.filter(r => r.endedAt !== undefined)
	const lines = [`mountRouter.settled: ${label} nunca aconteceu (${elapsedMs}ms)`]

	// A PRIMEIRA pergunta: alguém ainda espera a rede? Se sim, o problema não é a asserção.
	lines.push(
		inFlight.length === 0
			? 'rede: nada em voo — a espera estava VAZIA, então a condição depende de algo que já deveria ter chegado'
			: `rede: ${inFlight.length} requisição(ões) EM VOO — pendura, não lentidão:`,
	)
	for (const r of inFlight) lines.push(`  [em voo] ${r.method} ${r.url} — ${now - r.startedAt}ms sem resposta`)

	// Falhas que a sondagem do DOM engole: ninguém aguarda essas promessas, então elas somem.
	if (failed.length > 0) {
		lines.push(`falhas: ${failed.length} requisição(ões) terminaram mal e ninguém as observou:`)
		for (const r of failed.slice(-8)) lines.push(`  [falhou] ${r.method} ${r.url} -> ${r.error ?? `HTTP ${r.status}`}`)
	}

	lines.push(`total: ${netLog.length} requisição(ões) observadas, ${completed.length} concluida(s)`)
	const text = (host.textContent ?? '').replace(/\s+/g, ' ').trim()
	lines.push(`DOM (${text.length} chars): ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`)
	return lines.join('\n')
}

export interface MountedRouter {
	router: AnyRouter
	host: HTMLDivElement
	/** Espera POR CONDIÇÃO — nunca sleep fixo. Falha nomeando o que ficou pendurado. */
	settled(predicate: () => boolean, label?: string): Promise<void>
	unmount(): void
}

export async function mountRouter(
	ui: ReactNode,
	options?: { path?: string; extraPaths?: string[] },
): Promise<MountedRouter> {
	instrumentFetchOnce()
	netLog = []

	const host = document.createElement('div')
	document.body.appendChild(host)

	const rootRoute = createRootRoute({ component: () => <>{ui}</> })
	const children = (options?.extraPaths ?? ['/dashboard', '/onboarding']).map(path =>
		createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
	)
	const router = createRouter({
		routeTree: rootRoute.addChildren(children),
		history: createMemoryHistory({ initialEntries: [options?.path ?? '/'] }),
	})

	// A LINHA que este helper existe para ninguém esquecer:
	await router.load()

	let root: Root | null = null
	await act(async () => {
		root = createRoot(host)
		root.render(<RouterProvider router={router} />)
	})
	await act(async () => {
		await Promise.resolve()
	})

	return {
		router,
		host,
		async settled(predicate, label = 'condição') {
			// O LIMITE É TEMPO REAL, NÃO CONTAGEM DE TENTATIVAS — e a distinção é o que faz este
			// número parar de precisar de recalibração.
			//
			// Era `500 tentativas × sleep(10ms)`, descrito como "5s de margem". Isso só é verdade
			// quando cada iteração custa os 10ms do sleep e mais nada: o `act()` e o render do React
			// entram na conta, então o orçamento REAL variava com a máquina — exatamente a grandeza
			// que o limite deveria ser imune. Foi recalibrado de 1s para 5s quando o PTY do Nx tornou
			// o flush mais lento (medido: StepWalking a 1005ms, REGRESSÃO a 1155ms), e estourou de
			// novo em 2026-08-27 num runner hospedado de 2 vCPU, onde uma tile que depende de um PATCH
			// ao backend real não apareceu dentro da janela.
			//
			// Com deadline de relógio, "30s" quer dizer 30s em qualquer máquina. A folga é generosa de
			// propósito: um teste que trava de verdade continua falhando com a MESMA mensagem nomeando
			// o que ficou pendurado — só demora mais para desistir, e vermelho falso custa mais caro
			// que essa espera.
			const startedAt = Date.now()
			const deadline = startedAt + 30_000
			while (Date.now() < deadline) {
				if (predicate()) return
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
				})
			}
			throw new Error(diagnose(host, label, Date.now() - startedAt))
		},
		unmount() {
			act(() => root?.unmount())
			host.remove()
		},
	}
}
