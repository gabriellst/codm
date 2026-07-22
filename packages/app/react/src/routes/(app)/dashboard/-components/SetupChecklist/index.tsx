import { IconCheck } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { GetSetupChecklistQueryResponse } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { greeting } from '@/components/console/time'
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
export function SetupChecklist({ checklist }: { checklist: GetSetupChecklistQueryResponse }) {
	const steps: Step[] = [
		{ n: 1, title: 'Connect a channel', description: 'WhatsApp, Instagram or Telegram', to: '/channels', done: checklist.channelDone },
		{
			n: 2,
			title: 'Add a workspace',
			description: 'Point at a project folder on this Mac',
			to: '/workspaces',
			done: checklist.workspaceDone,
		},
		{ n: 3, title: 'Attach your first thread', description: 'Contact + folder + agent', to: '/attach', done: checklist.threadDone },
	]

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-6 pb-16 pt-24 text-center">
			<div className="flex flex-col gap-3">
				<p className="text-sm text-muted-foreground">{greeting()}</p>
				<h1 className="heading-display text-4xl text-foreground md:text-5xl">Welcome to CodeDM</h1>
				<p className="text-muted-foreground">Three quick steps and your contacts can put coding agents to work on this Mac.</p>
			</div>

			<Card className="w-full text-left">
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
							<Button size="sm" variant={step.done ? 'outline' : 'default'} render={<Link to={step.to} />}>
								{String(step.done ? 'Done' : 'Set up')}
							</Button>
						</div>
					))}
				</CardContent>
				<CardFooter className="justify-end gap-4 border-t border-border pt-4 text-sm">
					<Link to="/onboarding" className="font-medium text-foreground underline-offset-4 hover:underline">
						Replay intro
					</Link>
					<span className="font-medium text-muted-foreground">Explore with demo data</span>
				</CardFooter>
			</Card>
		</div>
	)
}
