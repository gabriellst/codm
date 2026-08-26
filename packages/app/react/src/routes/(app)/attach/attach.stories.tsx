// packages/app/react/src/routes/(app)/attach/attach.stories.tsx — F3 Wave A (A6), área "Onboarding,
// Login & Attach". Slugs cobertos: vincular-contato-wrapper, vincular-projeto-wrapper,
// vincular-agentes-wrapper, vincular-revisao-wrapper — os quatro passos do `AttachThreadWizard`
// (`PENI6`/`EWECP`/`ZbVfW`/`du3gx`, os mesmos ids que o docblock do próprio componente já cita).
// Diferente de onboarding/login: `/attach` vive DENTRO de `(app)` (ver o comentário do route file) e
// os quatro specs declaram um nó "Rail" — `AppScreenFrame` fica no `sidebar`/`titleBar` DEFAULT (true).
import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { http, HttpResponse } from 'msw'
import {
	getAttachThreadWizardQueryOptions,
	getContactAvatarQueryKey,
	getHomeDashboardQueryOptions,
	getIssuesOverviewQueryOptions,
	getSettingsQueryOptions,
	listWorkspacesQueryOptions,
} from '@codm/client-typescript/typescript'
import type {
	GetAttachThreadWizardQueryResponse,
	GetHomeDashboardQueryResponse,
	GetIssuesOverviewQueryResponse,
	GetSettingsQueryResponse,
	ListWorkspacesQueryResponse,
	ProviderKind,
} from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { AppScreenFrame, connected, mockQuery } from '@/storybook'
import { AttachThreadWizard } from './-components/AttachThreadWizard'
import { useAttachWizardStore } from './-stores/useAttachWizardStore'

// ─── Fixtures — content REPRODUCED verbatim from the four design specs (foto-fixture principle:
// names/paths/statuses copied, nothing invented). ─────────────────────────────────────────────────

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'

const RAFAEL = {
	channelId: CHANNEL,
	externalId: '5511900000101@c.us',
	displayName: 'Rafael Moreira',
	kind: 'USER' as const,
	hasAvatar: true,
	lastMessageAt: null,
	participantCount: null,
	alreadyAttached: false,
}

/**
 * Foto-fixture (UI-FIDELITY.md "Técnicas provadas") — `vincular-revisao-wrapper.json`'s "Foto" node
 * was a real photo (a licensed stock photo, credited in the spec) placed by the designer as the
 * contact's avatar mock. Fixture-name divergence (founder, 2026-08-25): target PNGs show real
 * photos/names, replaced by synthetic fixtures — this constant is now a flat, generated PNG (solid
 * fill, 44×44, no photographic content) instead of a crop of the design target. The app has no real
 * photo for a story fixture (`ThreadAvatar` falls back to initials when `hasAvatar` is false, which
 * is what this row rendered before — a defensible default, but it left the row's worst region-lane
 * tile at 0.71, F3 batch B3), so this fixture exists to feed the mocked
 * `GET /ui/avatars/:channelId/:remoteId` with SOME image bytes without reproducing anyone's real
 * photo. Regeneration recipe: generate any solid-color 44×44 PNG (e.g. via a small `zlib.deflateSync`
 * script) and replace the constant below.
 */
const RAFAEL_AVATAR_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAIAAACR5s1WAAAAOklEQVR4nO3OMQ0AAAgDMPzrwQM2kIIGrj1NKqDVs3EVH0hISEhISEhISEhISEhISEikBxISEhISDwc9WNEwAtb7sQAAAABJRU5ErkJggg=='
const CLUBE_DO_LIVRO = {
	channelId: CHANNEL,
	externalId: '5511900000102@g.us',
	displayName: 'Clube do Livro',
	kind: 'GROUP' as const,
	hasAvatar: false,
	lastMessageAt: null,
	participantCount: null,
	alreadyAttached: false,
}
const BEATRIZ = {
	channelId: CHANNEL,
	externalId: '5511900000103@c.us',
	displayName: 'Beatriz Nunes',
	kind: 'USER' as const,
	hasAvatar: false,
	lastMessageAt: null,
	participantCount: null,
	alreadyAttached: false,
}
const AMIGOS_DO_VOLEI = {
	channelId: CHANNEL,
	externalId: '5511900000104@g.us',
	displayName: 'Amigos do Vôlei',
	kind: 'GROUP' as const,
	hasAvatar: false,
	lastMessageAt: null,
	participantCount: null,
	alreadyAttached: false,
}
const CONTACTS: GetAttachThreadWizardQueryResponse['contacts'] = [RAFAEL, CLUBE_DO_LIVRO, BEATRIZ, AMIGOS_DO_VOLEI]

