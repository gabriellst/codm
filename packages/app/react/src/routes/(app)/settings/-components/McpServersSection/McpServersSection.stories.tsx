import type { Meta, StoryObj } from '@storybook/react'
import { getSettingsQueryOptions } from '@codm/client-typescript/typescript'
import type { GetSettingsQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'
import { McpServersSection } from '.'

/**
 * CONNECTED (the section owns its data via `useGetSettings`). Five cases cover the read AC's own
 * shapes — two live servers with tools, empty, an unreachable server, the `browser-use` per-tool
 * override, and the pre-approved (`stopCriteria.approvalNeeded: false`) state — plus loading/error.
 */
const opts = getSettingsQueryOptions()

const BASE: DeepPartial<GetSettingsQueryResponse> = {
	providers: [],
	stopCriteria: {
		serverErrors: true,
		blockedByClassification: true,
		humanRequested: true,
		approvalNeeded: true,
		authRequired: true,
	},
	general: { operatorName: 'owner', timezone: 'America/Sao_Paulo', dataDir: '/home/owner/.codm' },
	appVersion: '1.0.0',
}

const meta = {
	title: 'Settings/McpServersSection',
	component: McpServersSection,
	parameters: connected({ route: { id: '/(app)/settings/' } }),
} satisfies Meta<typeof McpServersSection>
export default meta

type Story = StoryObj<typeof meta>

/** Two registered servers, each publishing its own tools, both on `AUTO` at rest. */
export const Default: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					...BASE,
					mcpServers: [
						{
							id: 'mcp-browser-use',
							key: 'browser-use',
							transport: 'STDIO',
							command: 'npx',
							args: ['-y', '@agent/browser-use-mcp'],
							envKeys: ['OPENAI_API_KEY'],
							headerKeys: [],
							enabled: true,
							approvalPolicy: 'AUTO',
							reachable: true,
							tools: [
								{ name: 'browser_click', policy: null },
								{ name: 'browser_navigate', policy: null },
							],
						},
						{
							id: 'mcp-linear',
							key: 'linear',
							transport: 'HTTP',
							url: 'https://mcp.linear.app',
							envKeys: [],
							headerKeys: ['Authorization'],
							enabled: true,
							approvalPolicy: 'ASK',
							reachable: true,
							tools: [{ name: 'create_issue', policy: null }],
						},
					],
				}),
			],
		},
	},
}

/** No servers registered yet — the empty state, add-server affordance still visible. */
export const Empty: Story = {
	parameters: {
		msw: { handlers: [mockQuery(opts, { ...BASE, mcpServers: [] })] },
	},
}

/** Enabled but unreachable — a connection-failure notice replaces the tool list entirely. */
export const Unreachable: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					...BASE,
					mcpServers: [
						{
							id: 'mcp-stale',
							key: 'stale-server',
							transport: 'STDIO',
							command: 'stale-mcp-binary',
							args: [],
							envKeys: [],
							headerKeys: [],
							enabled: true,
							approvalPolicy: 'ASK',
							reachable: false,
							tools: [],
						},
					],
				}),
			],
		},
	},
}

/**
 * THE reason this section exists: the server stays `AUTO` (asking on every `browser_click` would
 * be unbearable) while `retry_with_browser_use_agent` — a tool that runs a whole session driven by
 * another model — is held at `ASK` via a per-tool override.
 */
export const ToolOverride: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					...BASE,
					mcpServers: [
						{
							id: 'mcp-browser-use',
							key: 'browser-use',
							transport: 'STDIO',
							command: 'npx',
							args: ['-y', '@agent/browser-use-mcp'],
							envKeys: ['OPENAI_API_KEY'],
							headerKeys: [],
							enabled: true,
							approvalPolicy: 'AUTO',
							reachable: true,
							tools: [
								{ name: 'browser_click', policy: null },
								{ name: 'browser_navigate', policy: null },
								{ name: 'retry_with_browser_use_agent', policy: 'ASK' },
							],
						},
					],
				}),
			],
		},
	},
}

/** `stopCriteria.approvalNeeded: false` — every external tool is pre-approved, including a server
 *  registered after this moment. The per-server/per-tool selectors render but decide nothing. */
export const PreApproved: Story = {
	parameters: {
		msw: {
			handlers: [
				mockQuery(opts, {
					...BASE,
					stopCriteria: { ...BASE.stopCriteria, approvalNeeded: false },
					mcpServers: [
						{
							id: 'mcp-browser-use',
							key: 'browser-use',
							transport: 'STDIO',
							command: 'npx',
							args: ['-y', '@agent/browser-use-mcp'],
							envKeys: ['OPENAI_API_KEY'],
							headerKeys: [],
							enabled: true,
							approvalPolicy: 'AUTO',
							reachable: true,
							tools: [{ name: 'browser_click', policy: null }],
						},
					],
				}),
			],
		},
	},
}

export const Loading: Story = {
	parameters: { msw: { handlers: [loadingQuery(opts)] } },
}

export const ErrorState: Story = {
	parameters: { msw: { handlers: [errorQuery(opts)] } },
}
