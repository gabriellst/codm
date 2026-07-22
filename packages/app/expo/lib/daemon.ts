import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { configureClient } from '@codedm/client-typescript/http'

/**
 * CodeDM runs as a local daemon on the operator's Mac (founder decision: open
 * source, no account, everything stays local). The app talks to it over the LAN.
 * The base URL is operator-local client state — resolved, in order, from:
 *   1. a SecureStore override the operator sets in Settings (this file),
 *   2. `Constants.expoConfig.extra.daemonUrl` / `EXPO_PUBLIC_API_URL`,
 *   3. `http://localhost:3030` (Simulator dev fallback).
 *
 * Both backends (TS reads on :3030, Go channel worker) sit behind the same
 * daemon origin, so a single URL configures every SDK service.
 */
const DAEMON_URL_KEY = 'codedm:daemon-url'

export function resolveDefaultDaemonUrl(): string {
	return (
		(Constants.expoConfig?.extra?.daemonUrl as string | undefined) ??
		process.env.EXPO_PUBLIC_API_URL ??
		'http://localhost:3030'
	)
}

export async function getStoredDaemonUrl(): Promise<string | null> {
	try {
		return await SecureStore.getItemAsync(DAEMON_URL_KEY)
	} catch {
		return null
	}
}

/** The URL currently in effect (stored override if present, else the default). */
export async function getEffectiveDaemonUrl(): Promise<string> {
	return (await getStoredDaemonUrl()) ?? resolveDefaultDaemonUrl()
}

function pointClientAt(baseUrl: string): void {
	configureClient({ typescript: baseUrl, go: baseUrl })
}

export async function setStoredDaemonUrl(url: string): Promise<void> {
	const trimmed = url.trim()
	if (!trimmed) return
	try {
		await SecureStore.setItemAsync(DAEMON_URL_KEY, trimmed)
	} catch {
		// Even if the write fails, point the live client at it for this session.
	}
	pointClientAt(trimmed)
}

export async function clearStoredDaemonUrl(): Promise<void> {
	try {
		await SecureStore.deleteItemAsync(DAEMON_URL_KEY)
	} catch {
		// non-fatal
	}
	pointClientAt(resolveDefaultDaemonUrl())
}

/**
 * On boot, re-point the already-configured SDK client at the operator's stored
 * daemon URL if one exists. Called from the root layout after the synchronous
 * default is set — SecureStore is async, so the default covers the first frame.
 */
export async function applyStoredDaemonUrl(): Promise<void> {
	const stored = await getStoredDaemonUrl()
	if (stored) pointClientAt(stored)
}
