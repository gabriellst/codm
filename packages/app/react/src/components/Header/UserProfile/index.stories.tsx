import type { Meta, StoryObj } from '@storybook/react'
import { getOperatorIdentityQueryOptions } from '@codm/client-typescript/typescript'
import type { GetOperatorIdentityQueryResponse } from '@codm/client-typescript/typescript'
import { connected, mockQuery } from '@/storybook'
import { UserProfile } from '.'

/**
 * Migrado de `index.test.tsx` (T11, onda B). `UserProfile` é CONECTADO (`useGetOperatorIdentity`
 * interno) — MSW não intercepta sob bun (medido), então SÓ `BorrowedIdentity` é SÓ-VISUAL. `channels`/
 * `remotes` (as tabelas que `GetOperatorIdentity` lê) são do gateway Go — desde eixo-ambiente-go
 * (T9/T12), `channels` deixou de ser improduzível (`givenConnectedGatewayChannel`, ver
 * `index.services.test.tsx`), mas `remotes` continua sem produtor (`MockChannel.StreamContactSnapshot`
 * não é consumido por nenhum handler do pipeline de pareamento — mesmo gap documentado em
 * `ContactStep`): o estado "identidade emprestada" exige o PAR `(channel, remote)` casando, então
 * segue IMPRODUZÍVEL pelo harness — esta story é a ÚNICA prova dele, mesmo visual.
 *
 * O comportamento produzível (sem canal ⇒ cai na sessão constante; a query certa é a que preenche o
 * cache) mora no `index.test.tsx` reduzido, via `useIntegrationBackend()`; a mesma queda com um canal
 * REAL, CONECTADO, presente mora em `index.services.test.tsx`.
 */
const opts = getOperatorIdentityQueryOptions()

// Fixture-name divergence: target PNG/live data showed the real operator's name/phone JID, replaced
// by a synthetic fixture (founder, 2026-08-25).
const BORROWED: GetOperatorIdentityQueryResponse = {
	identity: {
		channelId: '019e4d24-6524-7041-9e1c-8108180cddae',
		externalId: '5511900000006@s.whatsapp.net',
		displayName: 'Diego Martins',
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
