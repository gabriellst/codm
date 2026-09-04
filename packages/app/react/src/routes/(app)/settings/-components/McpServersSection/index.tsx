import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { IconAlertTriangle, IconKey, IconPlug, IconPlugConnectedX, IconPlus, IconSettings, IconTrash } from '@tabler/icons-react'
import {
	getSettingsQueryKey,
	useGetSettings,
	useRemoveMcpServer,
	useUpdateMcpServer,
	McpApprovalPolicyEnum,
	type GetSettingsQueryResponse,
} from '@codm/client-typescript/typescript'
import { sectionLabelBare, surface } from '@codm/app-ui/surfaces'
import { Button } from '@codm/app-ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@codm/app-ui/empty'
import { Select } from '@codm/app-ui/select'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Switch } from '@codm/app-ui/switch'
import { cn } from '@/lib/utils'
import { useDialogStore } from '@/stores/useDialogStore'
import { McpServerForm } from '../../-forms/McpServerForm'

type McpServer = GetSettingsQueryResponse['mcpServers'][number]
type McpTool = McpServer['tools'][number]

/**
 * WHICH of the three tool-policy states a tool sits in — `INHERIT` is a UI-only sentinel for
 * `tool.policy === null` (the wire never sends the string "INHERIT"); it has no wire member to
 * borrow because it is the ABSENCE of a per-tool override, not a policy value. The other two
 * members SPREAD from the SDK's `McpApprovalPolicyEnum` instead of being redeclared — a new wire
 * member then shows up here for free, instead of silently missing from this map.
 */
const TOOL_POLICY_OPTIONS = { INHERIT: 'INHERIT', ...McpApprovalPolicyEnum } as const

/**
 * MCP servers the owner has registered, and the policy that governs every tool each one
 * publishes (T12). Mirrors `ProvidersSection`'s shape: owns its own read, inline skeleton, own
 * empty state — the register/reconfigure flow opens through the shared `useDialogStore`.
 *
 * The pre-approval banner (`stopCriteria.approvalNeeded === false`) is what makes the per-server
 * and per-tool selectors below it MUTED rather than merely present: in that state the backend
 * short-circuits every approval gate, so the selector's value stops deciding anything — including
 * for a server registered a minute from now. Disabling the controls (rather than hiding them)
 * keeps the configured intent visible for when the gate comes back on.
 */
export function McpServersSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetSettings()
	const show = useDialogStore(s => s.show)
	const hide = useDialogStore(s => s.hide)

	const servers = data?.mcpServers ?? []
	const approvalNeeded = data?.stopCriteria.approvalNeeded ?? true

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center justify-between gap-3">
				<h2 className={sectionLabelBare}>{t('settings.mcpServers.title')}</h2>
				<Button type="button" variant="ghost" size="sm" onClick={() => show(<McpServerForm onDone={hide} />)}>
					<IconPlus data-icon="inline-start" /> {t('settings.mcpServers.addServer')}
				</Button>
			</div>

			{!isLoading && !approvalNeeded && (
				<div className={cn('flex items-start gap-3 rounded-asymmetric-sm px-4 py-3.5', surface)}>
					<IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">{t('settings.mcpServers.preApprovedWarning')}</p>
				</div>
			)}

			{isLoading ? (
				<div className="flex flex-col gap-2.5">
					<Skeleton className="h-28 rounded-asymmetric-sm" />
					<Skeleton className="h-28 rounded-asymmetric-sm" />
				</div>
			) : servers.length === 0 ? (
				<Empty className="border border-solid border-border bg-background">
					<EmptyMedia
						variant="icon"
						className="size-12 rounded-asymmetric-md bg-secondary text-secondary-foreground [&_svg:not([class*='size-'])]:size-6"
					>
						<IconPlug />
					</EmptyMedia>
					<EmptyTitle className="text-base">{t('settings.mcpServers.emptyTitle')}</EmptyTitle>
					<EmptyDescription>{t('settings.mcpServers.emptyDescription')}</EmptyDescription>
				</Empty>
			) : (
				<ul className="flex flex-col gap-2.5">
					{servers.map(server => (
						<McpServerRow
							key={server.id}
							server={server}
							approvalNeeded={approvalNeeded}
							onReconfigure={() => show(<McpServerForm server={server} onDone={hide} />)}
						/>
					))}
				</ul>
			)}
		</section>
	)
}

/**
 * One registered server: identity + reach, the enable toggle, its own approval policy, secrets
 * count, and — reachable ones only — the tool list. A LEAF (receives its item by prop; the section
 * above owns the list query), but it owns its OWN mutations, same as `LoopRow`: the toggle and the
 * policy selector both write through `useUpdateMcpServer` right where the operator clicks them.
 *
 * Root is a native `<li>` (parent `<ul>` in `McpServersSection`) rather than a `div` carrying a
 * declared `role` — T9 found `aria-label` silently unsupported on a bare `div` (implicit role
 * `generic` prohibits it, so `getByLabel` in the e2e passed while no screen reader ever heard the
 * name). `listitem` is real list semantics AND one of the roles that supports an accessible name.
 */
