import { useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import {
	getSettingsQueryKey,
	registerMcpServerMutationRequestSchema,
	updateMcpServerMutationRequestSchema,
	useRegisterMcpServer,
	useUpdateMcpServer,
	McpApprovalPolicyEnum,
	McpTransportEnum,
	type GetSettingsQueryResponse,
	type McpApprovalPolicy,
	type McpTransportEnumKey,
	type RegisterMcpServerMutationRequest,
	type UpdateMcpServerMutationRequest,
} from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { Field, FieldLabel } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { Select } from '@codm/app-ui/select'
import { Spinner } from '@codm/app-ui/spinner'
import { cn } from '@/lib/utils'

/** The row this form edits when it is REGISTERING, not RECONFIGURING — the SDK's own element type. */
type McpServerEntry = GetSettingsQueryResponse['mcpServers'][number]

/** The two shapes a NEW server can have — taken straight off the register endpoint's own union. */
type StdioCreateVariant = Extract<RegisterMcpServerMutationRequest, { transport: 'STDIO' }>
type HttpCreateVariant = Extract<RegisterMcpServerMutationRequest, { transport: 'HTTP' }>

/** Reconfigure never touches `key` (it isn't in the update contract) — only the connection shape. */
type McpServerConfig = NonNullable<UpdateMcpServerMutationRequest['config']>
type StdioConfig = Extract<McpServerConfig, { transport: 'STDIO' }>
type HttpConfig = Extract<McpServerConfig, { transport: 'HTTP' }>

/** One free-form env/header row — a draft the operator is typing, not a wire shape of its own.
 *  `id` exists ONLY to give the list a stable React key (rows have no identity on the wire — they
 *  collapse into a plain `Record<string,string>` at submit). */
interface KeyValueEntry {
	id: string
	key: string
	value: string
}

const newKeyValueEntry = (): KeyValueEntry => ({ id: crypto.randomUUID(), key: '', value: '' })

const nonEmptyEntries = (entries: KeyValueEntry[]): Record<string, string> | undefined => {
	const filtered = entries.filter(e => e.key.trim().length > 0)
	return filtered.length > 0 ? Object.fromEntries(filtered.map(e => [e.key.trim(), e.value])) : undefined
}

const splitArgs = (raw: string): string[] | undefined => (raw.trim().length > 0 ? raw.trim().split(/\s+/) : undefined)

/**
 * Register or reconfigure a third-party MCP server (T12).
 *
 * `transport` is a SELECTOR, not a form field with everything optional (FRM-P43): choosing STDIO
 * renders command/args/env and validates against the STDIO member of the SDK union; choosing HTTP
 * renders url/headers and validates against the HTTP member. The union IS the body here — both
 * `registerMcpServerMutationRequestSchema` (an intersection of that union with `{key,
 * approvalPolicy}`) and `updateMcpServerMutationRequestSchema.config` are member-per-form (FRM-P43(b)):
 * no combined onChange validator, the whole envelope is the submit gate.
 *
 * `server` present ⇒ RECONFIGURE (`useUpdateMcpServer`, `config` only — `key`/`approvalPolicy` stay
 * out, they already have their own controls on the row). `server` absent ⇒ REGISTER
 * (`useRegisterMcpServer`, the full envelope including `key`).
 */
export function McpServerForm({
	server,
	onDone,
	className,
}: { server?: McpServerEntry; onDone: () => void } & Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	const [transport, setTransport] = useState<McpTransportEnumKey>(server?.transport ?? McpTransportEnum.STDIO)
	const isReconfigure = server != null

	// Dispatch by MAP, never an if-chain (CMP-P18) — each entry builds its own member's form with its
	// own default value, so neither variant form knows the other's fields exist.
	const TRANSPORT_FORMS: Record<McpTransportEnumKey, ReactNode> = {
		[McpTransportEnum.STDIO]: <StdioServerForm server={server} onDone={onDone} />,
		[McpTransportEnum.HTTP]: <HttpServerForm server={server} onDone={onDone} />,
	}

	return (
		<DialogContent className={cn(className)}>
			<DialogHeader>
				<DialogTitle>
					{isReconfigure
						? t('settings.mcpServers.form.reconfigureTitle', { key: server.key })
						: t('settings.mcpServers.form.registerTitle')}
				</DialogTitle>
			</DialogHeader>
			<Field>
				<FieldLabel>{t('settings.mcpServers.form.transportLabel')}</FieldLabel>
				<Select
					enum={McpTransportEnum}
					i18nPrefix="settings.mcpServers.transport"
					value={transport}
					onValueChange={setTransport}
					aria-label={t('settings.mcpServers.form.transportLabel')}
				/>
			</Field>
			{TRANSPORT_FORMS[transport]}
		</DialogContent>
	)
}

/** The two mutations, wired once — register while creating, update (config-only) while reconfiguring. */
function useMcpServerSubmit(server: McpServerEntry | undefined, onDone: () => void) {
	const queryClient = useQueryClient()
	const invalidateAndClose = () => {
		queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() })
		onDone()
	}
	const register = useRegisterMcpServer({ mutation: { onSuccess: invalidateAndClose } })
	const update = useUpdateMcpServer({ mutation: { onSuccess: invalidateAndClose } })

	return {
		isPending: register.isPending || update.isPending,
		submitCreate: (value: RegisterMcpServerMutationRequest) => {
			const parsed = registerMcpServerMutationRequestSchema.safeParse(value)
			if (!parsed.success) return
			register.mutate({ data: parsed.data })
		},
		submitReconfigure: (config: McpServerConfig) => {
			if (!server) return
			const parsed = updateMcpServerMutationRequestSchema.safeParse({ config })
			if (!parsed.success) return
			update.mutate({ mcpServerId: server.id, data: parsed.data })
		},
	}
}

