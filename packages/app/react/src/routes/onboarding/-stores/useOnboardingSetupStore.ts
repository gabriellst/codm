// packages/app/react/src/routes/onboarding/-stores/useOnboardingSetupStore.ts — COMPLETE final file.
import { create } from 'zustand'
import type { AgentsStepData } from '@/routes/(app)/attach/-components/AgentsStep'
import type { ContactStepData } from '@/routes/(app)/attach/-components/ContactStep'

/**
 * Cross-mount accumulator for the onboarding CONTACT/AGENTS/WORKSPACE/REVIEW steps (spec Decision
 * 4/11). `STEP_COMPONENTS` is a static `Record<StepId, ReactNode>` dispatched by `OnboardingFlow`,
 * which wraps the active step in a `key={stepId}` div — every navigation fully unmounts the step that
 * was showing, so any state local to a step would lose its value on the very next "Voltar"/"Avançar".
 * This store holds that selection across exactly those remounts; `OnboardingReviewStep` reads this
 * snapshot straight through to `ReviewStep` as plain props.
 *
 * `/attach`'s `useAttachWizardStore` holds the SAME three fields, for a related but distinct reason —
 * its steps don't unmount (one continuous `AttachThreadWizard`), but its footer needs to read "does
 * the CURRENT step have a selection?" reactively without depending on a step's own local form. Two
 * stores, not one shared store, because the two wizards have entirely separate navigation/step
 * lifecycles — but the same shape, on purpose: `ReviewStep` (shared by both) reads plain
 * `contactRef`/`workspaceId`/`providers` props either way, never a `form` instance.
 *
 * ### 2026-08-26 — draft/atomic-commit rewrite (the reboot-loses-onboarding fix)
 * Before this date, WORKSPACE/CONTACT/AGENTS wrote straight to their own aggregate the INSTANT the
 * operator confirmed a step (`AddWorkspace`/`AttachThread`, called from this store's `confirmStep`) —
 * and `contactRef`/`providers` themselves lived ONLY here, in memory, never reaching the server at
 * all. A reboot mid-wizard lost the in-memory selections and left `currentStep` stuck at `VALUE`
 * (nothing ever called `SaveOnboardingStep`), so the operator had to reattach the thread and re-pick
 * the workspace from scratch. The backend now models a RASCUNHO (`Onboarding.state`, `PATCH
 * /ui/onboarding/step`) that survives a reboot, materialized atomically by `CompleteOnboarding` only
 * when the operator hits "Concluir" — this store's fields below are what the wizard mirrors that
 * draft into (and back out of, on resume — `OnboardingFlow`'s hydration effect).
 *
 * `confirmStep`/`stepError` — added for the 2026-08-24 onboarding-attach-ux audit (item 2, "Próximo
 * confirma e avança"). `OnboardingFlow`'s footer dispatches EVERY step's `STEP_COMPONENTS` entry from
 * a static `Record<StepId, ReactNode>` with no props threading (see that map's own docblock) — so a
 * mounted step has no prop-based channel to hand its "Próximo" action up to the footer that actually
 * owns the button. `confirmStep` is that channel: the step registers an async closure here in a
 * `useEffect` (cleared on unmount, via `key={stepId}` full remounts — every navigation clears it for
 * free) ONLY WHEN it has a real pending action to submit (today: only `OnboardingWorkspaceStep`, for a
 * picked-but-not-yet-PATCHed path); the footer calls it and awaits it before advancing. UNDEFINED is
 * load-bearing, not just "no-op": `OnboardingFlow`'s Next handler branches on it — undefined stays a
 * fully SYNCHRONOUS `goTo()`, which is what keeps `OnboardingFlow/index.test.tsx`'s
 * click-Próximo-through-every-step regression working without an `await` between clicks.
 * `stepError` mirrors a mutation's OWN error state (never a local try/catch — component bp-22) for
 * `OnboardingFlow`'s footer to render next to "Próximo"/"Concluir" instead of the global toast that
 * `MutationCache.onError` (`router.tsx`) would otherwise fire — the three onboarding write mutations
 * (`SaveOnboardingStep`'s workspace-path confirm, and `CompleteOnboarding`) opt out via `meta: {
 * suppressToast: true }` at their call sites.
 *
 * `contactRef`/`providers` — the CONTACT/AGENTS selections, PATCHed to the server draft the instant a
 * row is clicked (`OnboardingContactStep`/`OnboardingAgentsStep`'s `handleSubmit`, mirroring the same
 * `state` group the backend's `OnboardingDraftStateSchema` declares) — no `confirmStep` needed for
 * either, since a row click already both records AND persists in one gesture.
 *
 * `workspaceId` — an EXISTING already-registered workspace the operator picked from the tile grid
 * (`OnboardingWorkspaceStep.selectExisting`) — PATCHed as `state.workspace.existingWorkspaceId` the
 * instant it's clicked, same immediacy as CONTACT/AGENTS above.
 *
 * `workspacePath` — a NEW folder typed or picked (native dialog or the manual-path fallback) that is
 * NOT YET a real `Workspace` — only `CompleteOnboarding` materializes it, at "Concluir" time. This is
 * the one field that DOES go through `confirmStep`: the operator can keep retyping/replacing the pick
 * before advancing, so there is a genuine "confirm this value" moment (mirroring the OLD
 * `AddWorkspace` timing, now a `PATCH { state: { workspace: { path } } }` instead). `workspaceId` and
 * `workspacePath` are MUTUALLY EXCLUSIVE (same OR the backend's `OnboardingDraftWorkspaceSchema`
 * models) — picking one clears the other, both locally and in the next PATCH's `workspace` group
 * (the backend merges `state` RASO per group: a `workspace` PATCH replaces the whole group).
 *
 * `workspaceHasSelection`/`channelConnected` — added 2026-08-26 (founder bug report: "Próximo"
 * advanced past CHANNEL/WORKSPACE/CONTACT/AGENTS/FULL_DISK_ACCESS with nothing chosen).
 * `OnboardingFlow`'s footer needs, PER STEP, a live "has this step's fact actually happened" boolean
 * to gate "Próximo" (`CAN_CONTINUE` in that file) — CONTACT/AGENTS already had one for free
 * (`contactRef`/`providers` ARE the fact), but CHANNEL and WORKSPACE didn't:
 *   - CHANNEL's fact (a paired WhatsApp device) lives inside `ConnectChannelForm`'s own polling
 *     state (`isConnected`) — its `onConnectedChange` prop is the live, poll-free channel to raise it
 *     here (`step-components.tsx` wires it), instead of adding a second poll in `OnboardingFlow`.
 *   - WORKSPACE's fact is `OnboardingWorkspaceStep`'s local `hasSelection` (a picked-but-unconfirmed
 *     folder, an already-confirmed `workspacePath`, OR a selected `workspaceId`) — raised by that
 *     component's own effect, and — since `workspaceId`/`workspacePath` are now hydrated straight
 *     from the server draft on resume (`OnboardingFlow`'s hydration effect) — that effect derives the
 *     right answer for free the moment the step (re)mounts, no extra plumbing needed here.
 *
 * ### 2026-08-26 — `completedThreadId` REMOVED (moved server-side)
 * This store briefly carried a `completedThreadId` field, stashed by `OnboardingFlow`'s
 * `completeOnboarding.onSuccess` from `CompleteOnboarding`'s `{ threadId: string | null }` response,
 * so `OnboardingFinalStep` could look up the thread's mention tag for a "mention the agent" CTA. It
 * never actually painted: `onSuccess` invalidates the onboarding query and navigates to `/dashboard`
 * in the SAME tick it stashes the id, so the `useGetSessionChat` round-trip that CTA needed was still
 * in flight when the route unmounted the step reading this field. The CTA now lives on the dashboard
 * (`dashboard/-components/MentionCta`), driven by a server-computed field
 * (`GetHomeDashboard.mentionCta`) that survives a fresh page load — no client-only value with a
 * one-tick lifetime needed. `CompleteOnboarding` still returns `{ threadId }` (a legitimate fact about
 * the operation, and already tested) even though nothing on the frontend reads it anymore.
 */
