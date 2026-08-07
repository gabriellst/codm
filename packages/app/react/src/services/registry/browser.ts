import type { Bindings } from '../core/container'
import {
	AutostartToken,
	BadgeToken,
	CloudSessionToken,
	FilePickerToken,
	HostInfoToken,
	NotificationToken,
	SecretsToken,
	SupervisionToken,
} from '../tokens'
import { BrowserAutostartService } from '../AutostartService/BrowserAutostartService'
import { BrowserBadgeService } from '../BadgeService/BrowserBadgeService'
import { BrowserCloudSessionService } from '../CloudSessionService/BrowserCloudSessionService'
import { BrowserFilePickerService } from '../FilePickerService/BrowserFilePickerService'
import { BrowserHostInfoService } from '../HostInfoService/BrowserHostInfoService'
import { BrowserNotificationService } from '../NotificationService/BrowserNotificationService'
import { BrowserSecretsService } from '../SecretsService/BrowserSecretsService'
import { BrowserSupervisionService } from '../SupervisionService/BrowserSupervisionService'

/**
 * Browser composition root — dev server / e2e / any plain tab. DECLARATIVE: a
 * record of `[Token, Class]` references, ZERO `new` (the Container constructs).
 * Loaded via dynamic import (see registry/index.ts) so the tauri bundle never
 * pulls the browser chunk. If a browser service ever gains a dependency, declare
 * `static deps = [OtherToken] as const` on its class and the Container wires it
 * recursively — this record stays a flat list of class references.
 */
export default [
	[FilePickerToken, BrowserFilePickerService],
	[NotificationToken, BrowserNotificationService],
	[BadgeToken, BrowserBadgeService],
	[SecretsToken, BrowserSecretsService],
	[AutostartToken, BrowserAutostartService],
	[HostInfoToken, BrowserHostInfoService],
	[SupervisionToken, BrowserSupervisionService],
	[CloudSessionToken, BrowserCloudSessionService],
] as const satisfies Bindings