/** Env/header rows — free-form key/value pairs with no identity on the wire (`id` is a local draft
 *  key only, see `KeyValueEntry`). Values render as `password` inputs and NEVER pre-fill from a read:
 *  the settings payload only ever carries `envKeys`/`headerKeys`, never the secret itself. */
function KeyValueListEditor({
	entries,
	onChange,
	keyPlaceholder,
	valuePlaceholder,
	addLabel,
	removeLabel,
	className,
	...props
}: Omit<ComponentProps<'div'>, 'onChange'> & {
	entries: KeyValueEntry[]
	onChange: (entries: KeyValueEntry[]) => void
	keyPlaceholder: string
	valuePlaceholder: string
	addLabel: string
	removeLabel: string
}) {
	return (
		<div className={cn('flex flex-col gap-2', className)} {...props}>
			{entries.map(entry => (
				<div key={entry.id} className="flex items-center gap-2">
					<Input
						className="flex-1 font-mono text-xs"
						placeholder={keyPlaceholder}
						value={entry.key}
						onChange={e => onChange(entries.map(it => (it.id === entry.id ? { ...it, key: e.target.value } : it)))}
					/>
					<Input
						type="password"
						autoComplete="off"
						className="flex-1 font-mono text-xs"
						placeholder={valuePlaceholder}
						value={entry.value}
						onChange={e => onChange(entries.map(it => (it.id === entry.id ? { ...it, value: e.target.value } : it)))}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={removeLabel}
						onClick={() => onChange(entries.filter(it => it.id !== entry.id))}
					>
						<IconTrash className="size-3.5" />
					</Button>
				</div>
			))}
			<Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange([...entries, newKeyValueEntry()])}>
				<IconPlus data-icon="inline-start" /> {addLabel}
			</Button>
		</div>
	)
}

interface VariantFormProps extends ComponentProps<'form'> {
	server?: McpServerEntry
	onDone: () => void
}

