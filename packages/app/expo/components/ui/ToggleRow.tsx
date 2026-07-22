import { Switch, Text, View, type SwitchProps } from 'react-native'
import { cn } from '@/lib/utils'

interface ToggleRowProps extends Pick<SwitchProps, 'disabled'> {
	label: string
	value: boolean
	onChange: (next: boolean) => void
	className?: string
	/** Defaults to `fg-1` for body weight; pass `prominent` for the section's
	 *  primary toggle when the label needs to feel like a heading. */
	tone?: 'body' | 'prominent'
}

/**
 * Label-on-the-left, `<Switch>`-on-the-right row. Used by the notification
 * preferences sheet, the feed-visibility sheet, and any other settings
 * surface that wants the standard iOS-style row layout. Keep it
 * presentational — owners decide how to source / persist the value.
 */
export function ToggleRow({ label, value, onChange, disabled, className, tone = 'body' }: ToggleRowProps) {
	const labelClass = tone === 'prominent' ? 'text-foreground font-sans-semi' : 'text-muted-foreground font-sans-semi'
	return (
		<View data-slot="toggle-row" className={cn('flex-row items-center justify-between', className)}>
			<Text className={cn(labelClass, 'text-sm flex-1 pr-3')}>{label}</Text>
			<Switch value={value} onValueChange={onChange} disabled={disabled} />
		</View>
	)
}
