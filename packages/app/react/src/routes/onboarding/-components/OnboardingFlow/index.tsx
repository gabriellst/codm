import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { getOnboardingQueryKey, useCompleteOnboarding, useGetOnboarding, useSaveOnboardingStep } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Spinner } from '@codm/app-ui/spinner'
import { cn } from '@/lib/utils'
import { useErrorHandler } from '@/lib/errors'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
// GLOBAL store (module-level `required` latch `OnboardingGate` reads) — aliased because this file
// ALSO imports the route-LOCAL `useOnboardingStore` below (currentSlide/direction), a same-named
// but unrelated store. See the `completeOnboarding.onSuccess` comment for why this one is needed
// here.
import { useOnboardingStore as useOnboardingRequiredStore } from '@/stores/useOnboardingStore'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { canComplete, firstUnvanquishedStep, INFORMATIVE_KIND, isContentStep, onboardingSteps, type StepId, STEP_TAXONOMY } from '../steps'
import { STEP_COMPONENTS } from '../step-components'

// D3 (screens NN8IL/FPKgO/tBcCA) — the three intro slides sit over a pair of soft blurred
// blobs ($secondary, radial); the permission/final/login screens the same group ships are flat
// white. Scoped to INFO_STEPS_WITH_BLOB rather than "every step" so FULL_DISK_ACCESS/FINAL don't
// inherit decoration the design never draws for them (R28 — decor blobs are sanctioned, but only
// where measured).
const INFO_STEPS_WITH_BLOB: readonly StepId[] = ['VALUE', 'HOW', 'CONTROL']

interface DecorBlob {
	top: number
	left: number
	width: number
	height: number
	opacity: number
	/** px de blur — 1:1 com o `effect.radius` do spec. */
	blur: number
}

/** O fill radial de 3 stops do spec, literal (canon "Fonte de estilo" item 1: todo valor de estilo
 *  vem do spec — `$secondary` opaco no centro → a MESMA cor a 69% alpha (0xB0) em 45% → transparente
 *  em 100%; `color-mix` reproduz o stop intermediário sem duplicar o hex do token). `in srgb`, não
 *  `oklab`: o stop do spec (`#EAF6D3B0`) é um alpha-blend literal em hex/sRGB — `oklab` interpola
 *  perceptualmente e mede consistentemente MAIS saturado que o alvo nesse trecho (medido: tiles
 *  residuais em toda a região da mancha, ~5-15/canal acima do alvo). */
const BLOB_GRADIENT =
	'radial-gradient(circle, var(--secondary) 0%, color-mix(in srgb, var(--secondary) 69%, transparent) 45%, transparent 100%)'

/**
 * F3 B2 — cada slide tem SEU PRÓPRIO par de manchas, em cantos DIFERENTES (spec "Névoa decorativa",
 * design/system/pen/screens/onboarding-{1,2,3}-*.json): posição (x/y — top-left dentro da janela
 * 1440×900), tamanho, opacidade e blur variam por slide; o CONTROL especificamente usa os cantos
 * opostos (superior-esquerda + inferior-DIREITA) dos outros dois (superior-direita +
 * inferior-esquerda). O código antes desenhava o MESMO par fixo para os três — o alvo de CONTROL
 * ficava quase branco no canto inferior-esquerdo (pixel amostrado: (254,255,254)) enquanto o app
 * sempre pintava um blob ali, e o canto inferior-direito do alvo (onde a mancha real de CONTROL
 * mora) ficava sem nada — a maior fonte de tiles falhos das 5 telas (210/210 na medição pré-fix).
 *
 * Fill: `BLOB_GRADIENT` acima (não solid-color+blur) — MEDIDO: a primeira passagem usava um círculo
 * `bg-secondary` sólido + `blur()`, geometricamente exata mas com mais "massa" de cor do que o
 * gradiente real (que já esmaece a partir dos 45%), e piorou a régua nas 3 telas (111→172 tiles em
 * VALUE) mesmo com posição/tamanho corretos — a equivalência errada, não a geometria. O gradiente
 * real + o MESMO `blur()` do spec (130/110) resolve.
 */
