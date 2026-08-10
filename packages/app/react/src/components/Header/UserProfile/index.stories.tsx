import type { Meta, StoryObj } from '@storybook/react'
import { getOperatorIdentityQueryOptions } from '@codm/client-typescript/typescript'
import type { GetOperatorIdentityQueryResponse } from '@codm/client-typescript/typescript'
import { connected, mockQuery } from '@/storybook'
import { UserProfile } from '.'

/**
 * Migrado de `index.test.tsx` (T11, onda B). `UserProfile` é CONECTADO (`useGetOperatorIdentity`
 * interno) — MSW não intercepta sob bun (medido), então SÓ `BorrowedIdentity` é SÓ-VISUAL. Além
 * disso, `channels`/`remotes` (as tabelas que `GetOperatorIdentity` lê) são do gateway Go, sem given
 * exposto em `@codm/api-typescript/testing` — mesmo gap de `ContactStep` (T9): o estado "identidade
 * emprestada" é IMPRODUZÍVEL pelo harness, então esta story é a ÚNICA prova dele, mesmo visual.
 *
 * O comportamento produzível (sem canal ⇒ cai na sessão constante; a query certa é a que preenche o
 * cache) mora no `index.test.tsx` reduzido, via `useIntegrationBackend()`.
 */
const opts = getOperatorIdentityQueryOptions()

const BORROWED: GetOperatorIdentityQueryResponse = {
	identity: {
		channelId: '019e4d24-6524-7041-9e1c-8108180cddae',
		externalId: '558386387518@s.whatsapp.net',
		displayName: 'Gabriel Araújo',
		hasAvatar: true,
	},
}

const meta = {
	title: 'Console/UserProfile',
	component: UserProfile,
	parameters: connected({ route: { id: '/(app)/dashboard/' } }),
} satisfies Meta<typeof UserProfile>
export default meta

type Story = StoryObj<typeof meta>

/** SÓ-VISUAL por necessidade: identidade emprestada de canal é improduzível pelo harness — ver o docblock acima. */
export const BorrowedIdentity: Story = {
	parameters: { msw: { handlers: [mockQuery(opts, BORROWED)] } },
}
