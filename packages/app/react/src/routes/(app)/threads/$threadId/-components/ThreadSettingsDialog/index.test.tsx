import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
	getHomeDashboardQueryKey,
	getSessionChatQueryKey,
	getThreadSettings,
	type AgentModelIdEnumKey,
} from '@codm/client-typescript/typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import i18n from '@/lib/i18n'
import { Dialog } from '@codm/app-ui/dialog'
import { useDialogStore } from '@/stores/useDialogStore'
import { mountRouter, type MountedRouter } from '../../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../../tests/support/integration-harness'
import { ThreadSettingsDialog } from '.'

/**
 * REESCRITO CONTRA O BACKEND REAL (T10, onda B) — `ThreadSettingsDialog` era o exemplar do canon
 * ANTIGO (stub manual de `globalThis.fetch`, ver a versão anterior no git). Diferente de
 * `ContactStep`/`ProvidersSection` (T9), NENHUMA das asserções deste componente esbarra no gap de
 * tooling: `givenThread(bed, { providers })` semeia exatamente o eixo que este dialog lê
 * (`GetThreadSettings` deriva `comingSoon`/`models` de `AgentRunnerFactory.supported` — o
 * `StubAgentRunnerFactory` sob `integration`, `supported = [CLAUDE_CODE]`, o MESMO catálogo que
 * `ProvidersSection` já prova determinístico), então TODO comportamento migrou para o harness — o
 * INVENTORY do rail (`fetch-stub.test.ts`) perde esta entrada.
 *
 * A ausência da conversa apagada (a linha que a Task aponta nominalmente) assevera-se contra o
 * BACKEND REAL: uma thread genuinamente apagada responde erro à releitura — mais forte que a
 * contagem de requisições que o canon antigo fazia contra um dublê, e o que o founder pede
 * ("a thread apagada de verdade responde 404/não responde").
 */

/**
 * O catálogo que `GetThreadSettings` devolve para um agente dirigível — tipado pelo enum do wire
 * (`models: AgentModelId[]`), não por `string[]`: é o mesmo enum que a resposta carrega, e alargar
 * para string aqui só serviria para a asserção deixar de casar com o que o contrato promete.
 *
 * A LISTA CONTINUA LITERAL DE PROPÓSITO — a ORDEM é parte da asserção (o backend devolve
 * DEFAULT/OPUS/SONNET/HAIKU, que NÃO é a ordem de declaração de `AgentModelIdEnum`), então derivar
 * de `Object.values(AgentModelIdEnum)` trocaria a prova por uma tautologia e ainda mudaria o valor
 * esperado.
 */
const DEFAULT_MODELS: AgentModelIdEnumKey[] = ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU']

// UM backend para o arquivo inteiro (os dois `describe` abaixo) — boot é caro (~1s) e
// `useIntegrationBackend()` já cacheia por processo; parar e resubir entre describes só pagaria o
// custo duas vezes de graça.
let backend: IntegrationBackend

beforeAll(async () => {
	backend = await useIntegrationBackend()
})
afterAll(async () => {
	await backend.stop()
})

