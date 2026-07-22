// Mobile JSX element block. The web variant maps `as=section|div|article|...`
// to HTML element interfaces; on mobile we only ever wrap one of three RN
// primitives. This keeps the block surface tight and the generated code easy
// to read.

export const MOBILE_ELEMENT_INTERFACES = {
	View: 'View',
	Text: 'Text',
	Pressable: 'View', // ref forwarded to a View
} as const

export type MobileElement = keyof typeof MOBILE_ELEMENT_INTERFACES

export function mobileElementImport(tag: MobileElement): string {
	// Pressable refs land on the underlying View — RN exposes the host view
	// instance for both. We import View + tag together for clarity in the
	// generated import list.
	if (tag === 'Pressable') return `import { Pressable, View } from 'react-native'`
	if (tag === 'Text') return `import { Text, View } from 'react-native'`
	return `import { View } from 'react-native'`
}
