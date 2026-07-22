// AUTO-GENERATED — do not edit.
import {
	createOwner,
	disableOwner,
	enableOwner,
	getMyAccount,
	getSession,
	getUserInfo,
	listenEvents,
	setActiveOwner,
	updateOwnerSettings,
	uploadAvatar,
} from './client/index.ts'

export interface TypescriptClientConfig {
	baseUrl: string
	fetch?: typeof fetch
}

export class TypescriptClient {
	private constructor(private readonly config: TypescriptClientConfig) {}

	static create(config: TypescriptClientConfig): TypescriptClient {
		return new TypescriptClient(config)
	}

	createOwner(...args: Parameters<typeof createOwner>): ReturnType<typeof createOwner> {
		return (createOwner as (...a: any[]) => ReturnType<typeof createOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	disableOwner(...args: Parameters<typeof disableOwner>): ReturnType<typeof disableOwner> {
		return (disableOwner as (...a: any[]) => ReturnType<typeof disableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	enableOwner(...args: Parameters<typeof enableOwner>): ReturnType<typeof enableOwner> {
		return (enableOwner as (...a: any[]) => ReturnType<typeof enableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getMyAccount(...args: Parameters<typeof getMyAccount>): ReturnType<typeof getMyAccount> {
		return (getMyAccount as (...a: any[]) => ReturnType<typeof getMyAccount>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSession(...args: Parameters<typeof getSession>): ReturnType<typeof getSession> {
		return (getSession as (...a: any[]) => ReturnType<typeof getSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getUserInfo(...args: Parameters<typeof getUserInfo>): ReturnType<typeof getUserInfo> {
		return (getUserInfo as (...a: any[]) => ReturnType<typeof getUserInfo>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listenEvents(...args: Parameters<typeof listenEvents>): ReturnType<typeof listenEvents> {
		return (listenEvents as (...a: any[]) => ReturnType<typeof listenEvents>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setActiveOwner(...args: Parameters<typeof setActiveOwner>): ReturnType<typeof setActiveOwner> {
		return (setActiveOwner as (...a: any[]) => ReturnType<typeof setActiveOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateOwnerSettings(...args: Parameters<typeof updateOwnerSettings>): ReturnType<typeof updateOwnerSettings> {
		return (updateOwnerSettings as (...a: any[]) => ReturnType<typeof updateOwnerSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	uploadAvatar(...args: Parameters<typeof uploadAvatar>): ReturnType<typeof uploadAvatar> {
		return (uploadAvatar as (...a: any[]) => ReturnType<typeof uploadAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
