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
 * `confirmStep`/`threadAttached` — added for the 2026-08-24 onboarding-attach-ux audit (item 2,
 * "Próximo confirma e avança"). `OnboardingFlow`'s footer dispatches EVERY step's `STEP_COMPONENTS`
 * entry from a static `Record<StepId, ReactNode>` with no props threading (see that map's own
 * docblock) — so a mounted step has no prop-based channel to hand its "Próximo" action up to the
 * footer that actually owns the button. `confirmStep` is that channel: the step registers an async
 * closure here in a `useEffect` (cleared on unmount, via `key={stepId}` full remounts — every
 * navigation clears it for free) ONLY WHEN it has a real pending action (an unadded folder pick, a
 * complete-and-unattached review); the footer calls it and awaits it before advancing. UNDEFINED is
 * load-bearing, not just "no-op": `OnboardingFlow`'s Next handler branches on it — undefined stays a
 * fully SYNCHRONOUS `goTo()`, which is what keeps `OnboardingFlow/index.test.tsx`'s
 * click-Próximo-through-every-step regression working without an `await` between clicks. Only
 * `OnboardingWorkspaceStep` and `OnboardingReviewStep` register anything; CONTACT/AGENTS never do —
 * their row click already fully records the selection into this same store, so Próximo has nothing
 * left to submit for them. `threadAttached` guards `OnboardingReviewStep` against re-firing
 * `useAttachThread` if the operator goes Voltar back into REVIEW after already attaching once.
 *
 * `stepError` — added for the 2026-08-24 onboarding-attach-ux audit (item 6, "erro do onboarding não
 * ativa toast"). The `MutationCache.onError` in `router.tsx` toasts EVERY mutation failure globally by
 * default; `useAddWorkspace`/`useAttachThread`/`useCompleteOnboarding` opt out of that (per-mutation
 * `meta: { suppressToast: true }`, scoped to their onboarding call sites only — the SAME hooks used
 * outside onboarding keep the toast) and set THIS instead, a translated message `OnboardingFlow`'s
 * footer renders next to the "Próximo"/"Concluir" button. A local validation failure (e.g. an invalid
 * manually-typed workspace path) does NOT go through here — that already has its own on-the-spot
 * `FieldError`; `stepError` is specifically for a mutation that reached the network and failed.
 *
 * `attachedThreadId` — added for the 2026-08-24 onboarding-attach-ux audit (item 7, the FINAL step's
 * "@-mention the agent" CTA). `useAttachThread`'s response is the ONLY place a `threadId` exists for
 * the thread this onboarding session just created — `OnboardingReviewStep` captures it here the
 * moment `confirmStep` succeeds, so `OnboardingFinalStep` (several steps later, no props threading
 * available to it either — same `STEP_COMPONENTS` constraint as `confirmStep`) can look up that
 * thread's `session.mentionGate.tag` (`useGetSessionChat`) for the real mention handle. Undefined
 * when REVIEW was skipped this visit — `OnboardingFinalStep` falls back to the generic closing copy
 * in that case, never a fabricated handle.
 *
 * `channelConnected`/`workspaceHasSelection` — added 2026-08-26 (founder bug report: "Próximo"
 * advanced past CHANNEL/WORKSPACE/CONTACT/AGENTS/FULL_DISK_ACCESS with nothing chosen). `OnboardingFlow`'s
 * footer needs, PER STEP, a live "has this step's fact actually happened" boolean to gate "Próximo"
 * (`CAN_CONTINUE` in that file) — CONTACT/AGENTS already had one for free (`contactRef`/`providers`
 * ARE the fact, set the instant a row is clicked), but CHANNEL and WORKSPACE didn't:
 *   - CHANNEL's fact (a paired WhatsApp device) lives inside `ConnectChannelForm`'s own polling
 *     state (`isConnected`) — its `onConnectedChange` prop is the live, poll-free channel to raise it
 *     here (`step-components.tsx` wires it), instead of adding a second poll in `OnboardingFlow`.
 *   - WORKSPACE's fact is `OnboardingWorkspaceStep`'s local `hasSelection` (a picked-but-unconfirmed
 *     folder OR an already-selected one) — raised by that component's own effect.
 * Both default `false` and are NOT reconstructed from `workspaceId`/`contactRef` alone in
 * `OnboardingFlow` on purpose: a future hydration of this store FROM THE SERVER (e.g. seeding
 * `workspaceId` from `workspaceDone`) flows through `OnboardingWorkspaceStep`'s existing
 * `hasSelection` computation for free — the gate never needs touching when that lands.
 */
interface OnboardingSetupState {
	contactRef?: ContactStepData['contactRef']
	providers?: AgentsStepData['providers']
	workspaceId?: string
	workspaceHasSelection: boolean
	channelConnected: boolean
	threadAttached: boolean
	attachedThreadId?: string
	confirmStep?: () => Promise<void>
	stepError?: string
}

interface OnboardingSetupActions {
	setContactRef: (contactRef: ContactStepData['contactRef']) => void
	setProviders: (providers: AgentsStepData['providers']) => void
	setWorkspaceId: (workspaceId: string | undefined) => void
	setWorkspaceHasSelection: (workspaceHasSelection: boolean) => void
	setChannelConnected: (channelConnected: boolean) => void
	setThreadAttached: (threadAttached: boolean) => void
	setAttachedThreadId: (attachedThreadId: string | undefined) => void
	setConfirmStep: (confirmStep: (() => Promise<void>) | undefined) => void
	setStepError: (stepError: string | undefined) => void
	reset: () => void
}

type OnboardingSetupStore = OnboardingSetupState & OnboardingSetupActions

const initialState: OnboardingSetupState = {
	contactRef: undefined,
	providers: undefined,
	workspaceId: undefined,
	workspaceHasSelection: false,
	channelConnected: false,
	threadAttached: false,
	attachedThreadId: undefined,
	confirmStep: undefined,
	stepError: undefined,
}

export const useOnboardingSetupStore = create<OnboardingSetupStore>()(set => ({
	...initialState,
	setContactRef: contactRef => set({ contactRef }),
	setProviders: providers => set({ providers }),
	setWorkspaceId: workspaceId => set({ workspaceId }),
	setWorkspaceHasSelection: workspaceHasSelection => set({ workspaceHasSelection }),
	setChannelConnected: channelConnected => set({ channelConnected }),
	setThreadAttached: threadAttached => set({ threadAttached }),
	setAttachedThreadId: attachedThreadId => set({ attachedThreadId }),
	setConfirmStep: confirmStep => set({ confirmStep }),
	setStepError: stepError => set({ stepError }),
	reset: () => set(initialState),
}))
