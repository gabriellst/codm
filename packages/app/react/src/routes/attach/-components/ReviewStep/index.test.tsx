import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useForm } from '@tanstack/react-form'
import type { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import i18n from '@/lib/i18n'
import { ReviewStep } from '.'

/**
 * `Anexar` NÃO É UM "CONTINUAR" — É O COMMIT DO WIZARD.
 *
 * Os outros passos perderam a ação primária porque nela a pergunta se responde no clique da linha: o
 * botão só repetia a escolha já feita. Aqui não existe linha para clicar e não existe próximo passo —
 * este botão é a confirmação final que CRIA a conversa (`AttachThread`, uma mutation). Inferi-lo de
 * algum outro clique seria criar a conversa sem que ninguém tivesse confirmado.
 *
 * O Voltar, por outro lado, sobe para o cabeçalho como nos demais passos, e continua travado enquanto
 * a mutation está no ar — recuar no meio de um commit é a única volta que este passo não pode oferecer.
 */

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'
const WORKSPACE = '019e4d24-6524-7041-9e1c-8108180cdd02'
const WORKSPACES = [{ workspaceId: WORKSPACE, path: '/Users/ada/looms', badges: ['GIT' as const] }]

type AttachValues = DeepPartial<(typeof attachThreadMutationRequestSchema)['_zod']['output']>

const COMPLETE: AttachValues = {
	contactRef: { channelId: CHANNEL, externalId: '55110001@c.us', displayName: 'Ada Lovelace', kind: 'USER' },
	workspaceId: WORKSPACE,
	providers: ['CLAUDE_CODE'],
}

describe('ReviewStep — o commit fica, o Voltar sobe', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let finished = 0
	let backs = 0

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		finished = 0
		backs = 0
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	/** O passo precisa do form acumulado do wizard, então o teste monta um hospedeiro que o cria. */
	function Harness({ onBack, isSubmitting }: { onBack?: () => void; isSubmitting?: boolean }) {
		const form = useForm({ defaultValues: COMPLETE })
		return (
			<ReviewStep
				form={form}
				channelKindById={new Map()}
				workspaces={WORKSPACES}
				onBack={onBack}
				onFinish={() => (finished += 1)}
				isSubmitting={isSubmitting}
			/>
		)
	}

	function mount(props: { onBack?: () => void; isSubmitting?: boolean } = {}): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<Harness {...props} />)
		})
	}

	/** O botão do commit — ele troca de rótulo enquanto a mutation corre, então os dois valem. */
	function finishButton(): HTMLButtonElement {
		const buttons = [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
		const button = buttons.find(
			b => b.textContent?.includes(i18n.t('attach.finish')) || b.textContent?.includes(i18n.t('attach.attaching')),
		)
		if (!button) throw new Error('botão de vincular não renderizado')
		return button
	}

	it('FALSEADOR — a ação de vincular SOBREVIVE, e é ela que cria a conversa', () => {
		mount({ onBack: () => (backs += 1) })

		const finish = finishButton()
		expect(finish.disabled).toBe(false)

		act(() => finish.click())
		expect(finished).toBe(1)
	})

	it('o Voltar está no cabeçalho, não no rodapé — e o rodapé só carrega a ação', () => {
		mount({ onBack: () => (backs += 1) })

		const back = host?.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		expect(back).not.toBeNull()
		expect(back?.getAttribute('aria-label')).toBe(i18n.t('attach.back'))

		act(() => back?.click())
		expect(backs).toBe(1)

		expect(finishButton().parentElement?.querySelectorAll('button')).toHaveLength(1)
	})

	it('enquanto vincula, nem se recua nem se confirma de novo', () => {
		mount({ onBack: () => (backs += 1), isSubmitting: true })

		const back = host?.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		expect(back?.disabled).toBe(true)
		expect(finishButton().disabled).toBe(true)

		act(() => back?.click())
		expect(backs).toBe(0)
	})
})