const STEP_BLOBS: Partial<Record<StepId, readonly [DecorBlob, DecorBlob]>> = {
	VALUE: [
		{ top: -300, left: 1000, width: 820, height: 760, opacity: 0.6, blur: 130 }, // superior-direita
		{ top: 400, left: -420, width: 1240, height: 1040, opacity: 0.95, blur: 110 }, // inferior-esquerda
	],
	HOW: [
		{ top: 560, left: -360, width: 900, height: 820, opacity: 0.55, blur: 130 }, // inferior-esquerda
		{ top: -380, left: 820, width: 1180, height: 1000, opacity: 0.95, blur: 110 }, // superior-direita
	],
	CONTROL: [
		{ top: 520, left: 900, width: 960, height: 860, opacity: 0.6, blur: 130 }, // inferior-direita
		{ top: -420, left: -460, width: 1220, height: 1020, opacity: 0.95, blur: 110 }, // superior-esquerda
	],
}

/** Largura da coluna de conteúdo por passo — spec "Coluna Central"/"Bloco A" por tela
 *  (design/system/pen/screens/*.json). Não é um token reutilizável (o .pen não declara escala de
 *  largura de container), então em princípio seria px fixo citado por tela — MEDIDO (não só
 *  deduzido do spec): aplicar os 560px literais de VALUE/HOW/CONTROL PIOROU a régua (111→173/99→152
 *  tiles) porque o corpo de texto passou a quebrar em 3 linhas em vez das 4 do alvo — a métrica de
 *  fonte do browser não é a do Pencil, então o número de linhas (o que realmente decide o layout
 *  vertical abaixo) depende da largura EFETIVA do wrap, não da largura nominal do spec; o
 *  `max-w-xl` (504px) que já estava aqui reproduz o wrap de 4 linhas do alvo por coincidência de
 *  fonte, então FICA — mudá-lo é regressão, não fidelidade (falseado com `bun fidelity`, revertido
 *  no mesmo diff). `FULL_DISK_ACCESS` é diferente: mediu MELHOR a 720px (71→38 tiles) porque seu
 *  corpo já quebra igual nas duas larguras — só o card ficava estreito demais. Passos sem entrada
 *  aqui caem no `max-w-xl` de sempre, sem mudança de comportamento. */
const STEP_MAX_WIDTH: Partial<Record<StepId, string>> = {
	FULL_DISK_ACCESS: 'max-w-[720px]', // permissao-wrapper.json "Coluna Central" width:720 (era 504 via max-w-xl, card 216px mais estreito que o alvo) — medido: 71→38 tiles
	// 2026-08-24 onboarding-attach-ux audit (item 3) — AGENTS has no fidelity target (this whole
	// group of onboarding attach steps doesn't), so "wider" has no measured value to chase; the
	// founder asked for the next EXISTING scale step instead of a bespoke number. `max-w-xl` (the
	// shared default below) renders at 504px on this workspace's 14px root font (36rem); `max-w-2xl`
	// (42rem) is the next standard Tailwind step up, 588px — a real scale rung, not a magic value.
	AGENTS: 'max-w-2xl',
}

