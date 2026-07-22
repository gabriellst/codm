import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { IconArrowRight, IconChevronRight, IconCheck, IconPlus, IconSearch, IconSparkles, IconX } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { MetricDelta } from '@/components/ui/metric-delta'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/styleguide/')({
	component: StyleguideRoute,
})

// ── Small local helpers (module scope so they don't remount) ─────────────────

function Logo() {
	return (
		<span className="inline-flex items-center text-xl font-bold tracking-tight text-foreground">
			Code
			<span className="ml-1 rounded-md bg-primary px-1.5 py-0.5 text-primary-foreground">DM</span>
		</span>
	)
}

function Eyebrow({ children }: { children: ReactNode }) {
	return <p className="label-eyebrow">{children}</p>
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-6 border-t border-border pt-10">
			<div className="flex flex-col gap-1">
				<h2 className="heading-display text-2xl text-foreground">{title}</h2>
				{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
			</div>
			{children}
		</section>
	)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
			<span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{label}</span>
			<div className="flex flex-wrap items-center gap-3">{children}</div>
		</div>
	)
}

function Swatch({ token, className, ring }: { token: string; className: string; ring?: boolean }) {
	return (
		<div className="flex flex-col gap-2">
			<div className={`size-16 rounded-2xl ${className} ${ring ? 'border border-border' : ''}`} />
			<span className="font-mono text-[0.6875rem] text-muted-foreground">{token}</span>
		</div>
	)
}

function Dot({ className }: { className: string }) {
	return <span className={`inline-block size-2 shrink-0 rounded-full ${className}`} />
}

// ── Route ────────────────────────────────────────────────────────────────────