describe('ThreadSettingsDialog — contra o backend real', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	/**
	 * O eixo semeado é o ENUM do contrato, não uma string solta: `givenThread` declara
	 * `providers: ProviderKind[]` (a superfície de teste do backend tipa os givens pelos mesmos enums do
	 * wire), então é o enum que atravessa daqui até a linha semeada — um `string[]` aqui só teria
	 * sobrevivido alargando o que o given promete.
	 */
	async function seedThread(providers?: ProviderKind[]): Promise<string> {
		const { givenThread } = await loadBackendGivens()
		const thread = (await givenThread(backend.asTestBed(), providers ? { providers } : {})) as { id: { value: string } }
		return thread.id.value
	}

	/** O corpo sai do skeleton assim que as duas queries (settings + o cabeçalho do chat) resolvem. */
	async function mount(threadId: string): Promise<MountedRouter> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<Dialog open>
					<ThreadSettingsDialog threadId={threadId} />
				</Dialog>
			</QueryClientProvider>,
		)
		await mounted.settled(
			() => document.body.textContent?.includes(i18n.t('session.boundAgents')) ?? false,
			'o corpo do dialog sair do skeleton',
		)
		return mounted
	}

	it('lista os agentes anexados e marca o que não é dirigível', async () => {
		const threadId = await seedThread([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX])
		await mount(threadId)

		const text = document.body.textContent ?? ''
		expect(text).toContain('Claude Code')
		expect(text).toContain('Codex')
		expect(text).toContain(i18n.t('common.comingSoon'))
		expect(text).toContain(i18n.t('session.boundAgentsComingSoonHint'))
	})

	/** Sem binding morto NÃO há aviso — uma tarja permanente vira decoração e ninguém a lê. */
	it('não avisa nada quando todos os agentes são dirigíveis', async () => {
		const threadId = await seedThread([ProviderKind.CLAUDE_CODE])
		await mount(threadId)

		const text = document.body.textContent ?? ''
		expect(text).toContain('Claude Code')
		expect(text).not.toContain(i18n.t('session.boundAgentsComingSoonHint'))
	})

	/**
	 * O SELETOR DE MODELO — presente onde há o que escolher, ausente onde não há. As duas metades
	 * importam: um seletor numa linha sem catálogo ofereceria uma escolha que o backend recusa.
	 *
	 * O agente SEM catálogo é o OPENCODE, e não mais o CODEX: catálogo e `comingSoon` são dois eixos
	 * (`PROVIDER_MODELS` declara o primeiro, `AgentRunnerFactory.supported` o segundo), e desde que o
	 * CODEX ganhou os codinomes TERRA/LUNA ele é justamente o caso em que os dois discordam — ver o
	 * teste seguinte.
	 */
	it('renderiza um seletor de modelo por agente com catálogo, e nenhum para o agente sem catálogo', async () => {
		const threadId = await seedThread([ProviderKind.CLAUDE_CODE, ProviderKind.OPENCODE])
		await mount(threadId)

		const selectors = document.querySelectorAll(`[aria-label="${i18n.t('session.agentModel')}"]`)
		expect(selectors).toHaveLength(1)
		expect(selectors[0]?.textContent).toContain(i18n.t('enums.AgentModelId.DEFAULT'))
		expect(document.body.textContent ?? '').toContain(i18n.t('session.agentModelRestartHint'))
	})

	/**
	 * O CASO EM QUE OS DOIS EIXOS DISCORDAM, que é o único que prova que são dois: o CODEX chega
	 * `comingSoon` (o `StubAgentRunnerFactory` de `integration` só declara CLAUDE_CODE) E com catálogo.
	 * A linha mostra o selo E o seletor — se um eixo fosse derivado do outro, um dos dois sumiria.
	 *
	 * E o seletor do binding morto vem DESABILITADO: existir prova que o catálogo é conhecido, estar
	 * desabilitado prova que ninguém dirige a CLI. Os dois estados na mesma linha são a razão de o
	 * componente não poder decidir isso com um booleano só.
	 */
	it('oferece o catálogo de um agente que esta versão ainda não dirige, mas com o seletor desabilitado', async () => {
		const threadId = await seedThread([ProviderKind.CLAUDE_CODE, ProviderKind.CODEX])
		await mount(threadId)

		const selectors = [...document.querySelectorAll(`[aria-label="${i18n.t('session.agentModel')}"]`)]
		expect(selectors).toHaveLength(2)
		// A linha é o ancestral imediato do gatilho, e é o texto dela que diz de quem é o seletor —
		// a ordem do array vem da ordem dos providers na thread, que não é o que este teste afirma.
		// De quem é cada gatilho sai SUBINDO até o primeiro ancestral que nomeia um agente — a linha.
		// A ordem do array vem da ordem dos providers na thread, que não é o que este teste afirma, e o
		// pai imediato do gatilho é só o wrapper do próprio Select ("Automático▼").
		const providerOf = (el: Element): string => {
			for (let node = el.parentElement; node; node = node.parentElement) {
				const text = node.textContent ?? ''
				if (text.includes('Codex')) return 'Codex'
				if (text.includes('Claude Code')) return 'Claude Code'
			}
			return ''
		}
		const triggerOf = (label: string) => selectors.find(el => providerOf(el) === label)
		expect(triggerOf('Codex')?.hasAttribute('disabled')).toBe(true)
		expect(triggerOf('Claude Code')?.hasAttribute('disabled')).toBe(false)
		expect(document.body.textContent ?? '').toContain(i18n.t('common.comingSoon'))
	})

	/** Um seletor que ninguém pode mexer não ganha aviso sobre a consequência de mexer nele. */
	it('não avisa sobre reinício quando o único agente com catálogo não é dirigível', async () => {
		const threadId = await seedThread([ProviderKind.CODEX])
		await mount(threadId)

		expect(document.querySelectorAll(`[aria-label="${i18n.t('session.agentModel')}"]`)).toHaveLength(1)
		expect(document.body.textContent ?? '').not.toContain(i18n.t('session.agentModelRestartHint'))
	})

	it('não avisa nada sobre modelo quando nenhum agente tem o que escolher', async () => {
		const threadId = await seedThread([ProviderKind.OPENCODE])
		await mount(threadId)

		expect(document.body.textContent ?? '').not.toContain(i18n.t('session.agentModelRestartHint'))
		expect(document.querySelectorAll(`[aria-label="${i18n.t('session.agentModel')}"]`)).toHaveLength(0)
	})

	/**
	 * INDICADOR DE PENSANDO — nasce LIGADO (`Thread.thinkingIndicatorEnabled = true` no `create`,
	 * `Thread.ts:326`), o switch reflete isso, e desligar persiste `{ enabled: false }` no backend
	 * real — a mesma prova computada (releitura pós-mutação) que o prompt usa acima, em vez de
	 * inspecionar o corpo do PUT contra um dublê.
	 */
	it('o indicador de pensando nasce ligado e desligar persiste no backend real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const toggle = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.thinkingIndicator')}"]`)
		expect(toggle?.getAttribute('aria-checked')).toBe('true')

		await act(async () => {
			toggle?.click()
		})

		await mounted!.settled(() => {
			const el = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.thinkingIndicator')}"]`)
			return el?.getAttribute('aria-checked') === 'false'
		}, 'o switch refletir desligado')

		const persisted = await getThreadSettings(threadId)
		expect(persisted.thinkingIndicator.enabled).toBe(false)
	})

	/**
	 * REAÇÕES — mesmo molde do indicador de pensando: nasce ligado, desligar persiste
	 * `{ enabled: false }` no backend real, provado pela releitura.
	 */
	it('as reações nascem ligadas e desligar persiste no backend real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const toggle = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.reactions')}"]`)
		expect(toggle?.getAttribute('aria-checked')).toBe('true')

		await act(async () => {
			toggle?.click()
		})

		await mounted!.settled(() => {
			const el = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.reactions')}"]`)
			return el?.getAttribute('aria-checked') === 'false'
		}, 'o switch refletir desligado')

		const persisted = await getThreadSettings(threadId)
		expect(persisted.reactions.enabled).toBe(false)
	})

	/**
	 * RESPOSTA EM TEMPO REAL — mesmo molde do indicador de pensando: nasce ligada, desligar persiste
	 * `{ enabled: false }` no backend real, provado pela releitura.
	 */
	it('a resposta em tempo real nasce ligada e desligar persiste no backend real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const toggle = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.streaming')}"]`)
		expect(toggle?.getAttribute('aria-checked')).toBe('true')

		await act(async () => {
			toggle?.click()
		})

		await mounted!.settled(() => {
			const el = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.streaming')}"]`)
			return el?.getAttribute('aria-checked') === 'false'
		}, 'o switch refletir desligado')

		const persisted = await getThreadSettings(threadId)
		expect(persisted.streaming.enabled).toBe(false)
	})

	/**
	 * O PROMPT PERSONALIZADO chega na tela e volta pelo fio — e desta vez a prova é o COMPUTADO: em vez
	 * de inspecionar o corpo do PUT contra um dublê, relê `GetThreadSettings` no backend real depois de
	 * salvar. Prova a corrente inteira (textarea → mutation → PUT → linha → releitura) num só passo.
	 */
	it('escreve o prompt editado e ele PERSISTE — verificado pela releitura real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
		expect(textarea?.value).toBe('')

		const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		act(() => {
			nativeValue?.call(textarea, 'Nunca prometa prazo.')
			textarea?.dispatchEvent(new Event('input', { bubbles: true }))
		})

		const save = [...document.body.querySelectorAll('button')].find(b => b.textContent === i18n.t('session.customPromptSave'))
		expect(save?.disabled).toBe(false)
		await act(async () => {
			save?.click()
		})

		await mounted!.settled(
			() => document.body.textContent?.includes(i18n.t('session.customPromptSaved')) ?? false,
			'o prompt confirmar salvo',
		)

		const persisted = await getThreadSettings(threadId)
		expect(persisted.customPrompt).toBe('Nunca prometa prazo.')
	})

	/**
	 * A ESCRITA do modelo — escolher salva sozinho, e o efeito é o modelo EFETIVO mudando no backend
	 * real (o mesmo `effectiveModel` que a entidade usa para retomar a sessão do CLI).
	 */
	it('escolher um modelo dispara a mutação — o modelo efetivo muda no backend real', async () => {
		const threadId = await seedThread([ProviderKind.CLAUDE_CODE])
		await mount(threadId)

		const trigger = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.agentModel')}"]`)
		expect(trigger?.textContent).toContain(i18n.t('enums.AgentModelId.DEFAULT'))
		await act(async () => {
			trigger?.click()
		})
		const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
			el => el.textContent === i18n.t('enums.AgentModelId.OPUS'),
		)
		await act(async () => {
			option?.click()
		})

		await mounted!.settled(() => {
			const t = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.agentModel')}"]`)
			return (t?.textContent ?? '').includes(i18n.t('enums.AgentModelId.OPUS'))
		}, 'o seletor refletir OPUS')

		const persisted = await getThreadSettings(threadId)
		expect(persisted.providers.find(p => p.provider === 'CLAUDE_CODE')?.model).toBe('OPUS')
		expect(persisted.providers.find(p => p.provider === 'CLAUDE_CODE')?.models).toEqual(DEFAULT_MODELS)
	})

	/**
	 * O IDIOMA DA CONVERSA — as pistas de "pensando" que a sala vê e o idioma em que o agente responde,
	 * um campo só. Mesmo molde do modelo acima (escolher salva sozinho, a prova é a releitura real), com
	 * o eixo extra que só este campo tem: a AUSÊNCIA é um estado, e voltar a ela é uma ação própria.
	 */
	it('a conversa nasce SEM idioma declarado — nada a desfazer, então o botão de voltar não existe', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const trigger = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.language')}"]`)
		expect(trigger?.textContent).toContain(i18n.t('session.languageAccountDefault'))
		expect(document.body.textContent).not.toContain(i18n.t('session.languageUseAccountDefault'))

		const persisted = await getThreadSettings(threadId)
		expect(persisted.language.declared).toBeUndefined()
		// Sem escolha na conversa E sem escolha na conta: o padrão do produto é o que está em vigor.
		expect(persisted.language.effective).toBe('pt-BR')
	})

	it('escolher um idioma dispara a mutação, e voltar ao padrão da conta APAGA a escolha no backend real', async () => {
		const threadId = await seedThread()
		await mount(threadId)

		const trigger = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.language')}"]`)
		await act(async () => {
			trigger?.click()
		})
		const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
			el => el.textContent === i18n.t('enums.Language.en-US'),
		)
		await act(async () => {
			option?.click()
		})

		await mounted!.settled(() => {
			const el = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.language')}"]`)
			return (el?.textContent ?? '').includes(i18n.t('enums.Language.en-US'))
		}, 'o seletor refletir en-US')

		expect(await getThreadSettings(threadId)).toMatchObject({ language: { declared: 'en-US', effective: 'en-US' } })

		// A VOLTA. O botão só existe agora — porque agora há escolha a desfazer.
		const reset = [...document.querySelectorAll<HTMLElement>('button')].find(
			el => el.textContent === i18n.t('session.languageUseAccountDefault'),
		)
		expect(reset).toBeDefined()
		await act(async () => {
			reset?.click()
		})

		await mounted!.settled(() => {
			const el = document.querySelector<HTMLElement>(`[aria-label="${i18n.t('session.language')}"]`)
			return (el?.textContent ?? '').includes(i18n.t('session.languageAccountDefault'))
		}, 'o seletor voltar ao padrão da conta')

		// ABSENT, não 'pt-BR': o campo apagado é o que faz esta conversa voltar a seguir a conta.
		const cleared = await getThreadSettings(threadId)
		expect(cleared.language.declared).toBeUndefined()
		expect(cleared.language.effective).toBe('pt-BR')
	})
})

