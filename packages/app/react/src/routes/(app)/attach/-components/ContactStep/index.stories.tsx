import type { Meta, StoryObj } from '@storybook/react'
import { getAttachThreadWizardQueryOptions } from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { connected, mockQuery } from '@/storybook'
import { ContactStep } from '.'

/**
 * Migrado de `index.test.tsx` (T9, onda B). `ContactStep` é CONECTADO (`useGetAttachThreadWizard`
 * interno) — as variantes visuais abaixo usam mocks tipados, e por isso são SÓ-VISUAIS (MSW não
 * intercepta sob bun — medido, ver `tests/support/storybook.ts`): nenhuma tem `play`.
 *
 * O comportamento que PODE ser provado contra o backend real (round-trip real, rodapé ausente) mora
 * no `index.test.tsx` reduzido, via `useIntegrationBackend()`. `index.services.test.tsx`
 * (`services: ['apiGo']`, eixo-ambiente-go T9/T12) prova ainda mais: um canal REAL, CONECTADO
 * (`givenConnectedGatewayChannel`), com `contacts: []` continuando por uma razão de PRODUÇÃO —
 * `MockChannel.StreamContactSnapshot` (Go) não é consumido por nenhum handler do pipeline de
 * pareamento, então `gateway_remotes` nunca é escrita para um canal que o mock pareia (gap
 * documentado lá, fora do escopo desta task de UI). O que fica só-visual aqui — busca chegando ao
 * servidor, os dois rótulos de tipo, contato já anexado — são os estados COM contato: sem um produtor
 * para `gateway_remotes`, nenhum harness real consegue popular a lista, exatamente o caso que a ruling
 * do founder pós-spike destina a MSW-só-visual.
 */

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'
const channelKindById = new Map<string, 'WHATSAPP'>([[CHANNEL, 'WHATSAPP']])

const contact = (externalId: string, displayName: string, kind: 'USER' | 'GROUP', alreadyAttached = false) => ({
	channelId: CHANNEL,
	externalId,
	displayName,
	kind,
	hasAvatar: false,
	lastMessageAt: null,
	participantCount: kind === 'GROUP' ? 12 : null,
	alreadyAttached,
})

const EMPTY: DeepPartial<GetAttachThreadWizardQueryResponse> = {
	channels: [],
	workspaces: [],
	providers: [],
	contacts: [],
	contactsNextCursor: null,
}
const opts = getAttachThreadWizardQueryOptions()

const meta = {
	title: 'Attach/ContactStep',
	component: ContactStep,
	args: { channelKindById, onSubmit: () => {} },
	parameters: connected({ route: { id: '/attach/' } }),
} satisfies Meta<typeof ContactStep>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, EMPTY)] } },
}

export const TwoKinds: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					...EMPTY,
					contacts: [contact('55110001@c.us', 'Ada Lovelace', 'USER'), contact('55110002@g.us', 'Equipe Berzerk', 'GROUP')],
				}),
			],
		},
	},
}

export const AlreadyAttachedContact: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, { ...EMPTY, contacts: [contact('55110003@c.us', 'Grace Hopper', 'USER', true)] })] } },
}