/** "npx -y @agent/browser-use-mcp" — the local-process member. */
function StdioServerForm({ server, onDone, className, ...props }: VariantFormProps) {
	const { t } = useTranslation()
	const isReconfigure = server != null
	const { isPending, submitCreate, submitReconfigure } = useMcpServerSubmit(server, onDone)
	const [envEntries, setEnvEntries] = useState<KeyValueEntry[]>([])

	const form = useForm({
		defaultValues: {
			key: server?.key ?? '',
			command: server?.command ?? '',
			args: (server?.args ?? []).join(' '),
			approvalPolicy: undefined as McpApprovalPolicy | undefined,
		},
		onSubmit: async ({ value }) => {
			const args = splitArgs(value.args)
			const env = nonEmptyEntries(envEntries)
			if (isReconfigure) {
				submitReconfigure({ transport: McpTransportEnum.STDIO, command: value.command.trim(), args, env } satisfies StdioConfig)
			} else {
				submitCreate({
					transport: McpTransportEnum.STDIO,
					command: value.command.trim(),
					args,
					env,
					key: value.key.trim(),
					approvalPolicy: value.approvalPolicy,
				} satisfies StdioCreateVariant)
			}
		},
	})

	return (
		<form
			noValidate
			className={cn('flex flex-col gap-4', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			{!isReconfigure && (
				<form.Field name="key">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.keyLabel')}</FieldLabel>
							<Input
								id={field.name}
								className="font-mono"
								placeholder={t('settings.mcpServers.form.keyPlaceholder')}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={e => field.handleChange(e.target.value)}
							/>
						</Field>
					)}
				</form.Field>
			)}

			<form.Field name="command">
				{field => (
					<Field>
						<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.commandLabel')}</FieldLabel>
						<Input
							id={field.name}
							className="font-mono"
							placeholder={t('settings.mcpServers.form.commandPlaceholder')}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={e => field.handleChange(e.target.value)}
						/>
					</Field>
				)}
			</form.Field>

			<form.Field name="args">
				{field => (
					<Field>
						<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.argsLabel')}</FieldLabel>
						<Input
							id={field.name}
							className="font-mono"
							placeholder={t('settings.mcpServers.form.argsPlaceholder')}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={e => field.handleChange(e.target.value)}
						/>
					</Field>
				)}
			</form.Field>

			<Field>
				<FieldLabel>{t('settings.mcpServers.form.envLabel')}</FieldLabel>
				<KeyValueListEditor
					entries={envEntries}
					onChange={setEnvEntries}
					keyPlaceholder={t('settings.mcpServers.form.keyColumnLabel')}
					valuePlaceholder={t('settings.mcpServers.form.valueColumnLabel')}
					addLabel={t('settings.mcpServers.form.addVariable')}
					removeLabel={t('settings.mcpServers.form.removeVariable')}
				/>
			</Field>

			{!isReconfigure && (
				<form.Field name="approvalPolicy">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.approvalPolicyLabel')}</FieldLabel>
							<Select
								enum={McpApprovalPolicyEnum}
								i18nPrefix="settings.mcpServers.policy"
								value={field.state.value}
								onValueChange={field.handleChange}
								placeholder="settings.mcpServers.form.approvalPolicyPlaceholder"
								aria-label={t('settings.mcpServers.form.approvalPolicyLabel')}
							/>
						</Field>
					)}
				</form.Field>
			)}

			<DialogFooter className="mt-2">
				<Button type="button" variant="outline" onClick={onDone}>
					{t('settings.mcpServers.form.cancel')}
				</Button>
				<form.Subscribe selector={s => s.values}>
					{values => {
						const payload = isReconfigure
							? {
									config: {
										transport: McpTransportEnum.STDIO,
										command: values.command.trim(),
										args: splitArgs(values.args),
										env: nonEmptyEntries(envEntries),
									},
								}
							: {
									transport: McpTransportEnum.STDIO,
									command: values.command.trim(),
									args: splitArgs(values.args),
									env: nonEmptyEntries(envEntries),
									key: values.key.trim(),
									approvalPolicy: values.approvalPolicy,
								}
						const valid = isReconfigure
							? updateMcpServerMutationRequestSchema.safeParse(payload).success
							: registerMcpServerMutationRequestSchema.safeParse(payload).success
						return (
							<Button type="submit" disabled={!valid || isPending}>
								{isPending && <Spinner className="mr-2" />}
								{isReconfigure ? t('settings.mcpServers.form.save') : t('settings.mcpServers.form.register')}
							</Button>
						)
					}}
				</form.Subscribe>
			</DialogFooter>
		</form>
	)
}

