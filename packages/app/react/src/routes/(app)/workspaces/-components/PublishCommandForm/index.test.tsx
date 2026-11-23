import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { addWorkspace, getWorkspacePublishCommand, setWorkspacePublishCommand } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
import { PublishCommandForm } from '.'

/**
 * O COMANDO DE PUBLICAÇÃO contra o backend REAL (`useIntegrationBackend()`): o round-trip
 * `PUT → GET /workspaces/:id/publish-command` É a asserção — o que o backend guardou é exatamente o
 * argv que o formulário montou, argumento por argumento.
 *
 *   1. um campo POR ARGUMENTO; adicionar/remover argumento muda a contagem de campos; o último
 *      argumento não se remove;
 *   2. salvar manda `{ command: { argv } }` LITERAL — um argumento com `;` e outro com `$(x)` chegam
 *      intactos (nada de shell, nada de split nem trim);
 *   3. reabrir (remontar com o MESMO QueryClient) depois de salvar preenche com o comando novo — a
 *      invalidação é aguardada antes do `onDone`;
 *   4. "Remover comando" manda `{ command: null }` e só aparece quando há comando.
 *
 * FALSEADOR: juntar os campos num `argv.join(' ')`/`split(' ')` derruba o caso 2; tirar a invalidação
 * de `getWorkspacePublishCommandQueryKey` derruba o 3; mandar `{ command: { argv: [] } }` no remover
 * derruba o 4 (o schema rejeita e o GET continua devolvendo o comando).
 */
describe('PublishCommandForm — contra o backend real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let queryClient: QueryClient | null = null
	let done = 0

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		done = 0
	})

	afterEach(async () => {
		// No refetch of THIS test may land after the next `backend.reset()` (it would 404 against a wiped owner).
		await settled(() => (queryClient?.isFetching() ?? 0) === 0 && (queryClient?.isMutating() ?? 0) === 0, 'o cache assentar')
		unmount()
		queryClient = null
	})

	function unmount(): void {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	}

	async function givenWorkspaceId(): Promise<string> {
		const { workspaceId } = await addWorkspace({ path: '/tmp/publish-command-fixture' })
		return workspaceId
	}

	async function mount(workspaceId: string): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		const client = queryClient!
		await act(async () => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={client}>
					<PublishCommandForm workspaceId={workspaceId} onDone={() => done++} />
				</QueryClientProvider>,
			)
		})
		await settled(() => host?.querySelector('form') !== null, 'o formulário montar')
	}

	/** Espera POR CONDIÇÃO, nunca sleep fixo. */
	async function settled(predicate: () => boolean, label = 'condição'): Promise<void> {
		for (let attempt = 0; attempt < 300; attempt++) {
			if (predicate()) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`PublishCommandForm: ${label} nunca aconteceu`)
	}

	function inputs(): HTMLInputElement[] {
		return [...(host?.querySelectorAll('input') ?? [])] as HTMLInputElement[]
	}

	function button(label: string): HTMLButtonElement | undefined {
		const buttons = [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
		return buttons.find(b => b.textContent?.includes(label) || b.getAttribute('aria-label') === label)
	}

	function mustButton(label: string): HTMLButtonElement {
		const found = button(label)
		if (!found) throw new Error(`botão "${label}" não renderizado`)
		return found
	}

	async function type(input: HTMLInputElement, value: string): Promise<void> {
		await act(async () => {
			// React tracks the value through the native setter — a plain `input.value = …` is swallowed.
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
			setter?.call(input, value)
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
	}

	async function click(target: HTMLButtonElement): Promise<void> {
		await act(async () => {
			target.click()
		})
	}

	it('um campo por argumento: adicionar/remover argumento, e salvar manda o argv literal (com ; e $(x))', async () => {
		const workspaceId = await givenWorkspaceId()
		await mount(workspaceId)

		// Sem comando: UM argumento vazio, que não se remove; e nada de "Remover comando".
		expect(inputs()).toHaveLength(1)
		expect(mustButton(i18n.t('workspaces.publishCommand.removeArgument', { n: 1 })).disabled).toBe(true)
		expect(button(i18n.t('workspaces.publishCommand.remove'))).toBeUndefined()

		const add = mustButton(i18n.t('workspaces.publishCommand.addArgument'))
		await click(add)
		await click(add)
		await click(add)
		expect(inputs()).toHaveLength(4)

		const ARGV = ['echo', 'a; b', '$(x)']
		await type(inputs()[0]!, ARGV[0]!)
		await type(inputs()[1]!, 'descartado')
		await type(inputs()[2]!, ARGV[1]!)
		await type(inputs()[3]!, ARGV[2]!)
		// Remover o 2º argumento tira exatamente aquele campo — os seguintes sobem uma posição.
		await click(mustButton(i18n.t('workspaces.publishCommand.removeArgument', { n: 2 })))
		expect(inputs().map(input => input.value)).toEqual(ARGV)

		await click(mustButton(i18n.t('workspaces.publishCommand.save')))
		await settled(() => done === 1, 'o onDone depois de salvar')

		expect(await getWorkspacePublishCommand(workspaceId)).toEqual({ command: { argv: ARGV } })

		// Reabrir com o MESMO cache preenche com o comando novo (a invalidação foi aguardada antes do onDone).
		unmount()
		await mount(workspaceId)
		expect(inputs().map(input => input.value)).toEqual(ARGV)
	})

	it('um argumento vazio não sai: o schema do SDK segura o envio', async () => {
		const workspaceId = await givenWorkspaceId()
		await mount(workspaceId)

		await type(inputs()[0]!, 'echo')
		await click(mustButton(i18n.t('workspaces.publishCommand.addArgument')))
		await type(inputs()[1]!, 'x')
		await type(inputs()[1]!, '')
		await settled(() => mustButton(i18n.t('workspaces.publishCommand.save')).disabled, 'o salvar desabilitar')

		expect(await getWorkspacePublishCommand(workspaceId)).toEqual({ command: null })
		expect(done).toBe(0)
	})

	it('pré-preenche o comando declarado e "Remover comando" manda { command: null }', async () => {
		const workspaceId = await givenWorkspaceId()
		const ARGV = ['bun', 'run', 'deploy']
		await setWorkspacePublishCommand(workspaceId, { command: { argv: ARGV } })
		await mount(workspaceId)

		expect(inputs().map(input => input.value)).toEqual(ARGV)

		await click(mustButton(i18n.t('workspaces.publishCommand.remove')))
		await settled(() => done === 1, 'o onDone depois de remover')

		expect(await getWorkspacePublishCommand(workspaceId)).toEqual({ command: null })
	})
})
