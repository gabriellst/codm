// AUTO-GENERATED — do not edit.
import {
	authPassthroughGet,
	authPassthroughPost,
	claimSignInCode,
	createOwner,
	desktopCallback,
	disableOwner,
	enableOwner,
	getSession,
	health,
	setActiveOwner,
	setCloudToken,
	signInLoopback,
	signInSocial,
	updateOwnerSettings,
	uploadAvatar,
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

	getSession(...args: Parameters<typeof getSession>): ReturnType<typeof getSession> {
		return (getSession as (...a: any[]) => ReturnType<typeof getSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	health(...args: Parameters<typeof health>): ReturnType<typeof health> {
		return (health as (...a: any[]) => ReturnType<typeof health>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
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

	updateOwnerSettings(...args: Parameters<typeof updateOwnerSettings>): ReturnType<typeof updateOwnerSettings> {
		return (updateOwnerSettings as (...a: any[]) => ReturnType<typeof updateOwnerSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	uploadAvatar(...args: Parameters<typeof uploadAvatar>): ReturnType<typeof uploadAvatar> {
		return (uploadAvatar as (...a: any[]) => ReturnType<typeof uploadAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
