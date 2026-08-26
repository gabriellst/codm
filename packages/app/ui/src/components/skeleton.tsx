import { cn } from '../lib/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="skeleton" className={cn('bg-hover rounded-asymmetric-md animate-pulse', className)} {...props} />
}

export { Skeleton }