// Fixture-name divergence (founder, 2026-08-25): the target PNGs show real project/person names,
// replaced by synthetic fixtures here (e.g. "acme"); close it by re-exporting the design targets.
const WS_ACME = '019e4d24-6524-7041-9e1c-8108180cdd10'
const WS_AURORA = '019e4d24-6524-7041-9e1c-8108180cdd11'
const WS_CODEDM = '019e4d24-6524-7041-9e1c-8108180cdd12'
const WORKSPACES: GetAttachThreadWizardQueryResponse['workspaces'] = [
	{ workspaceId: WS_ACME, path: '/Users/work/Desktop/Projetos/acme', badges: ['CLAUDE_PROJECT'] },
	{ workspaceId: WS_AURORA, path: '/Users/work/Desktop/Projetos/aurora-labs', badges: ['GIT', 'CLAUDE_PROJECT'] },
	{ workspaceId: WS_CODEDM, path: '/Users/work/Desktop/Projetos/pessoal/codedm', badges: ['GIT', 'CLAUDE_PROJECT'] },
]

// Same fixture shape as `AgentsStep/index.stories.tsx`'s `THREE_PROVIDERS` — Claude Code is the only
// DRIVABLE runner today, Codex/OpenCode are both `comingSoon` regardless of `status` (see that
// component's docblock on why `comingSoon` always wins the row's label over `status`).
const PROVIDERS: GetAttachThreadWizardQueryResponse['providers'] = [
	{ provider: 'CLAUDE_CODE', status: 'DETECTED', available: true, comingSoon: false, version: '1.0.0' },
	{ provider: 'CODEX', status: 'DETECTED', available: false, comingSoon: true, version: '3.1.0' },
	{ provider: 'OPENCODE', status: 'NOT_INSTALLED', available: false, comingSoon: true },
]

const WIZARD_DATA: DeepPartial<GetAttachThreadWizardQueryResponse> = {
	noChannelConnected: false,
	channels: [{ channelId: CHANNEL, kind: 'WHATSAPP' }],
	contacts: CONTACTS,
	contactsNextCursor: null,
	workspaces: WORKSPACES,
	providers: PROVIDERS,
}

// Rail chrome fixtures — minimal/quiet on purpose, this file's four screens are about the wizard, not
// the sidebar's own content (same "quiet rail" convention `thread.stories.tsx`'s `SIDEBAR_*` uses).
const SIDEBAR_DASHBOARD: DeepPartial<GetHomeDashboardQueryResponse> = {
	threads: [],
	activeSessions: [],
	latestActivity: [],
	channels: [{ kind: 'WHATSAPP', status: 'CONNECTED' }],
}
const SIDEBAR_WORKSPACES: DeepPartial<ListWorkspacesQueryResponse> = { workspaces: [] }
const SIDEBAR_ISSUES: DeepPartial<GetIssuesOverviewQueryResponse> = {
	statsLine: { awaitingInput: 0, working: 0, completed: 0, archived: 0 },
	groups: [],
}
const SIDEBAR_SETTINGS: DeepPartial<GetSettingsQueryResponse> = { appVersion: '0.1.0' }

const wizardOpts = getAttachThreadWizardQueryOptions()
const dashboardOpts = getHomeDashboardQueryOptions()
const workspacesListOpts = listWorkspacesQueryOptions()
const issuesOpts = getIssuesOverviewQueryOptions()
const settingsOpts = getSettingsQueryOptions()

// `getContactAvatarQueryKey` is not a React Query hook — `ThreadAvatar` feeds its url straight into
// an `<img src>` (`contactAvatarUrl`), so it never goes through `mockQuery`'s typed queryOptions path
// and needs a raw MSW `http.get` handler instead. The key's `url` is ALWAYS the literal
// `:channelId`/`:remoteId` pattern regardless of the args passed (they only populate `params`, which
// this handler doesn't need — msw's own path matcher resolves the params), so the same handler serves
// any contact's avatar request in this file; today only Rafael's row requests one (`hasAvatar: true`).
function rafaelAvatarHandler() {
	return http.get(`*${getContactAvatarQueryKey(undefined, undefined)[0].url}`, () => {
		const bytes = Uint8Array.from(atob(RAFAEL_AVATAR_PNG_BASE64), c => c.charCodeAt(0))
		return new HttpResponse(bytes, { headers: { 'Content-Type': 'image/png' } })
	})
}

function attachMsw() {
	return {
		handlers: [
			mockQuery(wizardOpts, WIZARD_DATA),
			mockQuery(dashboardOpts, SIDEBAR_DASHBOARD),
			mockQuery(workspacesListOpts, SIDEBAR_WORKSPACES),
			mockQuery(issuesOpts, SIDEBAR_ISSUES),
			mockQuery(settingsOpts, SIDEBAR_SETTINGS),
			rafaelAvatarHandler(),
		],
	}
}

