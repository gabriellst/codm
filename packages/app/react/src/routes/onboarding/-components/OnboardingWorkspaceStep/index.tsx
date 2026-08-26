// packages/app/react/src/routes/onboarding/-components/OnboardingWorkspaceStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useStore } from '@tanstack/react-form'
import { IconCheck, IconFolder, IconPlus } from '@tabler/icons-react'
import { addWorkspaceMutationRequestSchema, useGetAttachThreadWizard, useSaveOnboardingStep } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Field, FieldError, FieldLabel } from '@codm/app-ui/field'
import { Input } from '@codm/app-ui/input'
import { useFilePicker } from '@/services'
import { dashedRow } from '@codm/app-ui/surfaces'
import { cn } from '@/lib/utils'
import { useErrorHandler } from '@/lib/errors'
import { StepHeading } from '@/routes/(app)/attach/-components/StepHeading'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/** Same one-liner `WorkspacesSection` keeps private — duplicated, not imported: that screen backs a
 *  FROZEN fidelity target (`projetos-*`, `ITEM_PASS`) and the audit rule for a congelada file is
 *  "nem story, nem estilo" — not even an unrelated export change. */
function folderName(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? path
}

/**
 * Adapter for the onboarding WORKSPACE step — REWRITTEN for the 2026-08-24 onboarding-attach-ux
 * audit (item 1), then REFINED by a founder follow-up the same day. This step has NO fidelity
 * target (founder: "os steps de attach dentro do onboarding não estão no design") — everything
 * below is presentation built for THIS context only. It never touches `/attach`'s own
 * `WorkspaceStep` (select-from-a-list rows) or `/workspaces`' `AddWorkspaceForm`/`WorkspacesSection`
 * (both congeladas, `ITEM_PASS`).
 *
 * ### Picker-first — investigated, and the browser stays honestly incapable
 * The founder asked whether `BrowserFilePickerService` could open the File System Access API's
 * `showDirectoryPicker()` instead of reporting no picker. Investigated: that API resolves a
 * `FileSystemDirectoryHandle`, never an absolute filesystem path — a browser security invariant
 * (a web page is never handed a real OS path), not a missed capability. `AddWorkspace` POSTs a
 * `path` the daemon `stat()`s server-side; a handle has nothing to hand it. This is exactly what
 * `BrowserFilePickerService`'s own docblock already documented before this audit ("Browsers cannot
 * hand a filesystem PATH to a web page... Honest degradation"), so it stays UNCHANGED — the port
 * itself is correct, and PICKING remains genuinely native-first: `handleAddClick` always calls
 * `filePicker.pickFolder()` through the port FIRST when `canPickFolder` is true (Tauri desktop);
 * the manual path input only ever appears when the port itself reports incapable (`e2e` runs
 * Chromium-only, so it is the fallback path there too — `90-demo-onboarding.spec.ts` still drives
 * it honestly).
 *
 * ### Shape — a ROW to add, a CARD once picked
 * The add affordance is a full-width dashed ROW (`dashedRow`, `components/ui/surfaces`, canon 30 —
 * shares the same dashed-shell visual language as `dashedTile`, just laid out horizontally): a "+"
 * icon on the left, `workspaces.addFolderRow` ("Adicionar uma pasta") to its right — sitting BELOW
 * the tile grid, always visible so the operator can add another folder even after one is already
 * picked. Once a folder is chosen — by the native picker (instant) or by the fallback input
 * (`onBlur`, once the typed path validates) — it renders as a CARD in the SAME grid shape as an
 * already-registered workspace (icon + name + check), never staying as a lingering text box.
 * Clicking that pending card re-invokes `handleAddClick` (same as the row) to replace the pick.
 *
 * The single `path` field lives in a TanStack `useForm()` (rail B — every data `Input` under
 * `-components/` lives inside `form.Field`), validated against the SAME
 * `addWorkspaceMutationRequestSchema` the controller enforces, exactly like `AddWorkspaceForm`. The
 * native picker result is written the same way a keystroke would be — `form.setFieldValue('path', …)`
 * — so both entry points share one source of truth and one validation path.
 *
 * PICK ≠ ADD (2026-08-24 audit item 2, "Próximo confirma"). Picking a folder — native dialog OR the
 * fallback input — only records a LOCAL pending choice; nothing POSTs anywhere yet. `confirmStep`,
 * registered on `useOnboardingSetupStore` for `OnboardingFlow`'s footer to call on "Próximo", is what
 * actually PATCHes the pick into the server draft — once, in the SAME chain that then advances the
 * step. `confirmStep` stays UNDEFINED whenever the field is empty, so a user who never picks anything
 * (WORKSPACE is DEFERRABLE/BLOCKING, not REQUIRED — `../steps.ts`) gets a plain synchronous "Próximo"
 * straight through, same as before this audit.
 *
 * ### 2026-08-26 — draft/atomic-commit rewrite: PATCH the rascunho, never `AddWorkspace` directly
 * This step used to call `useAddWorkspace` the instant "Próximo" confirmed a typed/picked path — the
 * new `Workspace` aggregate existed before the operator ever finished the wizard, and a reboot before
 * REVIEW/AGENTS/CONTACT were filled lost THOSE selections anyway (they lived only in memory). Now
 * EVERY selection here is a `PATCH /ui/onboarding/step` into `Onboarding.state.workspace` — a group
 * the backend accepts as `{ path }` (a new folder, not yet a real `Workspace`) OR
 * `{ existingWorkspaceId }` (a pick from the tile grid below) — and only `CompleteOnboarding`
 * materializes whichever one won, atomically with contact/providers, at "Concluir" time:
 *   - `selectExisting` (an existing tile clicked) PATCHes `{ existingWorkspaceId }` IMMEDIATELY, same
 *     immediacy as `OnboardingContactStep`/`OnboardingAgentsStep`'s row clicks — nothing left to
 *     "confirm" for an already-registered workspace.
 *   - A typed/picked NEW path goes through `confirmStep` — PATCHed as `{ path }` only when "Próximo"
 *     fires, mirroring the OLD `AddWorkspace` timing (the operator can still pick, cancel, re-pick
 *     freely before advancing).
 * `workspaceId`/`workspacePath` on the store are MUTUALLY EXCLUSIVE (mirrors the backend's `path` OR
 * `existingWorkspaceId` refine) — every path that sets one explicitly clears the other, both locally
 * and in the PATCH `workspace` group itself (the backend merges `state` RASO per group: sending
 * `{ path }` replaces the whole group, dropping a previous `existingWorkspaceId` for free).
 *
 * A picked-but-not-yet-confirmed NEW path is intentionally NOT preserved if the operator goes
 * "Voltar" without confirming (the form instance itself is remounted, same as every other step's
 * local state, on the `key={stepId}` swap `OnboardingFlow` does on every navigation) — nothing was
 * PATCHed yet, so there is nothing to lose. A genuinely CONFIRMED pick (`workspacePath`) or an
 * existing SELECTION (`workspaceId`) survives back-and-forth via the cross-mount store, and survives
 * a full reboot via `OnboardingFlow`'s resume-hydration effect (seeded from `GetOnboarding().state`).
 */
