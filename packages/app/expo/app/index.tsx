import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import { hasSeenOnboarding } from '@/lib/onboarding'

/**
 * Entry gate. Single operator, no login (founder decision 2) — the only branch
 * is whether the 3-slide intro has been seen (persisted in expo-secure-store).
 * First run → onboarding; thereafter → straight to the home tab.
 */
export default function Index() {
	const [seen, setSeen] = useState<boolean | null>(null)

	useEffect(() => {
		void hasSeenOnboarding().then(setSeen)
	}, [])

	// Splash stays up until fonts load in the root layout, so a null frame here is invisible.
	if (seen === null) return null

	return <Redirect href={seen ? '/(tabs)/home' : '/onboarding'} />
}