interface AttachStepSeed {
	stepIndex: number
	contactRef?: { channelId: string; externalId: string; displayName: string; kind: 'USER' | 'GROUP' | 'BROADCAST' }
	workspaceId?: string
	providers?: ProviderKind[]
}

/**
 * `AttachThreadWizard` ALWAYS resets `useAttachWizardStore` to step 0 on its OWN mount
 * (`useEffect(() => reset(), [reset])`, unconditional — no data it reads decides that reset, unlike
 * `OnboardingFlow`'s slide index, which IS seeded from the mocked `useGetOnboarding()` read). There is
 * no prop on the real component to open past step 0, and adding one is out of this file's scope (ZERO
 * component edits). This wrapper is the same fix in spirit as `OnboardingFlow.stories.tsx`'s
 * `withServices` — a story-local harness that seeds a Zustand store before the connected component
 * renders — adapted for a store the target component resets AFTER mount instead of before: nesting
 * `AttachThreadWizard` as this component's CHILD guarantees React fires the child's passive effect
 * (the reset) before the parent's (this seed) within the same commit, so the seed always wins the
 * race deterministically — not a `play()`-driven click-through, which the fidelity harness
 * (`scripts/fidelity.ts`) never awaits before screenshotting.
 */
function AttachAtStep({ stepIndex, contactRef, workspaceId, providers }: AttachStepSeed) {
	useEffect(() => {
		useAttachWizardStore.setState({ currentStepIndex: stepIndex, direction: 1, contactRef, workspaceId, providers })
	}, [stepIndex, contactRef, workspaceId, providers])
	return <AttachThreadWizard />
}

const meta = {
	title: 'Attach/Screens',
	component: AttachThreadWizard,
	parameters: connected({ route: { id: '/(app)/attach/' }, msw: attachMsw() }),
} satisfies Meta<typeof AttachThreadWizard>
export default meta

type Story = StoryObj<typeof meta>

// GAP shared by all four screens below (documented once here, referenced from each docblock): the
// design's step tabs read "Contato · Projeto · Agentes · Revisão", and the Revisão row for the chosen
// folder reads "Projeto". The live app's copy is `attach.navWorkspace` = "Espaço" (tab) and
// `attach.rowWorkspace` = "Espaço de trabalho" (Revisão row label) — "Espaço"/"Espaço de trabalho", not
// "Projeto". Reproduced as the app actually renders (i18n copy, not a CSS/component concern this file
// can fix) — never silently swapped to match the design's word choice.

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/vincular-contato-wrapper.png` +
 * `design/system/pen/screens/vincular-contato-wrapper.json`: title "Escolha uma conversa", subtitle
 * "Escolha o contato, grupo ou caixa de entrada onde seu agente vai viver.", search placeholder
 * "Buscar contatos e grupos", four rows — Rafael Moreira (Contato · WhatsApp, SELECTED — filled
 * check badge), Clube do Livro (Grupo · WhatsApp), Beatriz Nunes (Contato · WhatsApp), Amigos do Vôlei
 * (Grupo · WhatsApp) — persistent footer with Voltar (disabled — first step) / Continuar (enabled,
 * matches the selection). Matches `ContactStep` verbatim (`attach.stepThreadTitle`/
 * `stepThreadSubtitle`/`searchContacts` all match the design text 1:1).
 */
export const VincularContato: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'vincular-contato-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({ route: { id: '/(app)/attach/' }, msw: attachMsw() }),
	},
	render: () => (
		<AppScreenFrame>
			<AttachAtStep
				stepIndex={0}
				contactRef={{
					channelId: RAFAEL.channelId,
					externalId: RAFAEL.externalId,
					displayName: RAFAEL.displayName,
					kind: RAFAEL.kind,
				}}
			/>
		</AppScreenFrame>
	),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/vincular-projeto-wrapper.png` +
 * `design/system/pen/screens/vincular-projeto-wrapper.json`: title "Escolha um projeto", subtitle "A
 * pasta de projeto em que seus agentes vão trabalhar.", three rows — `/Users/work/Desktop/Projetos/
 * acme` (badge "Projeto Claude" only), `/Users/work/Desktop/Projetos/aurora-labs` (badges "git" +
 * "Projeto Claude"), `/Users/work/Desktop/Projetos/pessoal/codedm` (badges "git" + "Projeto Claude") —
 * NONE stroked `$primary` in the spec (no row selected). See the file-level GAP note above for the
 * "Projeto" (design) vs "Espaço"/"Espaço de trabalho" (app copy) mismatch on the tab/title.
 *
 * GAP (not fixed here): the spec's footer draws "Continuar" filled `$primary` (the enabled look) even
 * with no row selected, but `WorkspaceStep`'s `defaultValues.workspaceId` is genuinely unset at this
 * step (matching the design's own unselected rows) — `AttachThreadWizard`'s real gate is
 * `Boolean(workspaceId)`, so the REAL Continuar renders disabled here. Reproduced as the live
 * component actually behaves (the ruler's "measure honestly" canon), not forced enabled to chase the
 * pixel — likely the design's static mock simply doesn't model the disabled variant of this button.
 */
export const VincularProjeto: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'vincular-projeto-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({ route: { id: '/(app)/attach/' }, msw: attachMsw() }),
	},
	render: () => (
		<AppScreenFrame>
			<AttachAtStep
				stepIndex={1}
				contactRef={{
					channelId: RAFAEL.channelId,
					externalId: RAFAEL.externalId,
					displayName: RAFAEL.displayName,
					kind: RAFAEL.kind,
				}}
			/>
		</AppScreenFrame>
	),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/vincular-agentes-wrapper.png` +
 * `design/system/pen/screens/vincular-agentes-wrapper.json`: title "Escolha os agentes", subtitle
 * "Quais CLIs de provedor podem trabalhar nesta conversa.", Claude Code row SELECTED (filled checkbox,
 * model select "Automático", status "Detectado"), Codex row "Em breve", OpenCode row "Em breve" — both
 * disabled/dimmed. Matches `AgentsStep` verbatim (`attach.stepAgentsTitle`/`stepAgentsSubtitle` match;
 * `AgentModelId.DEFAULT` label "Automático" and `ProviderStatus.DETECTED` label "Detectado" both match
 * the design text). Footer Continuar enabled (`Boolean(providers.length)`, matches the selection).
 */
