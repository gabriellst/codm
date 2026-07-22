import type { Meta, StoryObj } from '@storybook/react'
import { getMyAccountQueryOptions } from '@template/client-typescript/typescript'
import type { GetMyAccountQueryResponse } from '@template/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'
import type { DeepPartial } from '@/lib'

import { ProfileFormSection } from '.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type AccountMock = DeepPartial<GetMyAccountQueryResponse>

function makeAccount(overrides?: Partial<GetMyAccountQueryResponse['profile']>): AccountMock {
	return {
		profile: {
			userId: 'user-1',
			name: overrides?.name ?? 'Gabriel Araújo',
			email: overrides?.email ?? 'gabriel@bkcompany.app',
			company: overrides?.company ?? 'BK Company',
			pictureUrl: overrides?.pictureUrl ?? null,
		},
		preferences: {
			language: 'pt-BR',
			currency: 'BRL',
			timezone: 'America/Sao_Paulo',
		},
		security: {
			hasPassword: true,
			lastPasswordChangeAt: null,
			twoFactorEnabled: false,
		},
	}
}

const accountOptions = getMyAccountQueryOptions()

const meta: Meta<typeof ProfileFormSection> = {
	title: 'MinhaConta/ProfileFormSection',
	component: ProfileFormSection,
	parameters: connected({
		layout: 'centered',
		route: { id: '/(app)/settings/account/' },
	}),
	decorators: [
		Story => (
			<div className="w-[640px]">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof ProfileFormSection>

/** Default — user with all fields populated. */
export const Default: Story = {
	parameters: {
		msw: { handlers: [mockQuery(accountOptions, makeAccount())] },
	},
}

/** No company — optional fields empty. */
export const MinimalProfile: Story = {
	parameters: {
		msw: {
			handlers: [mockQuery(accountOptions, makeAccount({ company: null }))],
		},
	},
}

/** With avatar URL — shows image in the AvatarUploader. */
export const WithAvatar: Story = {
	parameters: {
		msw: {
			handlers: [mockQuery(accountOptions, makeAccount({ pictureUrl: 'https://i.pravatar.cc/64?u=gabriel' }))],
		},
	},
}

/** Pending — skeleton loading state. */
export const Loading: Story = {
	parameters: {
		msw: { handlers: [loadingQuery(accountOptions)] },
	},
}

/** Error — inline error message. */
export const ErrorState: Story = {
	parameters: {
		msw: { handlers: [errorQuery(accountOptions, 400)] },
	},
}