function McpServerRow({
	server,
	approvalNeeded,
	onReconfigure,
	className,
	...props
}: ComponentProps<'li'> & { server: McpServer; approvalNeeded: boolean; onReconfigure: () => void }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { confirm } = useDialogStore()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() })
	const updateServer = useUpdateMcpServer({ mutation: { onSuccess: invalidate } })
	const removeServer = useRemoveMcpServer({ mutation: { onSuccess: invalidate } })

	const onRemove = async () => {
		const ok = await confirm({
			title: t('settings.mcpServers.removeConfirmTitle'),
			description: t('settings.mcpServers.removeConfirmDescription', { key: server.key }),
			actionLabel: t('settings.mcpServers.removeConfirmAction'),
			cancelLabel: t('common.cancel'),
			variant: 'destructive',
		})
		if (!ok) return
		removeServer.mutate({ mcpServerId: server.id })
	}

	// Secret COUNT only — the read never carries a value, only `envKeys`/`headerKeys` (T12 wire
	// contract). Which key list applies is the transport's own discriminant, read here rather than
	// invented as a third field.
	const secretCount = server.transport === 'STDIO' ? server.envKeys.length : server.headerKeys.length
	// An enabled-but-unreachable server shows a connection notice INSTEAD of its tool list (T12 AC):
	// a tool selector for a server the daemon cannot currently talk to has nothing real to say.
	const unreachable = server.enabled && !server.reachable

	return (
		<li
			className={cn('flex flex-col gap-3 rounded-asymmetric-sm px-4 py-3.5', surface, className)}
			data-testid={`mcp-server-${server.key}`}
			aria-label={server.key}
			{...props}
		>
			<div className="flex items-center gap-3.5">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="font-bold text-foreground">{server.key}</span>
					<span className="text-xs text-muted-foreground">{t(`settings.mcpServers.transport.${server.transport}`)}</span>
				</div>
				<Switch
					aria-label={t('settings.mcpServers.enabledToggle')}
					checked={server.enabled}
					disabled={updateServer.isPending}
					onCheckedChange={enabled => updateServer.mutate({ mcpServerId: server.id, data: { enabled } })}
				/>
				<Select
					enum={McpApprovalPolicyEnum}
					i18nPrefix="settings.mcpServers.policy"
					value={server.approvalPolicy}
					onValueChange={policy => updateServer.mutate({ mcpServerId: server.id, data: { approvalPolicy: policy } })}
					disabled={updateServer.isPending || !approvalNeeded}
					className={cn('w-28 shrink-0', !approvalNeeded && 'opacity-60')}
					aria-label={t('settings.mcpServers.policyLabel')}
				/>
				<Button type="button" variant="ghost" size="icon-sm" aria-label={t('settings.mcpServers.reconfigure')} onClick={onReconfigure}>
					<IconSettings />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={t('settings.mcpServers.remove')}
					disabled={removeServer.isPending}
					onClick={onRemove}
				>
					<IconTrash />
				</Button>
			</div>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<IconKey className="size-3.5 shrink-0" />
				{t('settings.mcpServers.variablesConfigured', { count: secretCount })}
			</div>

			{unreachable ? (
				<div className="flex items-center gap-2 rounded-asymmetric-xs bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<IconPlugConnectedX className="size-4 shrink-0" />
					{t('settings.mcpServers.unreachable')}
				</div>
			) : server.tools.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t('settings.mcpServers.noTools')}</p>
			) : (
				<div className="flex flex-col gap-1.5">
					{server.tools.map(tool => (
						<McpToolRow key={tool.name} serverId={server.id} tool={tool} approvalNeeded={approvalNeeded} />
					))}
				</div>
			)}
		</li>
	)
}

/**
 * ONE published tool's policy — the browser-use case this section exists for: the server stays on
 * `AUTO` (asking on every `browser_click` would be unbearable) while `retry_with_browser_use_agent`
 * (a tool that runs a whole session driven by another model) is held at `ASK`. `tool.policy === null`
 * reads/writes as `INHERIT` — the sentinel never reaches the wire, `null` does.
 */
function McpToolRow({
	serverId,
	tool,
	approvalNeeded,
	className,
	...props
}: ComponentProps<'div'> & { serverId: string; tool: McpTool; approvalNeeded: boolean }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const updateServer = useUpdateMcpServer({
		mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() }) },
	})

	const value = tool.policy ?? TOOL_POLICY_OPTIONS.INHERIT

	return (
		<div className={cn('flex items-center gap-3 rounded-asymmetric-xs bg-muted/30 px-3 py-2', className)} {...props}>
			<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{tool.name}</span>
			<Select
				enum={TOOL_POLICY_OPTIONS}
				i18nPrefix="settings.mcpServers.toolPolicy"
				value={value}
				onValueChange={next =>
					updateServer.mutate({
						mcpServerId: serverId,
						data: { toolPolicy: { toolName: tool.name, policy: next === TOOL_POLICY_OPTIONS.INHERIT ? null : next } },
					})
				}
				disabled={updateServer.isPending || !approvalNeeded}
				className={cn('w-44 shrink-0', !approvalNeeded && 'opacity-60')}
				aria-label={t('settings.mcpServers.toolPolicyLabel', { tool: tool.name })}
			/>
		</div>
	)
}