export const VincularAgentes: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'vincular-agentes-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({ route: { id: '/(app)/attach/' }, msw: attachMsw() }),
	},
	render: () => (
		<AppScreenFrame>
			<AttachAtStep
				stepIndex={2}
				contactRef={{
					channelId: RAFAEL.channelId,
					externalId: RAFAEL.externalId,
					displayName: RAFAEL.displayName,
					kind: RAFAEL.kind,
				}}
				workspaceId={WS_ACME}
				providers={['CLAUDE_CODE']}
			/>
		</AppScreenFrame>
	),
}

/**
 * Content REPRODUCED from `design/fidelity/targets/screens/vincular-revisao-wrapper.png` +
 * `design/system/pen/screens/vincular-revisao-wrapper.json`: title "Revisão", subtitle "Confirme o
 * vínculo e vincule a conversa.", three summary rows — Contato "Rafael Moreira" (WhatsApp, Editar),
 * Projeto "acme" / `/Users/work/Desktop/Projetos/acme` (badge "Projeto Claude", Editar),
 * Agentes "Claude Code" / "Modelo: Automático" (status "Detectado", Editar) — footer note "Ao vincular,
 * as mensagens desta conversa passam a abrir tarefas nesta pasta. Você pode pausar ou desfazer a
 * qualquer momento.", CTA "Vincular conversa". Matches `ReviewStep` verbatim on title/subtitle/footer
 * note/CTA (`attach.stepReviewTitle`/`stepReviewSubtitle`/`reviewFooterNote`/`finish` all match; see
 * the file-level GAP note above for the "Projeto" vs "Espaço de trabalho" row-label mismatch).
 *
 * GAP (not fixed here): the design draws the Projeto row as THREE pieces — folder name ("acme"),
 * full path, and a "Projeto Claude" badge — but `ReviewStep`'s `ReviewRow` only has label/value/extra
 * slots and this call site passes just the raw `workspacePath` as `value`, no folder-name line and no
 * badge. Same gap on the Agentes row: the design shows "Claude Code" (name) + "Modelo: Automático"
 * (model) as two lines, but `ReviewStep` only renders the provider label(s) — the AGENTS step's model
 * pick is local-only state (see `AgentsStep`'s own docblock on why it never reaches the wire), so
 * `ReviewStep` has nothing to read it FROM even if it grew an extra line. Both are real component gaps,
 * not something this fidelity story can paper over.
 */
export const VincularRevisao: Story = {
	parameters: {
		layout: 'fullscreen',
		fidelity: { slug: 'vincular-revisao-wrapper', kind: 'screens', viewport: { width: 1440, height: 900 } },
		...connected({ route: { id: '/(app)/attach/' }, msw: attachMsw() }),
	},
	render: () => (
		<AppScreenFrame>
			<AttachAtStep
				stepIndex={3}
				contactRef={{
					channelId: RAFAEL.channelId,
					externalId: RAFAEL.externalId,
					displayName: RAFAEL.displayName,
					kind: RAFAEL.kind,
				}}
				workspaceId={WS_ACME}
				providers={['CLAUDE_CODE']}
			/>
		</AppScreenFrame>
	),
}
