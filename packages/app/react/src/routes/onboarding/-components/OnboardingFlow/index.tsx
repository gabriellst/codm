import { useState } from 'react'
import { IconArrowRight } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { CHANNEL_KINDS, channelGlyph, providerGlyph } from '@/components/console/glyphs'
import type { ProviderKind } from '@codedm/client-typescript/typescript'

const PROVIDER_KINDS: ProviderKind[] = ['CLAUDE_CODE', 'CODEX', 'OPENCODE']

const STEPS = [
	{ n: 1, title: 'Connect a channel', description: 'Pair WhatsApp, Instagram or Telegram via QR code' },
	{ n: 2, title: 'Add a workspace', description: 'Point at a project folder — Claude projects are detected' },
	{ n: 3, title: 'Attach a thread', description: 'Bind a contact or group to a folder and pick the agents' },
]

/** First-run intro (T01): value prop, how it works, and the control plane — 3 slides. */
export function OnboardingFlow() {
	const navigate = useNavigate()
	const [slide, setSlide] = useState(0)
	const done = () => navigate({ to: '/dashboard' })

	return (
		<div className="flex min-h-dvh flex-col bg-route-background text-foreground">
			<header className="flex items-center justify-between px-6 py-6 md:px-10">
				<Logo />
				<Link to="/dashboard" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
					Skip
				</Link>
			</header>

			<main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
				<div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
					{slide === 0 && <ValueSlide />}
					{slide === 1 && <HowItWorksSlide />}
					{slide === 2 && <ControlSlide />}

					<div className="flex items-center gap-2">
						{[0, 1, 2].map(i => (
							<span key={i} className={cn('size-2 rounded-full transition-colors', i === slide ? 'bg-primary' : 'bg-border')} />
						))}
					</div>

					<div className="flex items-center gap-3">
						{slide > 0 && (
							<Button variant="outline" onClick={() => setSlide(s => s - 1)}>
								Back
							</Button>
						)}
						{slide < 2 ? (
							<Button onClick={() => setSlide(s => s + 1)}>
								Next <IconArrowRight data-icon="inline-end" />
							</Button>
						) : (
							<Button onClick={done}>
								Get started <IconArrowRight data-icon="inline-end" />
							</Button>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}

function ValueSlide() {
	return (
		<div className="flex flex-col items-center gap-6">
			<div className="flex items-center gap-3">
				{CHANNEL_KINDS.map(kind => {
					const Glyph = channelGlyph[kind]
					return (
						<span key={kind} className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
							<Glyph className="size-5" />
						</span>
					)
				})}
				<IconArrowRight className="size-6 text-foreground" />
				{PROVIDER_KINDS.map(kind => {
					const Glyph = providerGlyph[kind]
					return (
						<span key={kind} className="flex size-12 items-center justify-center rounded-full border border-border text-foreground">
							<Glyph className="size-5" />
						</span>
					)
				})}
			</div>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">DM your codebase</h1>
			<p className="text-muted-foreground">
				CodeDM connects WhatsApp, Instagram and Telegram to coding agents running on this Mac — DM your codebase like it's any DM platform.
				Open source, no account, everything stays local.
			</p>
		</div>
	)
}

function HowItWorksSlide() {
	return (
		<div className="flex w-full flex-col items-center gap-6">
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">How it works</h1>
			<div className="flex w-full flex-col gap-5 text-left">
				{STEPS.map(step => (
					<div key={step.n} className="flex items-start gap-4">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
							{step.n}
						</span>
						<div className="flex flex-col">
							<span className="font-semibold text-foreground">{step.title}</span>
							<span className="text-sm text-muted-foreground">{step.description}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

function ControlSlide() {
	return (
		<div className="flex flex-col items-center gap-6">
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">You stay in control</h1>
			<p className="text-muted-foreground">
				Agents pause on server errors, blocked replies, or when someone asks for a human. You review, steer with a whisper, or take over —
				nothing ships without your say.
			</p>
		</div>
	)
}
