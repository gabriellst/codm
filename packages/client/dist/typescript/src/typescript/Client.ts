// AUTO-GENERATED — do not edit.
import {
	addWorkspace,
	archiveIssue,
	askOperator,
	attachThread,
	authPassthroughGet,
	authPassthroughPost,
	configureContextBuffer,
	configureMentionGate,
	configureModel,
	configurePrompt,
	createIssue,
	createOwner,
	createThreadLoop,
	deleteThread,
	deleteThreadLoop,
	desktopCallback,
	detectProviders,
	disableOwner,
	enableOwner,
	exchangeDeviceCode,
	forkIssue,
	getArtifactContent,
	getAttachThreadWizard,
	getContactAvatar,
	getEntitlement,
	getHomeDashboard,
	getIssueDetail,
	getIssueStatus,
	getIssuesOverview,
	getMyAccount,
	getNeedsYouPanel,
	getOperatorIdentity,
	getSession,
	getSessionChat,
	getSessionIssues,
	getSettings,
	getSetupChecklist,
	getThreadSettings,
	getUserInfo,
	health,
	listArtifacts,
	listThreadLoops,
	listWorkspaces,
	listenEvents,
	pauseThread,
	raiseStop,
	recordArtifact,
	removeWorkspace,
	resolveStop,
	restoreIssue,
	resumeThread,
	revokeDevice,
	sendDirectMessage,
	setActiveOwner,
	setCloudToken,
	setParticipantInvocation,
	setThreadLoopEnabled,
	signIn,
	steerIssue,
	steerIssueTurn,
	steerThread,
	streamTerminalSession,
	transitionIssueStatus,
	updateOwnerSettings,
	updateStopCriteria,
	updateThreadLoop,
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

	addWorkspace(...args: Parameters<typeof addWorkspace>): ReturnType<typeof addWorkspace> {
		return (addWorkspace as (...a: any[]) => ReturnType<typeof addWorkspace>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	archiveIssue(...args: Parameters<typeof archiveIssue>): ReturnType<typeof archiveIssue> {
		return (archiveIssue as (...a: any[]) => ReturnType<typeof archiveIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	askOperator(...args: Parameters<typeof askOperator>): ReturnType<typeof askOperator> {
		return (askOperator as (...a: any[]) => ReturnType<typeof askOperator>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	attachThread(...args: Parameters<typeof attachThread>): ReturnType<typeof attachThread> {
		return (attachThread as (...a: any[]) => ReturnType<typeof attachThread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	authPassthroughGet(...args: Parameters<typeof authPassthroughGet>): ReturnType<typeof authPassthroughGet> {
		return (authPassthroughGet as (...a: any[]) => ReturnType<typeof authPassthroughGet>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	authPassthroughPost(...args: Parameters<typeof authPassthroughPost>): ReturnType<typeof authPassthroughPost> {
		return (authPassthroughPost as (...a: any[]) => ReturnType<typeof authPassthroughPost>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	configureContextBuffer(...args: Parameters<typeof configureContextBuffer>): ReturnType<typeof configureContextBuffer> {
		return (configureContextBuffer as (...a: any[]) => ReturnType<typeof configureContextBuffer>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	configureMentionGate(...args: Parameters<typeof configureMentionGate>): ReturnType<typeof configureMentionGate> {
		return (configureMentionGate as (...a: any[]) => ReturnType<typeof configureMentionGate>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	configureModel(...args: Parameters<typeof configureModel>): ReturnType<typeof configureModel> {
		return (configureModel as (...a: any[]) => ReturnType<typeof configureModel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	configurePrompt(...args: Parameters<typeof configurePrompt>): ReturnType<typeof configurePrompt> {
		return (configurePrompt as (...a: any[]) => ReturnType<typeof configurePrompt>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createIssue(...args: Parameters<typeof createIssue>): ReturnType<typeof createIssue> {
		return (createIssue as (...a: any[]) => ReturnType<typeof createIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createOwner(...args: Parameters<typeof createOwner>): ReturnType<typeof createOwner> {
		return (createOwner as (...a: any[]) => ReturnType<typeof createOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createThreadLoop(...args: Parameters<typeof createThreadLoop>): ReturnType<typeof createThreadLoop> {
		return (createThreadLoop as (...a: any[]) => ReturnType<typeof createThreadLoop>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	deleteThread(...args: Parameters<typeof deleteThread>): ReturnType<typeof deleteThread> {
		return (deleteThread as (...a: any[]) => ReturnType<typeof deleteThread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	deleteThreadLoop(...args: Parameters<typeof deleteThreadLoop>): ReturnType<typeof deleteThreadLoop> {
		return (deleteThreadLoop as (...a: any[]) => ReturnType<typeof deleteThreadLoop>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	desktopCallback(...args: Parameters<typeof desktopCallback>): ReturnType<typeof desktopCallback> {
		return (desktopCallback as (...a: any[]) => ReturnType<typeof desktopCallback>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	detectProviders(...args: Parameters<typeof detectProviders>): ReturnType<typeof detectProviders> {
		return (detectProviders as (...a: any[]) => ReturnType<typeof detectProviders>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	disableOwner(...args: Parameters<typeof disableOwner>): ReturnType<typeof disableOwner> {
		return (disableOwner as (...a: any[]) => ReturnType<typeof disableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	enableOwner(...args: Parameters<typeof enableOwner>): ReturnType<typeof enableOwner> {
		return (enableOwner as (...a: any[]) => ReturnType<typeof enableOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	exchangeDeviceCode(...args: Parameters<typeof exchangeDeviceCode>): ReturnType<typeof exchangeDeviceCode> {
		return (exchangeDeviceCode as (...a: any[]) => ReturnType<typeof exchangeDeviceCode>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	forkIssue(...args: Parameters<typeof forkIssue>): ReturnType<typeof forkIssue> {
		return (forkIssue as (...a: any[]) => ReturnType<typeof forkIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getArtifactContent(...args: Parameters<typeof getArtifactContent>): ReturnType<typeof getArtifactContent> {
		return (getArtifactContent as (...a: any[]) => ReturnType<typeof getArtifactContent>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getAttachThreadWizard(...args: Parameters<typeof getAttachThreadWizard>): ReturnType<typeof getAttachThreadWizard> {
		return (getAttachThreadWizard as (...a: any[]) => ReturnType<typeof getAttachThreadWizard>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getContactAvatar(...args: Parameters<typeof getContactAvatar>): ReturnType<typeof getContactAvatar> {
		return (getContactAvatar as (...a: any[]) => ReturnType<typeof getContactAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getEntitlement(...args: Parameters<typeof getEntitlement>): ReturnType<typeof getEntitlement> {
		return (getEntitlement as (...a: any[]) => ReturnType<typeof getEntitlement>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getHomeDashboard(...args: Parameters<typeof getHomeDashboard>): ReturnType<typeof getHomeDashboard> {
		return (getHomeDashboard as (...a: any[]) => ReturnType<typeof getHomeDashboard>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getIssueDetail(...args: Parameters<typeof getIssueDetail>): ReturnType<typeof getIssueDetail> {
		return (getIssueDetail as (...a: any[]) => ReturnType<typeof getIssueDetail>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getIssueStatus(...args: Parameters<typeof getIssueStatus>): ReturnType<typeof getIssueStatus> {
		return (getIssueStatus as (...a: any[]) => ReturnType<typeof getIssueStatus>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getIssuesOverview(...args: Parameters<typeof getIssuesOverview>): ReturnType<typeof getIssuesOverview> {
		return (getIssuesOverview as (...a: any[]) => ReturnType<typeof getIssuesOverview>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getMyAccount(...args: Parameters<typeof getMyAccount>): ReturnType<typeof getMyAccount> {
		return (getMyAccount as (...a: any[]) => ReturnType<typeof getMyAccount>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getNeedsYouPanel(...args: Parameters<typeof getNeedsYouPanel>): ReturnType<typeof getNeedsYouPanel> {
		return (getNeedsYouPanel as (...a: any[]) => ReturnType<typeof getNeedsYouPanel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getOperatorIdentity(...args: Parameters<typeof getOperatorIdentity>): ReturnType<typeof getOperatorIdentity> {
		return (getOperatorIdentity as (...a: any[]) => ReturnType<typeof getOperatorIdentity>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSession(...args: Parameters<typeof getSession>): ReturnType<typeof getSession> {
		return (getSession as (...a: any[]) => ReturnType<typeof getSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSessionChat(...args: Parameters<typeof getSessionChat>): ReturnType<typeof getSessionChat> {
		return (getSessionChat as (...a: any[]) => ReturnType<typeof getSessionChat>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSessionIssues(...args: Parameters<typeof getSessionIssues>): ReturnType<typeof getSessionIssues> {
		return (getSessionIssues as (...a: any[]) => ReturnType<typeof getSessionIssues>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSettings(...args: Parameters<typeof getSettings>): ReturnType<typeof getSettings> {
		return (getSettings as (...a: any[]) => ReturnType<typeof getSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getSetupChecklist(...args: Parameters<typeof getSetupChecklist>): ReturnType<typeof getSetupChecklist> {
		return (getSetupChecklist as (...a: any[]) => ReturnType<typeof getSetupChecklist>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getThreadSettings(...args: Parameters<typeof getThreadSettings>): ReturnType<typeof getThreadSettings> {
		return (getThreadSettings as (...a: any[]) => ReturnType<typeof getThreadSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getUserInfo(...args: Parameters<typeof getUserInfo>): ReturnType<typeof getUserInfo> {
		return (getUserInfo as (...a: any[]) => ReturnType<typeof getUserInfo>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	health(...args: Parameters<typeof health>): ReturnType<typeof health> {
		return (health as (...a: any[]) => ReturnType<typeof health>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listArtifacts(...args: Parameters<typeof listArtifacts>): ReturnType<typeof listArtifacts> {
		return (listArtifacts as (...a: any[]) => ReturnType<typeof listArtifacts>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listThreadLoops(...args: Parameters<typeof listThreadLoops>): ReturnType<typeof listThreadLoops> {
		return (listThreadLoops as (...a: any[]) => ReturnType<typeof listThreadLoops>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listWorkspaces(...args: Parameters<typeof listWorkspaces>): ReturnType<typeof listWorkspaces> {
		return (listWorkspaces as (...a: any[]) => ReturnType<typeof listWorkspaces>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listenEvents(...args: Parameters<typeof listenEvents>): ReturnType<typeof listenEvents> {
		return (listenEvents as (...a: any[]) => ReturnType<typeof listenEvents>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	pauseThread(...args: Parameters<typeof pauseThread>): ReturnType<typeof pauseThread> {
		return (pauseThread as (...a: any[]) => ReturnType<typeof pauseThread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	raiseStop(...args: Parameters<typeof raiseStop>): ReturnType<typeof raiseStop> {
		return (raiseStop as (...a: any[]) => ReturnType<typeof raiseStop>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	recordArtifact(...args: Parameters<typeof recordArtifact>): ReturnType<typeof recordArtifact> {
		return (recordArtifact as (...a: any[]) => ReturnType<typeof recordArtifact>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	removeWorkspace(...args: Parameters<typeof removeWorkspace>): ReturnType<typeof removeWorkspace> {
		return (removeWorkspace as (...a: any[]) => ReturnType<typeof removeWorkspace>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	resolveStop(...args: Parameters<typeof resolveStop>): ReturnType<typeof resolveStop> {
		return (resolveStop as (...a: any[]) => ReturnType<typeof resolveStop>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	restoreIssue(...args: Parameters<typeof restoreIssue>): ReturnType<typeof restoreIssue> {
		return (restoreIssue as (...a: any[]) => ReturnType<typeof restoreIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	resumeThread(...args: Parameters<typeof resumeThread>): ReturnType<typeof resumeThread> {
		return (resumeThread as (...a: any[]) => ReturnType<typeof resumeThread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	revokeDevice(...args: Parameters<typeof revokeDevice>): ReturnType<typeof revokeDevice> {
		return (revokeDevice as (...a: any[]) => ReturnType<typeof revokeDevice>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendDirectMessage(...args: Parameters<typeof sendDirectMessage>): ReturnType<typeof sendDirectMessage> {
		return (sendDirectMessage as (...a: any[]) => ReturnType<typeof sendDirectMessage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setActiveOwner(...args: Parameters<typeof setActiveOwner>): ReturnType<typeof setActiveOwner> {
		return (setActiveOwner as (...a: any[]) => ReturnType<typeof setActiveOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setCloudToken(...args: Parameters<typeof setCloudToken>): ReturnType<typeof setCloudToken> {
		return (setCloudToken as (...a: any[]) => ReturnType<typeof setCloudToken>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setParticipantInvocation(...args: Parameters<typeof setParticipantInvocation>): ReturnType<typeof setParticipantInvocation> {
		return (setParticipantInvocation as (...a: any[]) => ReturnType<typeof setParticipantInvocation>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setThreadLoopEnabled(...args: Parameters<typeof setThreadLoopEnabled>): ReturnType<typeof setThreadLoopEnabled> {
		return (setThreadLoopEnabled as (...a: any[]) => ReturnType<typeof setThreadLoopEnabled>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	signIn(...args: Parameters<typeof signIn>): ReturnType<typeof signIn> {
		return (signIn as (...a: any[]) => ReturnType<typeof signIn>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	steerIssue(...args: Parameters<typeof steerIssue>): ReturnType<typeof steerIssue> {
		return (steerIssue as (...a: any[]) => ReturnType<typeof steerIssue>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	steerIssueTurn(...args: Parameters<typeof steerIssueTurn>): ReturnType<typeof steerIssueTurn> {
		return (steerIssueTurn as (...a: any[]) => ReturnType<typeof steerIssueTurn>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	steerThread(...args: Parameters<typeof steerThread>): ReturnType<typeof steerThread> {
		return (steerThread as (...a: any[]) => ReturnType<typeof steerThread>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	streamTerminalSession(...args: Parameters<typeof streamTerminalSession>): ReturnType<typeof streamTerminalSession> {
		return (streamTerminalSession as (...a: any[]) => ReturnType<typeof streamTerminalSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	transitionIssueStatus(...args: Parameters<typeof transitionIssueStatus>): ReturnType<typeof transitionIssueStatus> {
		return (transitionIssueStatus as (...a: any[]) => ReturnType<typeof transitionIssueStatus>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateOwnerSettings(...args: Parameters<typeof updateOwnerSettings>): ReturnType<typeof updateOwnerSettings> {
		return (updateOwnerSettings as (...a: any[]) => ReturnType<typeof updateOwnerSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateStopCriteria(...args: Parameters<typeof updateStopCriteria>): ReturnType<typeof updateStopCriteria> {
		return (updateStopCriteria as (...a: any[]) => ReturnType<typeof updateStopCriteria>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateThreadLoop(...args: Parameters<typeof updateThreadLoop>): ReturnType<typeof updateThreadLoop> {
		return (updateThreadLoop as (...a: any[]) => ReturnType<typeof updateThreadLoop>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	uploadAvatar(...args: Parameters<typeof uploadAvatar>): ReturnType<typeof uploadAvatar> {
		return (uploadAvatar as (...a: any[]) => ReturnType<typeof uploadAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
