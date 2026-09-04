import type { Meta, StoryObj } from '@storybook/react'
import { expect, screen, userEvent } from 'storybook/test'
import { getSettingsQueryOptions } from '@codm/client-typescript/typescript'
import type { GetSettingsQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Dialog } from '@codm/app-ui/dialog'
import i18n from '@/lib/i18n'
import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'
import { McpServerForm } from '../../-forms/McpServerForm'
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

/** The server this story reconfigures — one env var already on file (`OPENAI_API_KEY`), name only. */
const SERVER_WITH_SECRET: GetSettingsQueryResponse['mcpServers'][number] = {
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
	tools: [],
}

/**
 * RECONFIGURE com um segredo já cadastrado (T5) — abrir "Reconfigurar" NÃO PODE apagar a
 * `OPENAI_API_KEY` que o dono já tem. A linha nasce com a CHAVE preenchida (`envKeys` é só nome —
 * o DTO de leitura nunca carrega segredo) e o VALOR vazio, e o botão de salvar fica bloqueado até
 * o dono re-informar o valor.
 *
 * Renderiza o `McpServerForm` real dentro de um `Dialog open` — mesma técnica de
 * `thread-config.stories.tsx` (`<Dialog open><ThreadSettingsDialog .../></Dialog>`) — em vez de
 * clicar o botão "Reconfigurar" da `McpServersSection`: aquele botão só chama
 * `useDialogStore().show(...)`, e o `<Dialog>` que de fato lê `content`/`open` do store mora em
 * `(app)/route.tsx` (`AuthLayout`), que o harness de story isolado (`withConnected`) não monta —
 * clicar não renderizaria nada para o `play` inspecionar.
 */
export const ReconfigureWithSecrets: Story = {
	render: () => (
		<Dialog open>
			<McpServerForm server={SERVER_WITH_SECRET} onDone={() => {}} />
		</Dialog>
	),
	play: async () => {
		await i18n.changeLanguage('pt')

		// A CHAVE vem semeada — `envKeys` é só nome, o DTO de leitura nunca carrega segredo.
		const keyInput = await screen.findByDisplayValue('OPENAI_API_KEY')
		await expect(keyInput).toBeInTheDocument()

		// O VALOR nasce vazio, e o submit fica bloqueado enquanto ele estiver assim.
		const saveButton = screen.getByRole('button', { name: i18n.t('settings.mcpServers.form.save') })
		await expect(saveButton).toBeDisabled()

		const valueInput = screen.getByPlaceholderText(i18n.t('settings.mcpServers.form.valueColumnLabel'))
		await userEvent.type(valueInput, 'sk-test-123')

		await expect(saveButton).toBeEnabled()
	},
}
