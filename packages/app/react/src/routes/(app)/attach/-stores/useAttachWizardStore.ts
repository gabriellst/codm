import { create } from 'zustand'
import type { AgentsStepData } from '../-components/AgentsStep'
import type { ContactStepData } from '../-components/ContactStep'

/**
 * Navigation + ACCUMULATED SELECTION for the attach wizard (D3, founder review 12/08).
 *
 * PREVIOUSLY this store held ONLY navigation (`currentStepIndex`/`direction`), and the selection data
 * lived in a `useForm()` accumulator owned by `AttachThreadWizard` (the FRM-P18 "uncalled function"
 * trick) — every step wrote into that one persistent form and, in the SAME click, called `advance()`.
 * The founder revoked "choosing is answering" on 12/08 after testing the desktop build: a step now
 * only RECORDS its selection, and the wizard's persistent footer (Voltar/Continuar) is what moves the
 * step index. That footer needs to read "does the CURRENT step have a selection?" from something that
 * re-renders `AttachThreadWizard` on every change WITHOUT the step remounting first — a plain Zustand
 * store, not a form instance buried behind `form.Subscribe`.
 *
 * This also unifies the shape with the onboarding wizard's `useOnboardingSetupStore`, which already
 * held these exact three fields for the exact same reason (its steps fully unmount on navigation —
 * see that store's docblock). `/attach`'s steps don't unmount today, but there's no longer a reason to
 * keep two different accumulation strategies for the same three fields: one store, one shape, read by
 * `ReviewStep` the same way in both wizards (plain props, no `form` prop — see that component).
 */
interface AttachWizardState {
	currentStepIndex: number
	direction: 1 | -1
	contactRef?: ContactStepData['contactRef']
	workspaceId?: string
	providers?: AgentsStepData['providers']
}

interface AttachWizardActions {
	setCurrentStepIndex: (currentStepIndex: number) => void
	setDirection: (direction: 1 | -1) => void
	setContactRef: (contactRef: ContactStepData['contactRef']) => void
	setWorkspaceId: (workspaceId: string) => void
	setProviders: (providers: AgentsStepData['providers']) => void
	reset: () => void
}

type AttachWizardStore = AttachWizardState & AttachWizardActions

const initialState: AttachWizardState = {
	currentStepIndex: 0,
	direction: 1,
	contactRef: undefined,
	workspaceId: undefined,
	providers: undefined,
}

export const useAttachWizardStore = create<AttachWizardStore>()(set => ({
	...initialState,
	setCurrentStepIndex: currentStepIndex => set({ currentStepIndex }),
	setDirection: direction => set({ direction }),
	setContactRef: contactRef => set({ contactRef }),
	setWorkspaceId: workspaceId => set({ workspaceId }),
	setProviders: providers => set({ providers }),
	reset: () => set(initialState),
}))
