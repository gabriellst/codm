import { cn } from '@/lib/utils'

/** The CodeDM wordmark: "Code" in ink, "DM" in a black pill. */
export function Logo({ className }: { className?: string }) {
	return (
		<span className={cn('inline-flex items-center text-xl font-bold tracking-tight text-foreground', className)}>
			Code
			<span className="ml-1 rounded-md bg-primary px-1.5 py-0.5 text-primary-foreground">DM</span>
		</span>
	)
}