interface OnboardingSetupState {
	contactRef?: ContactStepData['contactRef']
	providers?: AgentsStepData['providers']
	workspaceId?: string
	workspacePath?: string
	workspaceHasSelection: boolean
	channelConnected: boolean
	confirmStep?: () => Promise<void>
	stepError?: string
}

interface OnboardingSetupActions {
	setContactRef: (contactRef: ContactStepData['contactRef']) => void
	setProviders: (providers: AgentsStepData['providers']) => void
	setWorkspaceId: (workspaceId: string | undefined) => void
	setWorkspacePath: (workspacePath: string | undefined) => void
	setWorkspaceHasSelection: (workspaceHasSelection: boolean) => void
	setChannelConnected: (channelConnected: boolean) => void
	setConfirmStep: (confirmStep: (() => Promise<void>) | undefined) => void
	setStepError: (stepError: string | undefined) => void
	reset: () => void
}

type OnboardingSetupStore = OnboardingSetupState & OnboardingSetupActions

const initialState: OnboardingSetupState = {
	contactRef: undefined,
	providers: undefined,
	workspaceId: undefined,
	workspacePath: undefined,
	workspaceHasSelection: false,
	channelConnected: false,
	confirmStep: undefined,
	stepError: undefined,
}

export const useOnboardingSetupStore = create<OnboardingSetupStore>()(set => ({
	...initialState,
	setContactRef: contactRef => set({ contactRef }),
	setProviders: providers => set({ providers }),
	// Mutual exclusion with `workspacePath` is the CALLER'S job (`OnboardingWorkspaceStep` clears the
	// other field explicitly when the operator switches selection mode) — a setter that guessed at
	// intent from truthiness would silently drop a legitimate `setWorkspaceId(undefined)` cleanup call.
	setWorkspaceId: workspaceId => set({ workspaceId }),
	setWorkspacePath: workspacePath => set({ workspacePath }),
	setWorkspaceHasSelection: workspaceHasSelection => set({ workspaceHasSelection }),
	setChannelConnected: channelConnected => set({ channelConnected }),
	setConfirmStep: confirmStep => set({ confirmStep }),
	setStepError: stepError => set({ stepError }),
	reset: () => set(initialState),
}))