function StyleguideRoute() {
	const [dark, setDark] = useState(false)

	return (
		<div className={dark ? 'dark' : undefined}>
			<div className="min-h-dvh bg-route-background text-foreground">
				<div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-12 md:px-10 md:py-16">
					{/* Masthead */}
					<header className="flex flex-col gap-6">
						<div className="flex items-center justify-between">
							<Logo />
							<label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
								<span className="font-mono text-xs">{dark ? 'dark' : 'light'}</span>
								<Switch checked={dark} onCheckedChange={setDark} />
							</label>
						</div>
						<div className="flex flex-col gap-3">
							<Eyebrow>Design system</Eyebrow>
							<h1 className="heading-display text-5xl text-foreground md:text-6xl">DM your codebase</h1>
							<p className="max-w-xl text-muted-foreground">
								Monochrome and deliberate: near-black, white and light-gray, with black as the one action color and status carried only by
								small colored dots. Pill-heavy, hairline-bordered, mono where it counts.
							</p>
						</div>
					</header>

					{/* Palette */}
					<Section title="Palette" hint="Ink, paper, and grays. Color appears only in status dots.">
						<div className="flex flex-wrap gap-5">
							<Swatch token="background" className="bg-background" ring />
							<Swatch token="foreground" className="bg-foreground" />
							<Swatch token="primary" className="bg-primary" />
							<Swatch token="secondary" className="bg-secondary" ring />
							<Swatch token="muted" className="bg-muted" ring />
							<Swatch token="accent" className="bg-accent" ring />
							<Swatch token="route-bg" className="bg-route-background" ring />
						</div>
						<div className="flex flex-col gap-3">
							<Eyebrow>Status hues — dots only</Eyebrow>
							<div className="flex flex-wrap items-center gap-6 text-sm">
								<span className="inline-flex items-center gap-2">
									<Dot className="bg-success" /> success
								</span>
								<span className="inline-flex items-center gap-2">
									<Dot className="bg-warning" /> warning
								</span>
								<span className="inline-flex items-center gap-2">
									<Dot className="bg-destructive" /> destructive
								</span>
								<span className="inline-flex items-center gap-2">
									<Dot className="bg-info" /> info
								</span>
							</div>
						</div>
					</Section>

					{/* Typography */}
					<Section title="Typography" hint="System grotesque for UI, heavy uppercase for display, mono for the machine.">
						<div className="flex flex-col gap-4">
							<span className="heading-display text-5xl text-foreground">How it works</span>
							<span className="heading-display text-2xl text-foreground">Welcome to CodeDM</span>
							<h3 className="text-2xl font-bold text-foreground">1 agent working right now</h3>
							<p className="max-w-2xl text-foreground">
								Body copy is a clean system sans at a comfortable measure. CodeDM connects your channels to coding agents running on this
								Mac.
							</p>
							<p className="max-w-2xl text-sm text-muted-foreground">Muted secondary text for descriptions, timestamps, and metadata.</p>
							<Eyebrow>Section label · eyebrow</Eyebrow>
							<p className="font-mono text-sm text-muted-foreground">
								~/dev/acme-storefront · pix-payment · v2.4.1 · acme-pr-214.vercel.app
							</p>
						</div>
					</Section>

					{/* Buttons */}
					<Section title="Buttons" hint="Fully-rounded pills. Black is the only filled action; the rest stay mono.">
						<Row label="variants">
							<Button>Set up</Button>
							<Button variant="secondary">Open session</Button>
							<Button variant="outline">Pause</Button>
							<Button variant="ghost">Skip</Button>
							<Button variant="destructive">Archive</Button>
							<Button variant="link">Replay intro</Button>
						</Row>
						<Row label="with icon">
							<Button>
								Next <IconArrowRight data-icon="inline-end" />
							</Button>
							<Button variant="outline">
								<IconPlus data-icon="inline-start" /> Add folder
							</Button>
							<Button variant="secondary">
								<IconCheck data-icon="inline-start" /> Approve
							</Button>
						</Row>
						<Row label="sizes">
							<Button size="xs">xs</Button>
							<Button size="sm">sm</Button>
							<Button size="default">default</Button>
							<Button size="lg">lg</Button>
						</Row>
						<Row label="icon-only">
							<Button size="icon-sm" variant="secondary" aria-label="search">
								<IconSearch />
							</Button>
							<Button size="icon" variant="outline" aria-label="add">
								<IconPlus />
							</Button>
							<Button size="icon-lg" aria-label="go">
								<IconArrowRight />
							</Button>
						</Row>
						<Row label="disabled">
							<Button disabled>Set up</Button>
							<Button variant="outline" disabled>
								Deny
							</Button>
						</Row>
					</Section>

					{/* Badges & status */}
					<Section title="Badges & status" hint="Neutral pills for tags; a small colored dot when a status is in play.">
						<Row label="tags">
							<Badge>git</Badge>
							<Badge>Claude project</Badge>
							<Badge variant="secondary">Detected</Badge>
							<Badge variant="outline">Not connected</Badge>
							<Badge variant="solid">DM</Badge>
						</Row>
						<Row label="status">
							<Badge variant="success">Connected</Badge>
							<Badge variant="warning">Needs attention</Badge>
							<Badge variant="info">Working</Badge>
							<Badge variant="error">Blocked</Badge>
						</Row>
						<Row label="chips">
							<span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
								<Dot className="bg-success" /> 1 agent running
							</span>
							<span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
								<Dot className="bg-success" /> Running
							</span>
							<span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
								<Dot className="bg-warning" /> Needs attention
							</span>
						</Row>
					</Section>

					{/* Inputs */}
					<Section title="Inputs" hint="Pill search fields and a flat composer surface.">
						<div className="grid max-w-2xl gap-6 sm:grid-cols-2">
							<div className="flex flex-col gap-2">
								<Label htmlFor="sg-search">Search</Label>
								<Input id="sg-search" placeholder="Search contacts and groups" />
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="sg-folder">Project folder</Label>
								<Input id="sg-folder" defaultValue="~/dev/acme-storefront" className="font-mono" />
							</div>
							<div className="flex flex-col gap-2 sm:col-span-2">
								<Label htmlFor="sg-msg">Message</Label>
								<Textarea id="sg-msg" placeholder="Reply to this thread…" />
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="sg-err">Invalid</Label>
								<Input id="sg-err" aria-invalid defaultValue="not-a-path" />
							</div>
							<div className="flex items-end gap-3">
								<Switch defaultChecked />
								<span className="pb-1 text-sm text-muted-foreground">Autonomous replies</span>
							</div>
						</div>
					</Section>

					{/* Tabs */}
					<Section title="Tabs" hint="A segmented control, plus an underline variant for wizard steps.">
						<Tabs defaultValue="chat" className="max-w-xl">
							<TabsList>
								<TabsTrigger value="chat">Chat</TabsTrigger>
								<TabsTrigger value="issues">Issues</TabsTrigger>
								<TabsTrigger value="artifacts">Artifacts</TabsTrigger>
							</TabsList>
							<TabsContent value="chat" className="pt-4 text-sm text-muted-foreground">
								Autonomous — replies send without review.
							</TabsContent>
							<TabsContent value="issues" className="pt-4 text-sm text-muted-foreground">
								1 awaiting input · 1 working · 1 completed.
							</TabsContent>
							<TabsContent value="artifacts" className="pt-4 text-sm text-muted-foreground">
								Preview deploys and screenshots land here.
							</TabsContent>
						</Tabs>
						<Tabs defaultValue="contact" className="max-w-xl">
							<TabsList variant="line">
								<TabsTrigger value="contact">Contact</TabsTrigger>
								<TabsTrigger value="workspace">Workspace</TabsTrigger>
								<TabsTrigger value="agents">Agents</TabsTrigger>
								<TabsTrigger value="review">Review</TabsTrigger>
							</TabsList>
						</Tabs>
					</Section>

					{/* Cards */}
					<Section title="Cards" hint="Hairline surfaces with generous padding. Onboarding steps and stat tiles.">
						<div className="grid gap-6 md:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle>Connect a channel</CardTitle>
									<CardDescription>WhatsApp, Instagram or Telegram</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-4">
									{[
										{ n: 1, t: 'Connect a channel', d: 'Pair via QR code' },
										{ n: 2, t: 'Add a workspace', d: 'Point at a project folder' },
										{ n: 3, t: 'Attach a thread', d: 'Contact + folder + agent' },
									].map(step => (
										<div key={step.n} className="flex items-center gap-3">
											<span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">
												{step.n}
											</span>
											<div className="flex flex-1 flex-col">
												<span className="text-sm font-semibold text-foreground">{step.t}</span>
												<span className="text-xs text-muted-foreground">{step.d}</span>
											</div>
											<IconChevronRight className="size-4 text-muted-foreground" />
										</div>
									))}
								</CardContent>
								<CardFooter className="justify-end gap-2">
									<Button variant="ghost" size="sm">
										Explore demo data
									</Button>
									<Button size="sm">
										Set up <IconArrowRight data-icon="inline-end" />
									</Button>
								</CardFooter>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Today</CardTitle>
									<CardDescription>Rolling 24h across all threads</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-5">
									{[
										{ label: 'Issues opened', value: '6', pct: 0.32 },
										{ label: 'Issues closed', value: '4', pct: 0.12 },
										{ label: 'Median response', value: '42s', pct: -0.16 },
									].map(stat => (
										<div key={stat.label} className="flex items-end justify-between">
											<div className="flex flex-col gap-1">
												<Eyebrow>{stat.label}</Eyebrow>
												<span className="text-2xl font-bold tabular-nums text-foreground">{stat.value}</span>
											</div>
											<MetricDelta pct={stat.pct} />
										</div>
									))}
								</CardContent>
							</Card>
						</div>
					</Section>

					{/* Dialog */}
					<Section title="Dialog" hint="Rounded surface, soft shadow, circular close.">
						<Dialog>
							<DialogTrigger
								render={
									<Button variant="outline">
										<IconSparkles data-icon="inline-start" /> Open dialog
									</Button>
								}
							/>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Connect a channel</DialogTitle>
									<DialogDescription>Messages in connected channels can be routed to your agents.</DialogDescription>
								</DialogHeader>
								<div className="flex flex-col gap-2">
									{[
										{ t: 'Telegram', d: 'Pair via QR code' },
										{ t: 'Email (IMAP)', d: 'Coming soon' },
									].map(opt => (
										<button
											type="button"
											key={opt.t}
											className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-muted"
										>
											<span className="flex size-9 items-center justify-center rounded-full bg-secondary">
												<IconPlus className="size-4" />
											</span>
											<div className="flex flex-1 flex-col">
												<span className="text-sm font-semibold text-foreground">{opt.t}</span>
												<span className="text-xs text-muted-foreground">{opt.d}</span>
											</div>
											<IconChevronRight className="size-4 text-muted-foreground" />
										</button>
									))}
								</div>
								<DialogFooter>
									<DialogClose render={<Button variant="ghost">Cancel</Button>} />
									<DialogClose render={<Button>Done</Button>} />
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</Section>

					{/* Misc */}
					<Section title="Elements" hint="Avatars, separators, deltas, and loading states.">
						<Row label="avatars">
							<Avatar>
								<AvatarFallback>RL</AvatarFallback>
								<AvatarBadge className="bg-success" />
							</Avatar>
							<Avatar size="lg">
								<AvatarFallback>DS</AvatarFallback>
							</Avatar>
							<Avatar size="sm">
								<AvatarFallback>CD</AvatarFallback>
							</Avatar>
						</Row>
						<Row label="deltas">
							<MetricDelta pct={0.52} />
							<MetricDelta pct={-0.1} />
						</Row>
						<Row label="separator">
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<span>Chat</span>
								<Separator orientation="vertical" className="h-4" />
								<span>Issues</span>
								<Separator orientation="vertical" className="h-4" />
								<span>Artifacts</span>
							</div>
						</Row>
						<Row label="skeleton">
							<div className="flex flex-col gap-2">
								<Skeleton className="h-4 w-48" />
								<Skeleton className="h-4 w-32" />
							</div>
						</Row>
					</Section>

					<footer className="flex items-center justify-between border-t border-border pt-8 text-xs text-muted-foreground">
						<span className="font-mono">Open source · runs locally · no account needed</span>
						<span className="inline-flex items-center gap-1">
							<IconX className="size-3" /> monochrome by design
						</span>
					</footer>
				</div>
			</div>
		</div>
	)
}