// D3 (FULL_DISK_ACCESS original) + 2026-08-24 onboarding-attach-ux audit (item 4) — only the three
// intro slides and the FINAL closing card want CENTERED prose/cards; every setup step
// (CHANNEL/WORKSPACE/CONTACT/AGENTS/REVIEW) and the permission screen are left-aligned lists/forms.
// The previous version only special-cased FULL_DISK_ACCESS — every OTHER non-intro step fell into
// the default `items-center text-center` branch, and because `items-center` is cross-axis
// `align-items` (not just `justify-content`), that made each step's own root DIV shrink-wrap-and-
// center instead of stretching to the column's full width. Text alignment followed the shrink:
// `ReviewStep`'s label/value spans (`flex-1`, no `w-full` of their own) rendered their single-line
// truncated text CENTERED inside whatever (narrower-than-expected) width the shrunk card ended up
// with — the "Revisão não alinhada à esquerda" the founder flagged. `items-stretch` (not
// `items-start`) is the actual fix, not merely `text-left`: it makes the step's root DIV FILL the
// column, matching how `/attach`'s `AttachThreadWizard` gets the same result via an explicit
// `w-full` on ITS column wrapper. Scoped to `OnboardingFlow` only — `AttachThreadWizard` never used
// `stepAlignment`/`text-center` in the first place, so its own (measured, frozen) `ReviewStep`
// rendering was never affected by this bug and needs no re-measurement.
const CENTERED_STEPS: readonly StepId[] = ['VALUE', 'HOW', 'CONTROL', 'FINAL']

function stepAlignment(stepId: StepId): string {
	return CENTERED_STEPS.includes(stepId) ? 'items-center text-center' : 'items-stretch text-left'
}

/**
 * O fluxo de entrada e de pendência — agora um wizard COMPOSTO pela função pura `onboardingSteps`
 * (spec Decision 4), não mais uma lista fixa de três slides com um quarto prefixado sob condição.
 * Uma `SystemPrecondition` pendente é só mais um `StepId` na lista — dispatchado por `STEP_COMPONENTS`
 * — e não um caso especial (spec Decisions 1/2).
 *
 * O `blocked`/"Pular" escondido de antes MORREU (spec Decision 13): a conclusão só é barrada por um
 * passo REQUIRED insatisfeito (`canComplete`). Cinco `StepId` reais carregam esse `kind` desde
 * 2026-08-26 (`CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW`/`FULL_DISK_ACCESS` — founder override, ver
 * `../steps.ts`), então "Concluir" agora fica desabilitado de verdade até os cinco estarem
 * satisfeitos, como CONSEQUÊNCIA da tabela `STEP_TAXONOMY` — não uma regra nova imposta aqui. Não
 * existe mais link de saída nenhum: quem sai é o botão final, que conclui o onboarding de verdade
 * (`useCompleteOnboarding`) antes de navegar.
 *
 * `CAN_CONTINUE` (mesmo canon de `AttachThreadWizard`, `attach`'s `-components/AttachThreadWizard/
 * index.tsx`) é a camada SEPARADA que gate "Próximo" passo a passo — um `Record<StepId, boolean>`
 * derivado do estado AO VIVO (stores + a leitura de onboarding), nunca um booleano fixo. Existe
 * porque o founder relatou o MESMO bug em dois lugares diferentes: "Próximo" avançava sem canal
 * conectado, sem contato/provider escolhido, sem workspace escolhido e sem revisão completa —
 * `WORKSPACE` continua DEFERRABLE (não bloqueia "Concluir"), mas ainda assim precisa de uma seleção
 * para o PRÓPRIO "Próximo" avançar, daí o mapa cobrir os dez `StepId` e não só os cinco REQUIRED.
 *
 * A POSIÇÃO DE ABERTURA (spec Decision 12 / AC-10 — sempre no primeiro passo não vencido, nunca
 * "índice 0" depois de já ter concluído) é responsabilidade DESTE componente: ele lê `useGetOnboarding()`
 * e semeia o índice via `firstUnvanquishedStep` assim que a leitura chega, em vez do `reset()`
 * incondicional para 0 que havia antes.
 */
