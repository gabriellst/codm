// packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useGetOnboarding } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Card, CardContent, CardFooter } from '@codm/app-ui/card'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'
import { greetingKey } from '@/components/console/time'
import type { FileRouteTypes } from '@/routeTree.gen'
import { onboardingSteps, STEP_KINDS, STEP_TAXONOMY, type StepId } from '@/routes/onboarding/-components/steps'

interface Step {
	n: number
	title: string
	description: string
	to: FileRouteTypes['to']
	stepId: StepId
	done: boolean
}

// Referência nomeada em vez de literal solto na comparação (bp-14) — `STEP_KINDS` é a mesma fonte
// única de verdade que tipa `StepKind` em `../../../onboarding/-components/steps`.
const DEFERRABLE_KIND = STEP_KINDS[2]

// The StepIds this panel can ever represent. CONTACT/AGENTS/REVIEW collapse into ONE dashboard row —
// they share a SINGLE satisfaction signal (`threadDone`; the three steps together produce one
// thread), so three checkmarks flipping in lockstep would just be noise. `REVIEW` stands in as the
// representative id for that row's `DEFERRABLE` gate.
const DEFERRABLE_SETUP_IDS = onboardingSteps([]).filter(id => STEP_TAXONOMY[id].kind === DEFERRABLE_KIND)

/**
 * Setup checklist (dashboard) — spec Decision 15 / AC-13. No longer a second onboarding story: it
 * surfaces exactly the `DEFERRABLE` setup steps (the SAME `STEP_TAXONOMY` `/onboarding` dispatches
 * by), fed by the SAME read the wizard uses (`useGetOnboarding`) — the component owns that read
 * itself now, rather than receiving it as a prop.
 *
 * SATISFIED STEPS STAY, MARKED DONE (founder request 2026-08-25 — REVERSES the original Decision 15
 * reading "a satisfied step disappears from the list entirely"): seeing "2 · 3" with no "1" read as
 * a gap, not as progress. The row now keeps its number and title and swaps the CTA for the design's
 * `Marcador — Concluído` (`configuracao-inicial-wrapper.json`, screen 05: a 24px `$primary` circle
 * with a check — the same filled badge the attach wizard's selected rows use). Only the panel as a
 * whole disappears, once NOTHING is left to defer — the "badge nos Ajustes" of the Setup Assistant
 * metaphor still holds at the panel level.
 */
export function SetupChecklist({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useGetOnboarding()

	if (isLoading || !data) {
		return (
			<div className={cn('mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 pt-24', className)} {...props}>
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-64 w-full rounded-2xl" />
			</div>
		)
	}

	const candidates: Step[] = [
		{
			n: 1,
			title: t('home.setupChannelTitle'),
			description: t('home.setupChannelDesc'),
			to: '/channels',
			stepId: 'CHANNEL',
			done: data.channelDone,
		},
		{
			n: 2,
			title: t('home.setupWorkspaceTitle'),
			description: t('home.setupWorkspaceDesc'),
			to: '/workspaces',
			stepId: 'WORKSPACE',
			done: data.workspaceDone,
		},
		{
			n: 3,
			title: t('home.setupThreadTitle'),
			description: t('home.setupThreadDesc'),
			to: '/attach',
			stepId: 'REVIEW',
			done: data.threadDone,
		},
	]
	const steps = candidates.filter(step => DEFERRABLE_SETUP_IDS.includes(step.stepId))

	if (steps.every(step => step.done)) return null

	return (
		<div className={cn('mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-6 pb-16 pt-24 text-center', className)} {...props}>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-muted-foreground">{t(greetingKey())}</p>
				<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('home.welcome')}</h1>
				<p className="text-muted-foreground">{t('home.welcomeSubtitle')}</p>
			</div>

			<Card className="w-full text-left bg-transparent">
				<CardContent className="flex flex-col gap-1 p-2">
					{steps.map(step => (
						<div key={step.stepId} data-slot="setup-step" data-done={step.done} className="flex items-center gap-4 rounded-2xl p-3">
							<span
								className={cn(
									'flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold',
									step.done ? 'text-muted-foreground' : 'text-foreground',
								)}
							>
								{step.n}
							</span>
							<div className="flex flex-1 flex-col">
								<span className={cn('text-sm font-semibold', step.done ? 'text-muted-foreground' : 'text-foreground')}>{step.title}</span>
								<span className="text-xs text-muted-foreground">{step.description}</span>
							</div>
							{step.done ? (
								// `Marcador — Concluído` (design screen 05): 24px `$primary` circle + check, in the CTA's
								// slot — a done step has nothing left to configure.
								<span
									role="img"
									aria-label={t('home.setupDone')}
									className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
								>
									<IconCheck className="size-3.5" />
								</span>
							) : (
								// `nativeButton={false}`: this renders an <a>, not a <button>. Base UI errors otherwise —
								// it assumes native button semantics unless told the render target is something else.
								<Button size="sm" nativeButton={false} render={<Link to={step.to} />}>
									{t('home.setupCta')}
								</Button>
							)}
						</div>
					))}
				</CardContent>
				<CardFooter className="justify-end border-t border-border pt-4 text-sm">
					<Link to="/onboarding" className="font-medium text-foreground underline-offset-4 hover:underline">
						{t('home.replayIntro')}
					</Link>
				</CardFooter>
			</Card>
		</div>
	)
}
