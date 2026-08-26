import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getAttachThreadWizardQueryKey, getAttachThreadWizardQueryOptions, listWorkspaces } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeFilePickerService } from '@/services/registry/test'
import { FilePickerToken } from '@/services/tokens'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
import { WorkspaceStep, type WorkspaceStepData } from '.'

/**
 * "+ Adicionar uma pasta" NO ATTACH — contra o backend REAL (`useIntegrationBackend()`, sem gateway:
 * `AddWorkspace` mora no TS e o `MockWorkspaceDetector` do env `integration` aceita qualquer path
 * como diretório). As stories provam o que é puro (a linha existe, cancelar o picker não grava
 * nada); este arquivo prova o EFEITO da adição, que só existe com rede:
 *
 *   1. picker nativo capaz (fake SEMEADO, `SeededPicker`) → clique na linha → `POST /workspaces`
 *      de verdade → o workspace novo existe em `listWorkspaces`;
 *   2. o `workspaceId` criado é ENTREGUE por `onSubmit` — o mesmo caminho do clique numa linha —
 *      então o footer do wizard habilita Continuar sem um segundo clique;
 *   3. o catálogo do wizard (`getAttachThreadWizard`) é INVALIDADO — é ele, não `listWorkspaces`,
 *      que alimenta esta lista; sem a invalidação a pasta nova não apareceria.
 *   4. host SEM picker capaz (`supported=false`) → a linha revela o input manual; Enter registra
 *      pelo MESMO caminho (schema + mutation), com o mesmo efeito.
 *
 * FALSEADOR: remover a invalidação de `getAttachThreadWizardQueryKey()` no componente derruba o
 * caso 3 (isInvalidated fica false); remover o `selectWorkspace(res.workspaceId)` derruba o caso 2.
 */
describe('WorkspaceStep — "Adicionar uma pasta" contra o backend real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let queryClient: QueryClient | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
		queryClient = null
	})

	async function mount(bindings: Bindings, onSubmit: (data: WorkspaceStepData) => void): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const container = new Container()
		container.load(testBindings as unknown as Bindings)
		container.load(bindings)
		const element = host
		const client = queryClient
		await act(async () => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={client}>
					<ServicesProvider container={container}>
						<WorkspaceStep workspaces={[]} onSubmit={onSubmit} />
					</ServicesProvider>
				</QueryClientProvider>,
			)
		})
		// The capability probe (`supportsFolderPicker`) resolves async — wait for it before clicking.
		await act(async () => {
			await Promise.resolve()
		})
	}

	/** Espera POR CONDIÇÃO, nunca sleep fixo. */
	async function settled(predicate: () => boolean, label = 'condição'): Promise<void> {
		for (let attempt = 0; attempt < 300; attempt++) {
			if (predicate()) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`WorkspaceStep: ${label} nunca aconteceu`)
	}

	function addRow(): HTMLButtonElement {
		const buttons = [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
		const button = buttons.find(b => b.textContent?.includes(i18n.t('workspaces.addFolderRow')))
		if (!button) throw new Error('linha "Adicionar uma pasta" não renderizada')
		return button
	}

	it('picker nativo: clicar na linha registra a pasta de verdade, entrega o id novo e invalida o catálogo do wizard', async () => {
		const PICKED = '/Users/ada/attach-picked-folder'
		class SeededPicker extends FakeFilePickerService {
			constructor() {
				super(PICKED)
			}
		}
		const delivered: WorkspaceStepData[] = []
		await mount([[FilePickerToken, SeededPicker]], data => delivered.push(data))
		const client = queryClient!
		// Semeia o cache do wizard ANTES, como se o operador já estivesse no passo (o pai lê essa query).
		await client.fetchQuery(getAttachThreadWizardQueryOptions())
		const key = getAttachThreadWizardQueryKey()
		expect(client.getQueryState(key)?.isInvalidated).not.toBe(true)

		await act(async () => {
			addRow().click()
		})
		await settled(() => delivered.length === 1, 'o onSubmit entregar o workspace novo')

		// (1) O POST foi real: o workspace existe no backend com o path escolhido.
		const { workspaces } = await listWorkspaces()
		const created = workspaces.find(w => w.path === PICKED)
		expect(created).toBeDefined()
		// (2) O id ENTREGUE é o criado — o mesmo caminho de "clicar numa linha".
		expect(delivered[0]).toEqual({ workspaceId: created!.workspaceId })
		// (3) O catálogo do wizard foi invalidado — é ele que alimenta a lista deste passo.
		expect(client.getQueryState(key)?.isInvalidated).toBe(true)
		// Nenhum input manual apareceu: o picker era capaz.
		expect(host?.querySelector('input')).toBeNull()
	})

	it('sem picker capaz: a linha revela o input manual e Enter registra pelo mesmo caminho', async () => {
		class IncapablePicker extends FakeFilePickerService {
			constructor() {
				super(null, false)
			}
		}
		const delivered: WorkspaceStepData[] = []
		await mount([[FilePickerToken, IncapablePicker]], data => delivered.push(data))

		await act(async () => {
			addRow().click()
		})
		const input = host?.querySelector('input') as HTMLInputElement | null
		expect(input).not.toBeNull()

		const TYPED = '/Users/ada/attach-typed-folder'
		await act(async () => {
			// React tracks the value through the native setter — a plain `input.value = …` is swallowed.
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
			setter?.call(input, TYPED)
			input!.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await act(async () => {
			input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		})
		await settled(() => delivered.length === 1, 'o onSubmit entregar o workspace digitado')

		const { workspaces } = await listWorkspaces()
		const created = workspaces.find(w => w.path === TYPED)
		expect(created).toBeDefined()
		expect(delivered[0]).toEqual({ workspaceId: created!.workspaceId })
		// O input colapsa depois de registrar — o fluxo volta ao estado "lista + linha de adicionar".
		expect(host?.querySelector('input')).toBeNull()
	})
})