export function OnboardingWorkspaceStep({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const workspaceId = useOnboardingSetupStore(state => state.workspaceId)
	const workspacePath = useOnboardingSetupStore(state => state.workspacePath)
	const setWorkspaceId = useOnboardingSetupStore(state => state.setWorkspaceId)
	const setWorkspacePath = useOnboardingSetupStore(state => state.setWorkspacePath)
	const setWorkspaceHasSelection = useOnboardingSetupStore(state => state.setWorkspaceHasSelection)
	const setConfirmStep = useOnboardingSetupStore(state => state.setConfirmStep)
	const setStepError = useOnboardingSetupStore(state => state.setStepError)
	const { extractErrorCode, getErrorTranslation } = useErrorHandler()
	const { data } = useGetAttachThreadWizard()
	// `meta: { suppressToast: true }` — item 6 of the 2026-08-24 audit: `router.tsx`'s `MutationCache`
	// skips the global toast for this mutation. No local `onError`/try-catch (component bp-22 —
	// mutation error state comes from the hook's OWN `isError`/`error`, the same canon `isPending`
	// already follows): the effect below just MIRRORS `saveOnboardingStep.error` into `stepError`,
	// which `OnboardingFlow`'s footer renders next to "Próximo" instead.
	const saveOnboardingStep = useSaveOnboardingStep({ mutation: { meta: { suppressToast: true } } })
	const workspaces = data?.workspaces ?? []

	const filePicker = useFilePicker()
	const [canPickFolder, setCanPickFolder] = useState(false)
	useEffect(() => {
		let cancelled = false
		filePicker.supportsFolderPicker().then(supported => {
			if (!cancelled) setCanPickFolder(supported)
		})
		return () => {
			cancelled = true
		}
	}, [filePicker])

	// The SAME schema the controller validates — `AddWorkspaceForm`'s exact pattern, so a native pick
	// and a typed path share one source of truth and one validation path. Resume: seeds from a
	// CONFIRMED draft path (`workspacePath`) — never from `workspaceId` (an existing selection has no
	// typed path to show here at all).
	const form = useForm({
		defaultValues: { path: workspaceId ? '' : (workspacePath ?? '') },
		validators: { onChange: addWorkspaceMutationRequestSchema },
	})
	const pendingPath = useStore(form.store, s => s.values.path)
	const pendingValid = pendingPath.trim().length > 0 && addWorkspaceMutationRequestSchema.safeParse({ path: pendingPath.trim() }).success
	const [showManualInput, setShowManualInput] = useState(false)

	// Picker-first: the OS dialog opens BEFORE any input ever renders whenever the port reports
	// capable. Also the pending CARD's own `onClick` (a chosen folder can be replaced by picking
	// again, same gesture as adding the first one).
	const handleAddClick = async () => {
		if (!canPickFolder) {
			setShowManualInput(true)
			return
		}
		const picked = await filePicker.pickFolder({ title: t('workspaces.addTitle') })
		if (!picked) return
		setWorkspaceId(undefined)
		setShowManualInput(false)
		form.setFieldValue('path', picked)
	}

	// An EXISTING workspace, PATCHed the instant it's clicked (same immediacy as CONTACT/AGENTS) —
	// nothing left to "confirm" for a workspace that already exists.
	const selectExisting = (id: string) => {
		form.setFieldValue('path', '')
		setShowManualInput(false)
		setWorkspaceId(id)
		setWorkspacePath(undefined)
		saveOnboardingStep.mutate({ data: { state: { workspace: { existingWorkspaceId: id } } } })
	}

	// Registers/clears the footer's pending action — see the store's docblock for why `undefined`
	// (nothing typed/picked yet) has to keep "Próximo" fully synchronous.
	useEffect(() => {
		if (!pendingPath.trim()) {
			setConfirmStep(undefined)
			return
		}
		setConfirmStep(async () => {
			const result = addWorkspaceMutationRequestSchema.safeParse({ path: pendingPath.trim() })
			if (!result.success) {
				// Local validation failure — already surfaced by the form's own live `FieldError` above,
				// so no `stepError` here (item 6 draws that line at "reached the network and failed").
				setShowManualInput(true)
				throw new Error('INVALID_WORKSPACE_PATH')
			}
			// No try/catch (bp-22) — a rejection here propagates to `OnboardingFlow`'s `handleNext`,
			// which is exactly what keeps "Próximo" from advancing; `saveOnboardingStep.error` itself is
			// what feeds `stepError` (below). Materialization happens later, atomically, in
			// `CompleteOnboarding` — this call only persists the RASCUNHO.
			await saveOnboardingStep.mutateAsync({ data: { state: { workspace: { path: result.data.path } } } })
			setWorkspaceId(undefined)
			setWorkspacePath(result.data.path)
		})
		return () => setConfirmStep(undefined)
	}, [pendingPath, saveOnboardingStep, setConfirmStep, setWorkspaceId, setWorkspacePath])

	// Mirrors the mutation's OWN error state into the shared `stepError` (item 6) — the same canon
	// `isPending` already follows for loading, applied to `isError`/`error`. Cleared on unmount (the
	// step remounts fresh on every navigation) so a stale message never bleeds into a different step.
	useEffect(() => {
		setStepError(saveOnboardingStep.error ? getErrorTranslation(extractErrorCode(saveOnboardingStep.error)) : undefined)
		return () => setStepError(undefined)
	}, [saveOnboardingStep.error, setStepError, extractErrorCode, getErrorTranslation])

	const showPendingCard = pendingValid && !showManualInput
	// Any folder chosen — pending (picked, not yet confirmed) OR already SELECTED (an existing
	// workspace clicked, or the one `confirmStep` just created and selected) — counts as "a folder is
	// chosen" for the single-folder onboarding flow. `showPendingCard` alone missed the other two:
	// once "Próximo" confirms, `pendingPath` clears (so `showPendingCard` goes false) but `workspaceId`
	// stays set to the newly created workspace; `selectExisting` does the same. Founder live-test,
	// 2026-08-25 follow-up to item 2 — the row kept reappearing right after a folder was added.
	const hasSelection = showPendingCard || !!workspaceId

	// Raises `hasSelection` to the cross-mount store (2026-08-26 fix) — `OnboardingFlow`'s footer
	// gates "Próximo" on it (`CAN_CONTINUE.WORKSPACE`) and has no prop-based channel into this step
	// (`STEP_COMPONENTS` dispatches by a static `Record<StepId, ReactNode>`), same shape as
	// `confirmStep`/`stepError` just above. Cleared on unmount so a stale `true` never survives past
	// a fresh remount that hasn't recomputed `hasSelection` yet.
	useEffect(() => {
		setWorkspaceHasSelection(hasSelection)
		return () => setWorkspaceHasSelection(false)
	}, [hasSelection, setWorkspaceHasSelection])

	return (
		<div className={cn('flex flex-col gap-4', className)} {...props}>
			<StepHeading title={t('attach.stepWorkspaceTitle')} subtitle={t('attach.stepWorkspaceSubtitle')} />

			{(workspaces.length > 0 || showPendingCard) && (
				<div className="grid grid-cols-2 gap-3">
					{workspaces.map(workspace => {
						const selected = !pendingValid && workspace.workspaceId === workspaceId
						return (
							<Button
								key={workspace.workspaceId}
								type="button"
								variant="ghost"
								size="none"
								onClick={() => selectExisting(workspace.workspaceId)}
								className={cn(
									'relative flex flex-col items-center justify-center gap-3.5 rounded-asymmetric-lg border border-input bg-background p-10 text-center transition-colors hover:bg-muted/60',
									selected && 'border-primary bg-hover-accent',
								)}
							>
								<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-sm bg-secondary text-secondary-foreground">
									<IconFolder className="size-5" />
								</span>
								<span className="w-full truncate text-sm font-bold text-foreground" title={workspace.path}>
									{folderName(workspace.path)}
								</span>
								{selected && (
									<span className="absolute top-2 right-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
										<IconCheck className="size-3.5" />
									</span>
								)}
							</Button>
						)
					})}

					{/* The chosen-but-not-yet-added pick — picker OR fallback, once it VALIDATES — renders as
					    a CARD in the exact same shape as an already-registered workspace, not a lingering
					    text box. Click = pick again (replace), same gesture as the add row below. */}
					{showPendingCard && (
						<Button
							type="button"
							variant="ghost"
							size="none"
							onClick={handleAddClick}
							className="relative flex flex-col items-center justify-center gap-3.5 rounded-asymmetric-lg border border-primary bg-hover-accent p-10 text-center"
						>
							<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-sm bg-secondary text-secondary-foreground">
								<IconFolder className="size-5" />
							</span>
							<span className="w-full truncate font-mono text-xs text-foreground" title={pendingPath}>
								{folderName(pendingPath)}
							</span>
							<span className="absolute top-2 right-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
								<IconCheck className="size-3.5" />
							</span>
						</Button>
					)}
				</div>
			)}

			{/* The add ROW (founder refinement, 2026-08-24) — "+" left, label right, dashed shell shared
			    with `dashedTile` (canon 30). Picker-first: opens the native dialog immediately when the
			    port is capable; only reveals the manual input when it genuinely is not.
			    HIDDEN whenever ANY folder is chosen (`hasSelection` — founder live-test, 2026-08-25,
			    item 2 follow-up): onboarding is a single-folder flow, so the row offering to add ANOTHER
			    one has no business showing once one is picked, confirmed, OR selected from the existing
			    list. There is no dedicated "clear" affordance today — the row comes back the moment
			    `hasSelection` goes false, which only happens by clicking a DIFFERENT existing tile
			    (`selectExisting` reassigns `workspaceId`, never clears it to nothing) or by a fresh
			    remount (Voltar away and back) with nothing selected yet. */}
			{!hasSelection && (
				<Button type="button" variant="ghost" size="none" onClick={handleAddClick} className={cn(dashedRow, 'justify-start')}>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-asymmetric-sm bg-muted text-muted-foreground">
						<IconPlus className="size-4.5" />
					</span>
					<span className="text-sm font-bold text-foreground">{t('workspaces.addFolderRow')}</span>
				</Button>
			)}

			{/* Fallback honesto (nenhum picker capaz de path — browser): revela o MESMO input de path
			    manual que `AddWorkspaceForm` usa, em vez de fingir um picker que o host não tem. Colapsa
			    de volta pro CARD no blur, quando o valor já validou. */}
			{showManualInput && (
				<form.Field name="path">
					{field => (
						<Field>
							<FieldLabel htmlFor={field.name}>{t('workspaces.projectFolder')}</FieldLabel>
							<Input
								id={field.name}
								className="font-mono"
								placeholder={t('workspaces.pathPlaceholder')}
								value={field.state.value}
								onChange={e => field.handleChange(e.target.value)}
								onBlur={() => {
									field.handleBlur()
									if (addWorkspaceMutationRequestSchema.safeParse({ path: field.state.value.trim() }).success) {
										setShowManualInput(false)
									}
								}}
								autoFocus
							/>
							{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
						</Field>
					)}
				</form.Field>
			)}
		</div>
	)
}
