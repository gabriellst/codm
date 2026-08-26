// packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { mountRouter, type MountedRouter } from '../../tests/support/mountRouter'
import { type Bindings, Container, ServicesProvider } from '@/services'
import type { SystemPreconditionStatus } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useSystemPreconditionProbe } from './useSystemPreconditionProbe'

/**
 * AC-18 — a sonda roda no mount e de novo no `focus`, e NÃO NAVEGA NUNCA (spec Decision 16). Esta
 * suíte substitui a antiga suíte do componente-guarda que sondava e navegava junto (o componente
 * morreu — o hook publica no store, quem navega agora é `OnboardingGate`) mas herda a cobertura de
 * Story 1 (a sonda reage ao foco) porque isso continua sendo comportamento DESTE hook.
 *
 * Cada caso monta um router de VERDADE (via o helper canônico `mountRouter`) e assevera que a
 * localização NUNCA muda — não basta provar que `statuses()` foi chamado; é preciso provar que
 * nada tentou navegar.
 */

function containerWith(statuses: SystemPreconditionStatus[]): { container: Container; fake: FakeSystemPreconditionsService } {
	class Seeded extends FakeSystemPreconditionsService {
		constructor() {
			super(statuses)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[SystemPreconditionsToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(SystemPreconditionsToken) as FakeSystemPreconditionsService }
}

function ProbeMount() {
	useSystemPreconditionProbe()
	return <div data-testid="console">console</div>
}

describe('useSystemPreconditionProbe', () => {
	let mounted: MountedRouter | null = null

	beforeEach(() => {
		useSystemPreconditionsStore.getState().reset()
	})

	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	async function mount(pathname: string, container: Container): Promise<MountedRouter> {
		mounted = await mountRouter(
			<ServicesProvider container={container}>
				<ProbeMount />
			</ServicesProvider>,
			{ path: pathname },
		)
		// Espera POR CONDIÇÃO — nunca sleep fixo: a sonda do mount publica no store assim que o
		// `statuses()` dublado (síncrono via Promise resolvida) volta. Como o valor final pode ser
		// legitimamente `[]` (nada pendente), a condição é "o console está montado" — que só acontece
		// depois do primeiro render, garantindo que pelo menos um ciclo de assentamento já rodou.
		await mounted.settled(() => mounted!.host.querySelector('[data-testid="console"]') !== null, 'ProbeMount renderizar')
		return mounted
	}

	it('AC-18: sonda no mount e publica as pendências no store', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		const { router, host } = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(useSystemPreconditionsStore.getState().pending).toEqual([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		// AC-18 — a navegação nunca é responsabilidade do hook: quem redireciona é a guarda de onboarding.
		expect(router.state.location.pathname).toBe('/dashboard')
	})

	it('AC-18: com tudo satisfeito, publica pendência vazia e continua sem navegar', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: true, repair: 'AVAILABLE' }])
		const { router } = await mount('/dashboard', container)

		expect(useSystemPreconditionsStore.getState().pending).toEqual([])
		expect(router.state.location.pathname).toBe('/dashboard')
	})

	it('Story 3: ao reganhar foco a sonda roda de novo e a pendência resolvida desaparece — sem navegar', async () => {
		const { container, fake } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		const { router } = await mount('/onboarding', container)
		expect(useSystemPreconditionsStore.getState().pending).toEqual([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])

		// O operador concedeu a permissão nos Ajustes e voltou para a janela.
		fake.set([{ id: 'FULL_DISK_ACCESS', satisfied: true, repair: 'AVAILABLE' }])
		await act(async () => {
			window.dispatchEvent(new Event('focus'))
			await Promise.resolve()
		})
		// `pending` é `SystemPreconditionStatus[] | null` e a distinção é load-bearing (ver o docblock do
		// store): `null` = AINDA NÃO SONDADO, `[]` = sondado e nada pendente. A espera é pelo segundo —
		// exigir a presença do array antes de olhar o tamanho é a própria condição, não uma formalidade
		// de tipo: enquanto for `null` a sonda do foco ainda não voltou e o teste tem de continuar esperando.
		await mounted!.settled(() => {
			const { pending } = useSystemPreconditionsStore.getState()
			return pending !== null && pending.length === 0
		}, 'a pendência resolvida desaparecer do store')

		expect(useSystemPreconditionsStore.getState().pending).toEqual([])
		expect(router.state.location.pathname).toBe('/onboarding')
	})
})