export function OnboardingFlow({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { currentSlide, direction, setCurrentSlide, setDirection } = useOnboardingStore()
	const pendingStatuses = useSystemPreconditionsStore(state => state.pending)
	const { data: onboarding } = useGetOnboarding()
	const setStepError = useOnboardingSetupStore(state => state.setStepError)
	const { extractErrorCode, getErrorTranslation } = useErrorHandler()
	//
	// INVALIDAR ANTES DE NAVEGAR, e o `await` é a parte que importa. `/dashboard` monta dentro do
	// `OnboardingGate`, que decide pelo `completedAt` de `useGetOnboarding()`. Navegar com o cache
	// ainda velho faz o gate ler `completedAt: null` — o valor de ANTES desta mutation — e devolver
	// o operador ao `/onboarding` no mesmo instante. Foi o sintoma relatado em 09/08: "cliquei em
	// concluir duas vezes, a primeira não pegou". A segunda pegava porque o React Query já tinha
	// refeito o fetch nesse meio-tempo. Sem o `await`, invalidar não basta: a navegação corre junto
	// com o refetch e a corrida volta.
	//
	// `meta: { suppressToast: true }` — 2026-08-24 audit item 6: "Concluir" is the same
	// confirm-then-advance chain (item 2) as every other step's "Próximo"; its failure renders next to
	// the button (the `stepError` mirror effect below) instead of the global toast.
	//
	// `useOnboardingRequiredStore.getState().reset()` — 2026-08-25 founder live-test, item 3, fixing
	// the bug `90-demo-onboarding.spec.ts` documented and worked around. `OnboardingGate` used to
	// check the `required` latch BEFORE `completedAt`, and NOTHING ever reset `required` back to
	// `false` — so the transient `ONBOARDING_NOT_COMPLETED` 403 that `/dashboard`'s first render fires
	// (before ITS OWN redirect effect lands) latched `required=true` for the rest of the JS session,
	// and every subsequent client-side `navigate({ to: '/dashboard' })` — including this SPA hop —
	// bounced straight back to `/onboarding`, no matter how many times "Começar" was clicked. Reset
	// HERE, in the same success path that just earned a genuine `completedAt` server-side, is the
	// minimal correct fix at the source: the flag exists to survive a FAILED read, not to outlive the
	// exact mutation whose whole job is completing onboarding. `OnboardingGate` itself ALSO now
	// prioritizes a fresh `completedAt` over a stale `required` (belt-and-suspenders — see its own
	// docblock) so a `required` latched from a DIFFERENT stray 403 cannot reintroduce the same bounce.
	//
	// `data.threadId` (from `CompleteOnboarding`'s `{ threadId: string | null }` response) is not read
	// here anymore (2026-08-26): it used to be stashed on `useOnboardingSetupStore` for
	// `OnboardingFinalStep`'s "mention the agent" CTA, which never actually painted — this handler
	// invalidates and navigates away in the SAME tick, before that step's own round-trip could land.
	// The CTA now lives on the dashboard, driven server-side by `GetHomeDashboard.mentionCta` (see that
	// field's own docblock). `CompleteOnboarding` still returns the id — a legitimate fact about the
	// operation, already tested — nothing on the frontend consumes it anymore.
	const completeOnboarding = useCompleteOnboarding({
		mutation: {
			meta: { suppressToast: true },
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: getOnboardingQueryKey() })
				useOnboardingRequiredStore.getState().reset()
				await navigate({ to: '/dashboard' })
			},
		},
	})

	// Mirrors `completeOnboarding`'s OWN error state into `stepError` — no local `onError`/try-catch
	// (component bp-22), same as `OnboardingWorkspaceStep`/`OnboardingReviewStep`.
	useEffect(() => {
		setStepError(completeOnboarding.error ? getErrorTranslation(extractErrorCode(completeOnboarding.error)) : undefined)
	}, [completeOnboarding.error, setStepError, extractErrorCode, getErrorTranslation])

	const pending = (pendingStatuses ?? []).map(status => status.id)
	const steps = onboardingSteps(pending)

	// PATCH `{ currentStep }` — best-effort, fire-and-forget bookkeeping (`goTo`, below): a failure
	// here is inconsequential (worst case, a reboot resumes one step behind) and unrelated to whatever
	// the operator is doing NOW, so it stays out of both the global toast and `stepError`.
	const saveOnboardingStep = useSaveOnboardingStep({ mutation: { meta: { suppressToast: true } } })
	const setContactRef = useOnboardingSetupStore(state => state.setContactRef)
	const setProviders = useOnboardingSetupStore(state => state.setProviders)
	const setWorkspaceId = useOnboardingSetupStore(state => state.setWorkspaceId)
	const setWorkspacePath = useOnboardingSetupStore(state => state.setWorkspacePath)

	// Semeia UMA VEZ por entrada, assim que a leitura de onboarding chega — nunca de novo depois (o
	// `seededRef` é por instância de componente, então uma NOVA entrada em `/onboarding` sempre semeia
	// de novo, mas navegar pelos passos dentro da mesma visita não é sobrescrito). Duas coisas são
	// semeadas na MESMA passada:
	//   1. o ÍNDICE do slide, via `firstUnvanquishedStep` (Decision 12/AC-10) — inalterado.
	//   2. o RASCUNHO do servidor (`onboarding.state`) para dentro de `useOnboardingSetupStore` —
	//      2026-08-26 fix (draft/atomic-commit): sem isto, um reboot no meio do wizard reabria
	//      CONTACT/AGENTS/WORKSPACE em branco mesmo com o rascunho salvo no servidor, porque essas
	//      seleções nunca tinham para onde voltar no cliente. Cada grupo hidrata SÓ se presente — um
	//      rascunho parcial (ex.: só `providers`) não pisa em campos que o servidor não mandou.
	// `pending`/`steps` são recalculados AQUI DENTRO a partir de `pendingStatuses` (a dependência
	// reativa de verdade) — a versão de fora existe só para o render; usá-la faria o efeito depender
	// de um array novo a cada render (o `.map()` do corpo do componente) e reexecutar sempre.
	const seededRef = useRef(false)
	useEffect(() => {
		if (seededRef.current || !onboarding) return
		seededRef.current = true

		if (onboarding.state.contactRef) setContactRef(onboarding.state.contactRef)
		if (onboarding.state.providers) setProviders(onboarding.state.providers)
		if (onboarding.state.workspace?.existingWorkspaceId) setWorkspaceId(onboarding.state.workspace.existingWorkspaceId)
		else if (onboarding.state.workspace?.path) setWorkspacePath(onboarding.state.workspace.path)

		const seedPending = (pendingStatuses ?? []).map(status => status.id)
		const seedSteps = onboardingSteps(seedPending)
		const target = firstUnvanquishedStep(seedSteps, onboarding)
		const index = seedSteps.indexOf(target)
		setCurrentSlide(index === -1 ? 0 : index)
		setDirection(1)
	}, [onboarding, pendingStatuses, setCurrentSlide, setDirection, setContactRef, setProviders, setWorkspaceId, setWorkspacePath])

	const lastIndex = steps.length - 1
	// Clamp, e não só fallback: quando a pendência é resolvida no meio do fluxo a lista ENCOLHE, e o
	// índice guardado no store pode passar do fim.
	const index = Math.min(currentSlide, lastIndex)
	const stepId = steps[index] ?? steps[0]

	const goTo = (target: number) => {
		const clamped = Math.min(lastIndex, Math.max(0, target))
		setDirection(target < index ? -1 : 1)
		setCurrentSlide(clamped)
		// A new step is about to mount — any error banner belongs to the step being LEFT.
		setStepError(undefined)
		// PERSISTE `currentStep` A CADA AVANÇO (2026-08-26 fix — the console never called
		// `SaveOnboardingStep`, so `currentStep` stayed stuck at `VALUE` forever; a reboot mid-wizard
		// always reopened at the very first slide). Only forward moves, and only into a `ContentStepId`
		// the server enum actually models — a `SystemPrecondition` (`FULL_DISK_ACCESS`) isn't one
		// (`isContentStep`), and going "Voltar" doesn't rewind the server's notion of progress.
		if (clamped > index) {
			const landedStepId = steps[clamped]
			if (landedStepId && isContentStep(landedStepId)) saveOnboardingStep.mutate({ data: { currentStep: landedStepId } })
		}
	}

	// 2026-08-24 onboarding-attach-ux audit (item 2) — "Próximo" CONFIRMS then advances, one click.
	// `confirmStep` is a per-mounted-step registration on `useOnboardingSetupStore` (see that store's
	// docblock + `OnboardingWorkspaceStep`/`OnboardingReviewStep`): `undefined` when the current step
	// has nothing pending (the intro slides, CHANNEL, CONTACT/AGENTS — their row click already
	// records the selection with nothing left to submit, an already-SELECTED workspace, or an
	// incomplete REVIEW), so THAT path stays perfectly synchronous — the exact shape
	// `OnboardingFlow/index.test.tsx`'s click-through-every-step regression already exercises (no
	// `await` between clicks). Only a REAL pending action (an unadded folder pick, a
	// complete-and-unattached review) takes the async branch: loading state on the button, and a
	// rejection — a mutation failure (rendered inline via `stepError`, item 6 — no global toast for
	// these onboarding mutations anymore) or an inline path-validation error
	// (`OnboardingWorkspaceStep`'s own `FieldError`) — simply does not advance.
	const confirmStep = useOnboardingSetupStore(state => state.confirmStep)
	const stepError = useOnboardingSetupStore(state => state.stepError)
	const [isAdvancing, setIsAdvancing] = useState(false)
	const handleNext = () => {
		if (!confirmStep) {
			goTo(index + 1)
			return
		}
		setIsAdvancing(true)
		confirmStep()
			.then(() => goTo(index + 1))
			.catch(() => {
				// Swallow — the rejection already surfaced itself (mutation error → global toast, or an
				// inline `FieldError` the step renders). Staying on the step IS the error handling here.
			})
			.finally(() => setIsAdvancing(false))
	}

	// D3 (screen NN8IL) — "Pular" only ever shows on the FIRST step (nothing to go back to), and
	// only advances PAST the read-only intro slides (VALUE/HOW/CONTROL, all INFORMATIVE) into the
	// first step that actually does something — never an exit from onboarding (that "Pular" died at
	// spec Decision 13, before this front existed; see OnboardingFlow's test docblock). Presentation
	// only: it calls the SAME `goTo` every other nav control uses.
	const firstActionableIndex = steps.findIndex(id => STEP_TAXONOMY[id].kind !== INFORMATIVE_KIND)
	const skipTarget = firstActionableIndex === -1 ? lastIndex : firstActionableIndex

	// Live per-step facts `CAN_CONTINUE` reads below. `contactRef`/`providers` ARE the fact already
	// (set the instant a row is clicked, by `OnboardingContactStep`/`OnboardingAgentsStep`) — no extra
	// plumbing needed. `channelConnected`/`workspaceHasSelection` exist ON `useOnboardingSetupStore`
	// specifically because CHANNEL/WORKSPACE had no other live signal reaching this component (see
	// that store's own docblock for why each is raised the way it is).
	const contactRef = useOnboardingSetupStore(state => state.contactRef)
	const providers = useOnboardingSetupStore(state => state.providers)
	const workspaceId = useOnboardingSetupStore(state => state.workspaceId)
	const workspacePath = useOnboardingSetupStore(state => state.workspacePath)
	const workspaceHasSelection = useOnboardingSetupStore(state => state.workspaceHasSelection)
	const channelConnected = useOnboardingSetupStore(state => state.channelConnected)

	// The draft is complete enough to REVIEW/commit when all three groups are present — mirrors the
	// backend's `OnboardingCompleteDraftSchema` refine (contactRef required, workspace `path` OR
	// `existingWorkspaceId`, providers non-empty), which is never exposed on the wire (that schema is
	// server-internal, `CompleteOnboarding`-only — see its own docblock) so this is a plain boolean
	// rather than a `safeParse` against an SDK schema. `workspaceId`/`workspacePath` are mutually
	// exclusive (`useOnboardingSetupStore`'s own docblock) — either satisfies "a workspace is chosen".
	// Recomputed here, not threaded down, because `STEP_COMPONENTS` gives this component no prop
	// channel into a mounted step, and REVIEW's fields already live in this same store.
	const canFinishReview = Boolean(contactRef) && Boolean(providers?.length) && Boolean(workspaceId || workspacePath)

	// 2026-08-26 fix — the footer's "Próximo" gate, PER STEP (same canon as `AttachThreadWizard`'s own
	// `CAN_CONTINUE`, `/attach/-components/AttachThreadWizard/index.tsx`): dispatch by map, never a
	// switch/if chain (CMP-P18). Covers all ten `StepId`s, not just the five REQUIRED ones — `WORKSPACE`
	// stays DEFERRABLE (it does not block "Concluir"), but the founder's bug report was specifically
	// that "Próximo" advanced past it (and CHANNEL/CONTACT/AGENTS/FULL_DISK_ACCESS) with nothing chosen,
	// so THIS gate applies uniformly regardless of `kind`.
	//
	// `FULL_DISK_ACCESS` is always `false` while shown: the step only EXISTS in `steps` while its
	// precondition is pending (`onboardingSteps` composes from `pending`, `../steps.ts`) — being on it
	// IS being unsatisfied. There is no "confirm" gesture for it; only the host resolving the
	// permission (re-probed on window focus) removes it from `pending`, which reflows `steps` and
	// moves the wizard past it on its own.
	//
	// `FINAL` is the wizard's LAST step by construction (`onboardingSteps` always appends it) — the
	// footer swaps to "Concluir" once `index === lastIndex`, so `CAN_CONTINUE.FINAL` is never actually
	// read for gating "Próximo". Kept `true` only so this stays a `Record`, not a `Partial` — a new
	// `StepId` without an entry fails `tsc` here too, same canon as `STEP_TAXONOMY`.
	const CAN_CONTINUE: Record<StepId, boolean> = {
		VALUE: true,
		HOW: true,
		CONTROL: true,
		CHANNEL: channelConnected || Boolean(onboarding?.channelDone),
		WORKSPACE: workspaceHasSelection || Boolean(onboarding?.workspaceDone),
		CONTACT: Boolean(contactRef),
		AGENTS: Boolean(providers?.length),
		REVIEW: canFinishReview,
		FULL_DISK_ACCESS: false,
		FINAL: true,
	}
	const canContinue = CAN_CONTINUE[stepId]

	// `canComplete`'s `satisfied` list is THIS SAME map, filtered to the steps actually in play — one
	// source for "is this step's fact true", read by both gates (per-step "Próximo" above, and
	// "Concluir" here). A REQUIRED step (`STEP_TAXONOMY`) blocks completion exactly when its own
	// "Próximo" would also stay closed; `FULL_DISK_ACCESS` never makes it into `satisfied` while
	// present, which is what keeps "Concluir" honestly blocked until the host permission actually
	// resolves (see `CAN_CONTINUE`'s own docblock above).
	const completionAllowed = canComplete(
		steps.map(id => ({ id, kind: STEP_TAXONOMY[id].kind })),
		steps.filter(id => CAN_CONTINUE[id]),
	)

	return (
		// `min-h-full`, not `min-h-dvh`: sized against the box the root layout left under the AppChrome
		// title bar, never against the viewport (which no longer belongs entirely to the route). No
		// `<Logo/>` header — none of the 11 D3 screens for this group show one; the brand lockup only
		// lives in the OS title bar (`__root.tsx`) and the console rail, both outside this route's box.
		<div className={cn('relative flex min-h-full flex-col overflow-hidden bg-route-background text-foreground', className)} {...props}>
			{STEP_BLOBS[stepId] && (
				<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
					{STEP_BLOBS[stepId]?.map(blob => (
						<div
							key={`${blob.top}-${blob.left}`}
							className="absolute rounded-full"
							style={{
								top: blob.top,
								left: blob.left,
								width: blob.width,
								height: blob.height,
								opacity: blob.opacity,
								backgroundImage: BLOB_GRADIENT,
								filter: `blur(${blob.blur}px)`,
							}}
						/>
					))}
				</div>
			)}

			{/* `py-6`, symmetric — 2026-08-24 audit item 5: was `pb-28` (bottom-only), which fought
			    `justify-center` by shrinking the flex content box from the BOTTOM ONLY. The `<footer>`
			    below already reserves its own real layout space as a SIBLING of `<main>` — the extra
			    bottom padding double-counted it, so every step rendered visibly above true vertical
			    center. Symmetric `py-6` is how `/attach`'s `AttachThreadWizard` gets a genuinely
			    centered column too (`py-3` there — a smaller value because that wizard's footer sits
			    closer to its content). onboarding-1/2/3 (VALUE/HOW/CONTROL — the only ACTIVE fidelity
			    targets in this flow) shift vertically with this fix too; expected per the founder's
			    directive, re-measure. */}
			<main className="relative flex flex-1 flex-col items-center justify-center px-6 py-6">
				<div className={cn('flex w-full flex-col gap-8', STEP_MAX_WIDTH[stepId] ?? 'max-w-xl', stepAlignment(stepId))}>
					<div
						key={stepId}
						className={cn(
							'flex w-full flex-col gap-8',
							stepAlignment(stepId),
							'animate-in fade-in duration-300 ease-out',
							direction === 1 ? 'slide-in-from-right-10' : 'slide-in-from-left-10',
						)}
					>
						{STEP_COMPONENTS[stepId]}
					</div>

					{/* D3 — the progress dots are ALSO scoped to the three intro slides (neither d4bKAl nor
					    fa1hL draw them; the permission/final cards stand alone), same set as the blobs. */}
					{INFO_STEPS_WITH_BLOB.includes(stepId) && (
						<div className="flex items-center gap-2 self-center">
							{steps.map((id, i) => (
								<span
									key={id}
									className={cn('h-2 rounded-full transition-all duration-300', i === index ? 'w-6 bg-primary' : 'w-2 bg-input')}
								/>
							))}
						</div>
					)}
				</div>
			</main>

			{/* D3 — a footer bar pinned to the window edge, Voltar/Pular fixed left and the forward action
			    fixed right, not clustered under the dots like before. `flex-col` + the conditional error
			    row is new (2026-08-24 audit item 6) — a mutation failure inside onboarding (the
			    "Próximo"/"Concluir" confirm chain, item 2) renders HERE instead of the global toast. */}
			<footer className="relative flex flex-col gap-2 px-10 py-7">
				{stepError && (
					<p role="alert" className="text-sm text-destructive">
						{stepError}
					</p>
				)}
				<div className="flex items-center justify-between">
					<div>
						{index > 0 ? (
							<Button variant="outline" disabled={isAdvancing} onClick={() => goTo(index - 1)}>
								{t('onboarding.back')}
							</Button>
						) : (
							firstActionableIndex > 0 && (
								<Button variant="outline" disabled={isAdvancing} onClick={() => goTo(skipTarget)}>
									{t('onboarding.skip')}
								</Button>
							)
						)}
					</div>
					{index < lastIndex ? (
						<Button onClick={handleNext} disabled={!canContinue || isAdvancing}>
							{isAdvancing && <Spinner className="mr-2" />}
							{t('onboarding.next')} <IconArrowRight data-icon="inline-end" />
						</Button>
					) : (
						<Button onClick={() => completeOnboarding.mutate()} disabled={!completionAllowed || completeOnboarding.isPending}>
							{completeOnboarding.isPending && <Spinner className="mr-2" />}
							{t('onboarding.getStarted')} <IconArrowRight data-icon="inline-end" />
						</Button>
					)}
				</div>
			</footer>
		</div>
	)
}
