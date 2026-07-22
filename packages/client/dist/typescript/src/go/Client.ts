// AUTO-GENERATED — do not edit.
import {
	archiveRemote,
	checkIsOnPlatform,
	connectChannel,
	createWhatsAppChannel,
	deleteChannel,
	deleteMessage,
	editMessage,
	forwardMessage,
	getChannel,
	getOrCreateChannel,
	listChannels,
	listenEvents,
	logoutChannel,
	markRemoteAsSeen,
	markRemoteAsUnread,
	muteRemote,
	pinRemote,
	restartChannel,
	sendAudio,
	sendButton,
	sendChatPresence,
	sendContact,
	sendFile,
	sendImage,
	sendLink,
	sendList,
	sendLocation,
	sendMedia,
	sendPoll,
	sendReaction,
	sendStatus,
	sendSticker,
	sendText,
	sendVideo,
	setPresence,
	unarchiveRemote,
	unmuteRemote,
	unpinRemote,
} from './client/index.ts'

export interface GoClientConfig {
	baseUrl: string
	fetch?: typeof fetch
}

export class GoClient {
	private constructor(private readonly config: GoClientConfig) {}

	static create(config: GoClientConfig): GoClient {
		return new GoClient(config)
	}

	archiveRemote(...args: Parameters<typeof archiveRemote>): ReturnType<typeof archiveRemote> {
		return (archiveRemote as (...a: any[]) => ReturnType<typeof archiveRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	checkIsOnPlatform(...args: Parameters<typeof checkIsOnPlatform>): ReturnType<typeof checkIsOnPlatform> {
		return (checkIsOnPlatform as (...a: any[]) => ReturnType<typeof checkIsOnPlatform>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	connectChannel(...args: Parameters<typeof connectChannel>): ReturnType<typeof connectChannel> {
		return (connectChannel as (...a: any[]) => ReturnType<typeof connectChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createWhatsAppChannel(...args: Parameters<typeof createWhatsAppChannel>): ReturnType<typeof createWhatsAppChannel> {
		return (createWhatsAppChannel as (...a: any[]) => ReturnType<typeof createWhatsAppChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	deleteChannel(...args: Parameters<typeof deleteChannel>): ReturnType<typeof deleteChannel> {
		return (deleteChannel as (...a: any[]) => ReturnType<typeof deleteChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	deleteMessage(...args: Parameters<typeof deleteMessage>): ReturnType<typeof deleteMessage> {
		return (deleteMessage as (...a: any[]) => ReturnType<typeof deleteMessage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	editMessage(...args: Parameters<typeof editMessage>): ReturnType<typeof editMessage> {
		return (editMessage as (...a: any[]) => ReturnType<typeof editMessage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	forwardMessage(...args: Parameters<typeof forwardMessage>): ReturnType<typeof forwardMessage> {
		return (forwardMessage as (...a: any[]) => ReturnType<typeof forwardMessage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getChannel(...args: Parameters<typeof getChannel>): ReturnType<typeof getChannel> {
		return (getChannel as (...a: any[]) => ReturnType<typeof getChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getOrCreateChannel(...args: Parameters<typeof getOrCreateChannel>): ReturnType<typeof getOrCreateChannel> {
		return (getOrCreateChannel as (...a: any[]) => ReturnType<typeof getOrCreateChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listChannels(...args: Parameters<typeof listChannels>): ReturnType<typeof listChannels> {
		return (listChannels as (...a: any[]) => ReturnType<typeof listChannels>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listenEvents(...args: Parameters<typeof listenEvents>): ReturnType<typeof listenEvents> {
		return (listenEvents as (...a: any[]) => ReturnType<typeof listenEvents>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	logoutChannel(...args: Parameters<typeof logoutChannel>): ReturnType<typeof logoutChannel> {
		return (logoutChannel as (...a: any[]) => ReturnType<typeof logoutChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	markRemoteAsSeen(...args: Parameters<typeof markRemoteAsSeen>): ReturnType<typeof markRemoteAsSeen> {
		return (markRemoteAsSeen as (...a: any[]) => ReturnType<typeof markRemoteAsSeen>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	markRemoteAsUnread(...args: Parameters<typeof markRemoteAsUnread>): ReturnType<typeof markRemoteAsUnread> {
		return (markRemoteAsUnread as (...a: any[]) => ReturnType<typeof markRemoteAsUnread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	muteRemote(...args: Parameters<typeof muteRemote>): ReturnType<typeof muteRemote> {
		return (muteRemote as (...a: any[]) => ReturnType<typeof muteRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	pinRemote(...args: Parameters<typeof pinRemote>): ReturnType<typeof pinRemote> {
		return (pinRemote as (...a: any[]) => ReturnType<typeof pinRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	restartChannel(...args: Parameters<typeof restartChannel>): ReturnType<typeof restartChannel> {
		return (restartChannel as (...a: any[]) => ReturnType<typeof restartChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendAudio(...args: Parameters<typeof sendAudio>): ReturnType<typeof sendAudio> {
		return (sendAudio as (...a: any[]) => ReturnType<typeof sendAudio>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendButton(...args: Parameters<typeof sendButton>): ReturnType<typeof sendButton> {
		return (sendButton as (...a: any[]) => ReturnType<typeof sendButton>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendChatPresence(...args: Parameters<typeof sendChatPresence>): ReturnType<typeof sendChatPresence> {
		return (sendChatPresence as (...a: any[]) => ReturnType<typeof sendChatPresence>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendContact(...args: Parameters<typeof sendContact>): ReturnType<typeof sendContact> {
		return (sendContact as (...a: any[]) => ReturnType<typeof sendContact>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendFile(...args: Parameters<typeof sendFile>): ReturnType<typeof sendFile> {
		return (sendFile as (...a: any[]) => ReturnType<typeof sendFile>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendImage(...args: Parameters<typeof sendImage>): ReturnType<typeof sendImage> {
		return (sendImage as (...a: any[]) => ReturnType<typeof sendImage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendLink(...args: Parameters<typeof sendLink>): ReturnType<typeof sendLink> {
		return (sendLink as (...a: any[]) => ReturnType<typeof sendLink>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendList(...args: Parameters<typeof sendList>): ReturnType<typeof sendList> {
		return (sendList as (...a: any[]) => ReturnType<typeof sendList>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendLocation(...args: Parameters<typeof sendLocation>): ReturnType<typeof sendLocation> {
		return (sendLocation as (...a: any[]) => ReturnType<typeof sendLocation>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendMedia(...args: Parameters<typeof sendMedia>): ReturnType<typeof sendMedia> {
		return (sendMedia as (...a: any[]) => ReturnType<typeof sendMedia>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendPoll(...args: Parameters<typeof sendPoll>): ReturnType<typeof sendPoll> {
		return (sendPoll as (...a: any[]) => ReturnType<typeof sendPoll>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendReaction(...args: Parameters<typeof sendReaction>): ReturnType<typeof sendReaction> {
		return (sendReaction as (...a: any[]) => ReturnType<typeof sendReaction>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendStatus(...args: Parameters<typeof sendStatus>): ReturnType<typeof sendStatus> {
		return (sendStatus as (...a: any[]) => ReturnType<typeof sendStatus>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendSticker(...args: Parameters<typeof sendSticker>): ReturnType<typeof sendSticker> {
		return (sendSticker as (...a: any[]) => ReturnType<typeof sendSticker>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendText(...args: Parameters<typeof sendText>): ReturnType<typeof sendText> {
		return (sendText as (...a: any[]) => ReturnType<typeof sendText>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendVideo(...args: Parameters<typeof sendVideo>): ReturnType<typeof sendVideo> {
		return (sendVideo as (...a: any[]) => ReturnType<typeof sendVideo>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setPresence(...args: Parameters<typeof setPresence>): ReturnType<typeof setPresence> {
		return (setPresence as (...a: any[]) => ReturnType<typeof setPresence>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	unarchiveRemote(...args: Parameters<typeof unarchiveRemote>): ReturnType<typeof unarchiveRemote> {
		return (unarchiveRemote as (...a: any[]) => ReturnType<typeof unarchiveRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	unmuteRemote(...args: Parameters<typeof unmuteRemote>): ReturnType<typeof unmuteRemote> {
		return (unmuteRemote as (...a: any[]) => ReturnType<typeof unmuteRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	unpinRemote(...args: Parameters<typeof unpinRemote>): ReturnType<typeof unpinRemote> {
		return (unpinRemote as (...a: any[]) => ReturnType<typeof unpinRemote>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