/**
 * APAGAR NÃO PODE BUSCAR O QUE ACABOU DE APAGAR.
 *
 * O `onSuccess` do deletar já limpava o cache, mas com `invalidateQueries` nas chaves DA THREAD
 * APAGADA — refetch que OBRIGATORIAMENTE falha (spec de deleção, AC-3). A asserção central migrou do
 * "nenhuma request nova" (contra um dublê) para "a releitura real falha" — a mesma garantia, provada
 * contra o servidor de verdade: uma thread apagada não responde 200 a `GetThreadSettings` nunca mais.
 *
 * HARNESS FIEL, como no canon antigo: `confirm()` SUBSTITUI o conteúdo do dialog pelo ConfirmDialog
 * compartilhado — o host da store é replicado aqui como em `(app)/route.tsx`, e o dialog entra por
 * `show()`, o mesmo caminho do app.
 */
describe('ThreadSettingsDialog — apagar a conversa', () => {
	let mounted: MountedRouter | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})
	afterEach(() => {
		act(() => useDialogStore.getState().hide())
		mounted?.unmount()
		mounted = null
	})

	function DialogHost() {
		const { content, open, hide } = useDialogStore()
		return (
			<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
				{content}
			</Dialog>
		)
	}

	/** Clica o primeiro botão cujo texto casa — o dialog vive num portal, então varre `document.body`. */
	async function clickButton(label: string): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const button = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
			if (button) {
				await act(async () => {
					button.click()
				})
				return
			}
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`botão "${label}" nunca apareceu`)
	}

	it('a conversa apagada de verdade some — a UI navega, o cache limpa, a releitura real falha', async () => {
		const { givenThread } = await loadBackendGivens()
		const thread = (await givenThread(backend.asTestBed(), {})) as { id: { value: string } }
		const threadId = thread.id.value

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<DialogHost />
			</QueryClientProvider>,
		)
		act(() => useDialogStore.getState().show(<ThreadSettingsDialog threadId={threadId} />))
		await mounted.settled(
			() => document.body.textContent?.includes(i18n.t('session.boundAgents')) ?? false,
			'o corpo do dialog sair do skeleton',
		)

		await clickButton(i18n.t('session.deleteThread.action'))
		await clickButton(i18n.t('session.deleteThread.confirmAction'))

		await mounted.settled(() => mounted?.router.state.location.pathname === '/dashboard', 'navegar para /dashboard')

		expect(queryClient.getQueryData(getSessionChatQueryKey(threadId))).toBeUndefined()
		expect(queryClient.getQueryData(getHomeDashboardQueryKey())).toBeUndefined()

		// AUSÊNCIA CONTRA O BACKEND REAL — uma thread genuinamente apagada não responde 200 nunca mais.
		let rejected = false
		try {
			await getThreadSettings(threadId)
		} catch {
			rejected = true
		}
		expect(rejected).toBe(true)
	})
})
