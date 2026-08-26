import type { Meta, StoryObj } from '@storybook/react'
import { getHomeDashboardQueryOptions } from '@codm/client-typescript/typescript'
import type { GetHomeDashboardQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { connected, mockQuery } from '@/storybook'
import { MentionCta } from '.'

/**
 * VISUAL-ONLY (storybook skill's own ruling — MSW does not intercept under `bun test`): the two
 * variants below exist for the Storybook BROWSER. The actual branch logic (CTA present iff
 * `GetHomeDashboard.mentionCta` resolves, and the message renders INTERPOLATED, never the raw
 * `{{mention}}` template) is proven against the REAL backend in `index.services.test.tsx`
 * (harness lane, SB-04's sanctioned exception — `GetHomeDashboard` sits behind `OnboardingMiddleware`,
 * so a mocked `play` cannot reach the condition this component reacts to).
 */
const opts = getHomeDashboardQueryOptions()

const meta = {
	title: 'Dashboard/MentionCta',
	component: MentionCta,
	parameters: connected({ route: { id: '/(app)/dashboard/' } }),
} satisfies Meta<typeof MentionCta>
export default meta

type Story = StoryObj<typeof meta>

/** A freshly attached thread, mention gate on, nobody has spoken in it yet. */
export const Present: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					mentionCta: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', tag: '@codm' },
				} satisfies DeepPartial<GetHomeDashboardQueryResponse>),
			],
		},
	},
}

/** The common case — no thread is currently owed this CTA. Renders nothing. */
export const Absent: Story = {
	parameters: {
		msw: {
			handlers: [mockQuery(opts, {} satisfies DeepPartial<GetHomeDashboardQueryResponse>)],
		},
	},
}
