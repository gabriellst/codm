import { Redirect } from 'expo-router'

// Single operator, no login screen — the entry always lands on the home tab (founder decision 2).
export default function Index() {
	return <Redirect href="/(tabs)/home" />
}
