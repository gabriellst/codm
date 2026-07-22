import type { ReactNode } from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { fg, fs } from '@/lib/tokens'
import { textInputStyle } from '@/lib/text-styles'
import { cn } from '@/lib/utils'

const SIZE_TO_FS = {
	sm: fs.sm,
	base: fs.base,
	lg: fs.lg,
} as const

type InputSize = keyof typeof SIZE_TO_FS

/**
 * Bare text input primitive. Wraps RN's `TextInput` with:
 *  - clip-safe lineHeight via `textInputStyle(fontSize)` so descenders
 *    ("g", "j", "p", "y") aren't cut at the bottom on iOS
 *  - `padding: 0` to suppress iOS's invisible internal vertical padding
 *    so it baseline-aligns cleanly with sibling `<Text>` adornments
 *    inside an `<InputGroup>`
 *  - sensible defaults (no autocorrect / spellcheck) appropriate for
 *    "value" inputs like handles, codes, weights; override per-call
 *    when needed
 *
 * Designed to compose inside `<InputGroup>` for the boxed pill look. Use
 * standalone when you want a borderless inline input.
 */
export function Input({ size = 'base', className, style, ...rest }: TextInputProps & { size?: InputSize }) {
	const fontSize = SIZE_TO_FS[size]
	return (
		<TextInput
			placeholderTextColor={fg.fg3}
			autoCorrect={false}
			spellCheck={false}
			{...rest}
			style={[{ padding: 0, ...textInputStyle(fontSize) }, style]}
			className={cn('flex-1 text-foreground font-sans', className)}
		/>
	)
}

/**
 * Inline non-editable adornment that pairs visually with `<Input>` inside
 * an `<InputGroup>`. Uses the same `textInputStyle` so the prefix and the
 * input baseline-align.
 *
 *   <InputGroup>
 *     <InputPrefix>@</InputPrefix>
 *     <Input value={value} onChangeText={setValue} placeholder="your.handle" />
 *   </InputGroup>
 */
export function InputPrefix({ children, size = 'base', className }: { children: ReactNode; size?: InputSize; className?: string }) {
	const fontSize = SIZE_TO_FS[size]
	return (
		<Text
			className={cn('text-foreground-subtle font-sans', className)}
			style={{ padding: 0, ...textInputStyle(fontSize) }}
			selectable={false}
		>
			{children}
		</Text>
	)
}

/**
 * Companion to `InputPrefix` for trailing adornments (units, status
 * markers, etc.). Identical styling — kept as a separate export so the
 * call site reads top-to-bottom in render order.
 */
export function InputSuffix({ children, size = 'base', className }: { children: ReactNode; size?: InputSize; className?: string }) {
	const fontSize = SIZE_TO_FS[size]
	return (
		<Text
			className={cn('text-foreground-subtle font-sans', className)}
			style={{ padding: 0, ...textInputStyle(fontSize) }}
			selectable={false}
		>
			{children}
		</Text>
	)
}

/**
 * Boxed pill container for an `<Input>` plus optional leading / trailing
 * adornments. Provides the surface (`bg-white/[0.08]`), corner radius,
 * horizontal/vertical padding, and the `gap-2` between children. The
 * Input's `flex-1` makes it take the remaining width.
 */
export function InputGroup({ children, className }: { children: ReactNode; className?: string }) {
	return <View className={cn('bg-white/[0.08] rounded-[10px] px-4 py-3 flex-row items-center gap-2', className)}>{children}</View>
}
