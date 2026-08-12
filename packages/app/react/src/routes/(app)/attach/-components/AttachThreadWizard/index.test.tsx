import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { givenChannel, givenRemote } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
import { mountRouter, type MountedRouter } from '../../../../../../tests/support/mountRouter'
import { useAttachWizardStore } from '../../-stores/useAttachWizardStore'
import { AttachThreadWizard } from '.'

/**
 * D3 (founder review 12/08) REVOKED "escolher é responder": `AttachThreadWizard` is now the SOLE
 * owner of a persistent footer (Voltar/Continuar), and a step's row click only RECORDS the selection
 * into `useAttachWizardStore` — nothing advances on its own anymore. This suite proves that footer
 * MECHANISM against the real backend (`useIntegrationBackend()`, no `services: ['apiGo']` — a
 * `givenChannel` + `givenRemote` seed straight through Drizzle is enough to populate CONTACT without
 * the heavier gateway subprocess, same tradeoff `ContactStep`'s own suite documents):
 *
 *   - Voltar starts DISABLED (first step, nothing to go back to).
 *   - Continuar starts DISABLED (no selection yet) and becomes enabled once a row is clicked.
 *   - Clicking a contact row no longer advances the step BY ITSELF — only the footer's Continuar does.
 *   - Continuar advances to WORKSPACE, where Voltar is enabled again.
 *   - Voltar returns to CONTACT with the selection preserved (the row still reads pre-selected).
 *
 * The commit path (AGENTS → REVIEW → "Vincular conversa" → real `AttachThread` mutation → navigate to
 * `/threads/$threadId`) is NOT covered here — `providers` availability depends on the provider
 * detection Service probe, not a DB seed, and reaching it would pull in infrastructure this suite
 * doesn't otherwise need. `ReviewStep`'s own stories already prove the commit gate
 * (`IncompleteSelectionCannotFinish`) and `AgentsStep`/`WorkspaceStep`'s stories prove each step's own
 * click-records-selection contract in isolation.
 */
describe('AttachThreadWizard — o rodapé contra o backend real', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
		useAttachWizardStore.getState().reset()
	})

	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	async function mount(): Promise<MountedRouter> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<AttachThreadWizard />
			</QueryClientProvider>,
			{ path: '/attach' },
		)
		await mounted.settled(() => (mounted!.host.textContent ?? '').includes(i18n.t('attach.stepThreadTitle')), 'o passo de contato aparecer')
		return mounted
	}

	function findButton(text: string): HTMLButtonElement {
		const button = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes(text))
		if (!button) throw new Error(`botão "${text}" não renderizado`)
		return button as HTMLButtonElement
	}

	it('Voltar e Continuar começam desabilitados no primeiro passo — nada selecionado ainda', async () => {
		const { channelId } = await givenChannel(backend.asTestBed())
		await givenRemote(backend.asTestBed(), { channelId, remoteId: '5511999990001@s.whatsapp.net', name: 'Ada Lovelace' })

		await mount()
		await mounted!.settled(() => (mounted!.host.textContent ?? '').includes('Ada Lovelace'), 'o contato semeado aparecer')

		expect(findButton(i18n.t('attach.back')).disabled).toBe(true)
		expect(findButton(i18n.t('attach.continue')).disabled).toBe(true)
	})

	it('FALSEADOR — clicar na linha GRAVA a escolha mas não avança sozinho; só o Continuar do footer move o passo', async () => {
		const { channelId } = await givenChannel(backend.asTestBed())
		await givenRemote(backend.asTestBed(), { channelId, remoteId: '5511999990001@s.whatsapp.net', name: 'Ada Lovelace' })

		await mount()
		await mounted!.settled(() => (mounted!.host.textContent ?? '').includes('Ada Lovelace'), 'o contato semeado aparecer')

		const contactRow = [...mounted!.host.querySelectorAll('button')].find(b => b.textContent?.includes('Ada Lovelace'))
		if (!contactRow) throw new Error('linha do contato não renderizada')
		act(() => contactRow.click())

		// O clique gravou — o passo continua em CONTATO, e o Continuar acabou de habilitar.
		expect(mounted!.host.textContent).toContain(i18n.t('attach.stepThreadTitle'))
		await mounted!.settled(() => !findButton(i18n.t('attach.continue')).disabled, 'o Continuar habilitar após a escolha')

		act(() => findButton(i18n.t('attach.continue')).click())
		await mounted!.settled(
			() => (mounted!.host.textContent ?? '').includes(i18n.t('attach.stepWorkspaceTitle')),
			'avançar para o passo de projeto',
		)

		// No segundo passo, Voltar já não está mais desabilitado.
		expect(findButton(i18n.t('attach.back')).disabled).toBe(false)

		act(() => findButton(i18n.t('attach.back')).click())
		await mounted!.settled(
			() => (mounted!.host.textContent ?? '').includes(i18n.t('attach.stepThreadTitle')),
			'voltar para o passo de contato',
		)

		// A seleção sobreviveu à ida e volta — Continuar chega já habilitado de novo.
		expect(findButton(i18n.t('attach.continue')).disabled).toBe(false)
	})
})
