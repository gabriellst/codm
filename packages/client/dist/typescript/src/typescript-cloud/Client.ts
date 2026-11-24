// AUTO-GENERATED — do not edit.
import {
	authPassthroughGet,
	authPassthroughPost,
	claimSignInCode,
	createOwner,
	desktopCallback,
	disableOwner,
	enableOwner,
	forgetPanelDevice,
	getPanelAction,
	getPanelBoard,
	getPanelIdentity,
	getPanelIssue,
	getSession,
	health,
	listPanelMembers,
	panelAsset,
	panelPage,
	requestPanelAction,
	requestPanelCode,
	rotatePanelLink,
	setActiveOwner,
	setCloudToken,
	signInLoopback,
	signInSocial,
	syncPanel,
	syncPanelRoster,
	updateOwnerSettings,
	uploadAvatar,
	verifyPanelCode,
} from './client/index.ts'

export interface TypescriptCloudClientConfig {
	baseUrl: string
	fetch?: typeof fetch
}

export class TypescriptCloudClient {
	private constructor(private readonly config: TypescriptCloudClientConfig) {}

	static create(config: TypescriptCloudClientConfig): TypescriptCloudClient {
		return new TypescriptCloudClient(config)
	}

	authPassthroughGet(...args: Parameters<typeof authPassthroughGet>): ReturnType<typeof authPassthroughGet> {
		return (authPassthroughGet as (...a: any[]) => ReturnType<typeof authPassthroughGet>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	authPassthroughPost(...args: Parameters<typeof authPassthroughPost>): ReturnType<typeof authPassthroughPost> {
		return (authPassthroughPost as (...a: any[]) => ReturnType<typeof authPassthroughPost>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	claimSignInCode(...args: Parameters<typeof claimSignInCode>): ReturnType<typeof claimSignInCode> {
		return (claimSignInCode as (...a: any[]) => ReturnType<typeof claimSignInCode>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createOwner(...args: Parameters<typeof createOwner>): ReturnType<typeof createOwner> {
		return (createOwner as (...a: any[]) => ReturnType<typeof createOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	desktopCallback(...args: Parameters<typeof desktopCallback>): ReturnType<typeof desktopCallback> {
		return (desktopCallback as (...a: any[]) => ReturnType<typeof desktopCallback>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	disableOwner(...args: Parameters<typeof disableOwner>): ReturnType<typeof disableOwner> {
		return (disableOwner as (...a: any[]) => ReturnType<typeof disableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	enableOwner(...args: Parameters<typeof enableOwner>): ReturnType<typeof enableOwner> {
		return (enableOwner as (...a: any[]) => ReturnType<typeof enableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	forgetPanelDevice(...args: Parameters<typeof forgetPanelDevice>): ReturnType<typeof forgetPanelDevice> {
		return (forgetPanelDevice as (...a: any[]) => ReturnType<typeof forgetPanelDevice>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getPanelAction(...args: Parameters<typeof getPanelAction>): ReturnType<typeof getPanelAction> {
		return (getPanelAction as (...a: any[]) => ReturnType<typeof getPanelAction>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getPanelBoard(...args: Parameters<typeof getPanelBoard>): ReturnType<typeof getPanelBoard> {
		return (getPanelBoard as (...a: any[]) => ReturnType<typeof getPanelBoard>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getPanelIdentity(...args: Parameters<typeof getPanelIdentity>): ReturnType<typeof getPanelIdentity> {
		return (getPanelIdentity as (...a: any[]) => ReturnType<typeof getPanelIdentity>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getPanelIssue(...args: Parameters<typeof getPanelIssue>): ReturnType<typeof getPanelIssue> {
		return (getPanelIssue as (...a: any[]) => ReturnType<typeof getPanelIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSession(...args: Parameters<typeof getSession>): ReturnType<typeof getSession> {
		return (getSession as (...a: any[]) => ReturnType<typeof getSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	health(...args: Parameters<typeof health>): ReturnType<typeof health> {
		return (health as (...a: any[]) => ReturnType<typeof health>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listPanelMembers(...args: Parameters<typeof listPanelMembers>): ReturnType<typeof listPanelMembers> {
		return (listPanelMembers as (...a: any[]) => ReturnType<typeof listPanelMembers>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	panelAsset(...args: Parameters<typeof panelAsset>): ReturnType<typeof panelAsset> {
		return (panelAsset as (...a: any[]) => ReturnType<typeof panelAsset>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	panelPage(...args: Parameters<typeof panelPage>): ReturnType<typeof panelPage> {
		return (panelPage as (...a: any[]) => ReturnType<typeof panelPage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	requestPanelAction(...args: Parameters<typeof requestPanelAction>): ReturnType<typeof requestPanelAction> {
		return (requestPanelAction as (...a: any[]) => ReturnType<typeof requestPanelAction>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	requestPanelCode(...args: Parameters<typeof requestPanelCode>): ReturnType<typeof requestPanelCode> {
		return (requestPanelCode as (...a: any[]) => ReturnType<typeof requestPanelCode>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	rotatePanelLink(...args: Parameters<typeof rotatePanelLink>): ReturnType<typeof rotatePanelLink> {
		return (rotatePanelLink as (...a: any[]) => ReturnType<typeof rotatePanelLink>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setActiveOwner(...args: Parameters<typeof setActiveOwner>): ReturnType<typeof setActiveOwner> {
		return (setActiveOwner as (...a: any[]) => ReturnType<typeof setActiveOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setCloudToken(...args: Parameters<typeof setCloudToken>): ReturnType<typeof setCloudToken> {
		return (setCloudToken as (...a: any[]) => ReturnType<typeof setCloudToken>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	signInLoopback(...args: Parameters<typeof signInLoopback>): ReturnType<typeof signInLoopback> {
		return (signInLoopback as (...a: any[]) => ReturnType<typeof signInLoopback>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	signInSocial(...args: Parameters<typeof signInSocial>): ReturnType<typeof signInSocial> {
		return (signInSocial as (...a: any[]) => ReturnType<typeof signInSocial>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	syncPanel(...args: Parameters<typeof syncPanel>): ReturnType<typeof syncPanel> {
		return (syncPanel as (...a: any[]) => ReturnType<typeof syncPanel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	syncPanelRoster(...args: Parameters<typeof syncPanelRoster>): ReturnType<typeof syncPanelRoster> {
		return (syncPanelRoster as (...a: any[]) => ReturnType<typeof syncPanelRoster>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateOwnerSettings(...args: Parameters<typeof updateOwnerSettings>): ReturnType<typeof updateOwnerSettings> {
		return (updateOwnerSettings as (...a: any[]) => ReturnType<typeof updateOwnerSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	uploadAvatar(...args: Parameters<typeof uploadAvatar>): ReturnType<typeof uploadAvatar> {
		return (uploadAvatar as (...a: any[]) => ReturnType<typeof uploadAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	verifyPanelCode(...args: Parameters<typeof verifyPanelCode>): ReturnType<typeof verifyPanelCode> {
		return (verifyPanelCode as (...a: any[]) => ReturnType<typeof verifyPanelCode>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
