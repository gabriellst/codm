import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCheck } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { greetingKey } from '@/components/console/time'
import type { FileRouteTypes } from '@/routeTree.gen'

interface Step {
	n: number
	title: string
	description: string
	to: FileRouteTypes['to']
	done: boolean
}

/**
 * First-run Home (T02): the empty state that turns three cold-start chores into a
 * guided checklist. Each row deep-links to the screen that completes it and flips to
 * a check once the corresponding read reports it done.
 */
export function SetupChecklist({ checklist, className, ...props }: ComponentProps<'div'> & { checklist: GetOnboardingQueryResponse }) {
	const { t } = useTranslation()
	const steps: Step[] = [
		{ n: 1, title: t('home.setupChannelTitle'), description: t('home.setupChannelDesc'), to: '/channels', done: checklist.channelDone },
		{
			n: 2,
			title: t('home.setupWorkspaceTitle'),
			description: t('home.setupWorkspaceDesc'),
			to: '/workspaces',
			done: checklist.workspaceDone,
		},
		{ n: 3, title: t('home.setupThreadTitle'), description: t('home.setupThreadDesc'), to: '/attach', done: checklist.threadDone },
	]

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
						<div key={step.n} className="flex items-center gap-4 rounded-2xl p-3">
							<span
								className={cn(
									'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
									step.done ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-foreground',
								)}
							>
								{step.done ? <IconCheck className="size-4" /> : step.n}
							</span>
							<div className="flex flex-1 flex-col">
								<span className="text-sm font-semibold text-foreground">{step.title}</span>
								<span className="text-xs text-muted-foreground">{step.description}</span>
							</div>
							{/* `nativeButton={false}`: this renders an <a>, not a <button>. Base UI errors otherwise —
							    it assumes native button semantics unless told the render target is something else. */}
							<Button size="sm" nativeButton={false} variant={step.done ? 'outline' : 'default'} render={<Link to={step.to} />}>
								{step.done ? t('home.setupDone') : t('home.setupCta')}
							</Button>
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