/** "https://mcp.example.com" — the remote-HTTP member. */
function HttpServerForm({ server, onDone, className, ...props }: VariantFormProps) {
	const { t } = useTranslation()
	const isReconfigure = server != null
	const { isPending, submitCreate, submitReconfigure } = useMcpServerSubmit(server, onDone)
	const [headerEntries, setHeaderEntries] = useState<KeyValueEntry[]>([])

	const form = useForm({
		defaultValues: {
			key: server?.key ?? '',
			url: server?.url ?? '',
			approvalPolicy: undefined as McpApprovalPolicy | undefined,
		},
		onSubmit: async ({ value }) => {
			const headers = nonEmptyEntries(headerEntries)
			if (isReconfigure) {
				submitReconfigure({ transport: McpTransportEnum.HTTP, url: value.url.trim(), headers } satisfies HttpConfig)
			} else {
				submitCreate({
					transport: McpTransportEnum.HTTP,
					url: value.url.trim(),
					headers,
					key: value.key.trim(),
					approvalPolicy: value.approvalPolicy,
				} satisfies HttpCreateVariant)
			}
		},
	})

	return (
		<form
			noValidate
			className={cn('flex flex-col gap-4', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			{!isReconfigure && (
				<form.Field name="key">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.keyLabel')}</FieldLabel>
							<Input
								id={field.name}
								className="font-mono"
								placeholder={t('settings.mcpServers.form.keyPlaceholder')}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={e => field.handleChange(e.target.value)}
							/>
						</Field>
					)}
				</form.Field>
			)}

			<form.Field name="url">
				{field => (
					<Field>
						<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.urlLabel')}</FieldLabel>
						<Input
							id={field.name}
							type="url"
							className="font-mono"
							placeholder={t('settings.mcpServers.form.urlPlaceholder')}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={e => field.handleChange(e.target.value)}
						/>
					</Field>
				)}
			</form.Field>

			<Field>
				<FieldLabel>{t('settings.mcpServers.form.headersLabel')}</FieldLabel>
				<KeyValueListEditor
					entries={headerEntries}
					onChange={setHeaderEntries}
					keyPlaceholder={t('settings.mcpServers.form.keyColumnLabel')}
					valuePlaceholder={t('settings.mcpServers.form.valueColumnLabel')}
					addLabel={t('settings.mcpServers.form.addVariable')}
					removeLabel={t('settings.mcpServers.form.removeVariable')}
				/>
			</Field>

			{!isReconfigure && (
				<form.Field name="approvalPolicy">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('settings.mcpServers.form.approvalPolicyLabel')}</FieldLabel>
							<Select
								enum={McpApprovalPolicyEnum}
								i18nPrefix="settings.mcpServers.policy"
								value={field.state.value}
								onValueChange={field.handleChange}
								placeholder="settings.mcpServers.form.approvalPolicyPlaceholder"
								aria-label={t('settings.mcpServers.form.approvalPolicyLabel')}
							/>
						</Field>
					)}
				</form.Field>
			)}

			<DialogFooter className="mt-2">
				<Button type="button" variant="outline" onClick={onDone}>
					{t('settings.mcpServers.form.cancel')}
				</Button>
				<form.Subscribe selector={s => s.values}>
					{values => {
						const payload = isReconfigure
							? { config: { transport: McpTransportEnum.HTTP, url: values.url.trim(), headers: nonEmptyEntries(headerEntries) } }
							: {
									transport: McpTransportEnum.HTTP,
									url: values.url.trim(),
									headers: nonEmptyEntries(headerEntries),
									key: values.key.trim(),
									approvalPolicy: values.approvalPolicy,
								}
						const valid = isReconfigure
							? updateMcpServerMutationRequestSchema.safeParse(payload).success
							: registerMcpServerMutationRequestSchema.safeParse(payload).success
						return (
							<Button type="submit" disabled={!valid || isPending}>
								{isPending && <Spinner className="mr-2" />}
								{isReconfigure ? t('settings.mcpServers.form.save') : t('settings.mcpServers.form.register')}
							</Button>
						)
					}}
				</form.Subscribe>
			</DialogFooter>
		</form>
	)
}
