import {
	AutostartService,
	BadgeService,
	FilePickerService,
	HostInfoService,
	NotificationService,
	SecretsService,
} from '../lib/native/contract'

export interface Services {
	filePicker: FilePickerService
	notification: NotificationService
	badge: BadgeService
	secrets: SecretsService
	autostart: AutostartService
	hostInfo: HostInfoService
}
