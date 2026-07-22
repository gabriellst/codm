// AUTO-GENERATED — do not edit.
import {
	applyQuotaOverride,
	authGet,
	authPost,
	cancelScheduledDowngrade,
	cancelSubscription,
	changePlan,
	createCheckoutSetupSession,
	createOwner,
	createSubscription,
	disableOwner,
	enableOwner,
	getMyAccount,
	getSession,
	getSubscription,
	getUsage,
	getUserInfo,
	handleBillingWebhook,
	listInvoices,
	listNotifications,
	listPaymentMethods,
	listPlans,
	listenEvents,
	markNotificationRead,
	payInvoice,
	previewPlanChange,
	refundInvoice,
	registerFcmToken,
	removePaymentMethod,
	requestDowngrade,
	requestPasswordReset,
	requestRefund,
	resetPassword,
	resumeSubscription,
	sandboxCheckout,
	sendNotification,
	setActiveOwner,
	setDefaultPaymentMethod,
	signIn,
	signUp,
	unregisterFcmToken,
	updateBillingProfile,
	updateOwnerSettings,
	updateProfile,
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

	applyQuotaOverride(...args: Parameters<typeof applyQuotaOverride>): ReturnType<typeof applyQuotaOverride> {
		return (applyQuotaOverride as (...a: any[]) => ReturnType<typeof applyQuotaOverride>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	authGet(...args: Parameters<typeof authGet>): ReturnType<typeof authGet> {
		return (authGet as (...a: any[]) => ReturnType<typeof authGet>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	authPost(...args: Parameters<typeof authPost>): ReturnType<typeof authPost> {
		return (authPost as (...a: any[]) => ReturnType<typeof authPost>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	cancelScheduledDowngrade(...args: Parameters<typeof cancelScheduledDowngrade>): ReturnType<typeof cancelScheduledDowngrade> {
		return (cancelScheduledDowngrade as (...a: any[]) => ReturnType<typeof cancelScheduledDowngrade>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	cancelSubscription(...args: Parameters<typeof cancelSubscription>): ReturnType<typeof cancelSubscription> {
		return (cancelSubscription as (...a: any[]) => ReturnType<typeof cancelSubscription>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	changePlan(...args: Parameters<typeof changePlan>): ReturnType<typeof changePlan> {
		return (changePlan as (...a: any[]) => ReturnType<typeof changePlan>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createCheckoutSetupSession(...args: Parameters<typeof createCheckoutSetupSession>): ReturnType<typeof createCheckoutSetupSession> {
		return (createCheckoutSetupSession as (...a: any[]) => ReturnType<typeof createCheckoutSetupSession>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createOwner(...args: Parameters<typeof createOwner>): ReturnType<typeof createOwner> {
		return (createOwner as (...a: any[]) => ReturnType<typeof createOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	createSubscription(...args: Parameters<typeof createSubscription>): ReturnType<typeof createSubscription> {
		return (createSubscription as (...a: any[]) => ReturnType<typeof createSubscription>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
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

	getSubscription(...args: Parameters<typeof getSubscription>): ReturnType<typeof getSubscription> {
		return (getSubscription as (...a: any[]) => ReturnType<typeof getSubscription>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getUsage(...args: Parameters<typeof getUsage>): ReturnType<typeof getUsage> {
		return (getUsage as (...a: any[]) => ReturnType<typeof getUsage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	getUserInfo(...args: Parameters<typeof getUserInfo>): ReturnType<typeof getUserInfo> {
		return (getUserInfo as (...a: any[]) => ReturnType<typeof getUserInfo>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	handleBillingWebhook(...args: Parameters<typeof handleBillingWebhook>): ReturnType<typeof handleBillingWebhook> {
		return (handleBillingWebhook as (...a: any[]) => ReturnType<typeof handleBillingWebhook>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listInvoices(...args: Parameters<typeof listInvoices>): ReturnType<typeof listInvoices> {
		return (listInvoices as (...a: any[]) => ReturnType<typeof listInvoices>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listNotifications(...args: Parameters<typeof listNotifications>): ReturnType<typeof listNotifications> {
		return (listNotifications as (...a: any[]) => ReturnType<typeof listNotifications>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listPaymentMethods(...args: Parameters<typeof listPaymentMethods>): ReturnType<typeof listPaymentMethods> {
		return (listPaymentMethods as (...a: any[]) => ReturnType<typeof listPaymentMethods>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listPlans(...args: Parameters<typeof listPlans>): ReturnType<typeof listPlans> {
		return (listPlans as (...a: any[]) => ReturnType<typeof listPlans>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listenEvents(...args: Parameters<typeof listenEvents>): ReturnType<typeof listenEvents> {
		return (listenEvents as (...a: any[]) => ReturnType<typeof listenEvents>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	markNotificationRead(...args: Parameters<typeof markNotificationRead>): ReturnType<typeof markNotificationRead> {
		return (markNotificationRead as (...a: any[]) => ReturnType<typeof markNotificationRead>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	payInvoice(...args: Parameters<typeof payInvoice>): ReturnType<typeof payInvoice> {
		return (payInvoice as (...a: any[]) => ReturnType<typeof payInvoice>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	previewPlanChange(...args: Parameters<typeof previewPlanChange>): ReturnType<typeof previewPlanChange> {
		return (previewPlanChange as (...a: any[]) => ReturnType<typeof previewPlanChange>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	refundInvoice(...args: Parameters<typeof refundInvoice>): ReturnType<typeof refundInvoice> {
		return (refundInvoice as (...a: any[]) => ReturnType<typeof refundInvoice>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	registerFcmToken(...args: Parameters<typeof registerFcmToken>): ReturnType<typeof registerFcmToken> {
		return (registerFcmToken as (...a: any[]) => ReturnType<typeof registerFcmToken>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	removePaymentMethod(...args: Parameters<typeof removePaymentMethod>): ReturnType<typeof removePaymentMethod> {
		return (removePaymentMethod as (...a: any[]) => ReturnType<typeof removePaymentMethod>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	requestDowngrade(...args: Parameters<typeof requestDowngrade>): ReturnType<typeof requestDowngrade> {
		return (requestDowngrade as (...a: any[]) => ReturnType<typeof requestDowngrade>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	requestPasswordReset(...args: Parameters<typeof requestPasswordReset>): ReturnType<typeof requestPasswordReset> {
		return (requestPasswordReset as (...a: any[]) => ReturnType<typeof requestPasswordReset>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	requestRefund(...args: Parameters<typeof requestRefund>): ReturnType<typeof requestRefund> {
		return (requestRefund as (...a: any[]) => ReturnType<typeof requestRefund>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	resetPassword(...args: Parameters<typeof resetPassword>): ReturnType<typeof resetPassword> {
		return (resetPassword as (...a: any[]) => ReturnType<typeof resetPassword>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	resumeSubscription(...args: Parameters<typeof resumeSubscription>): ReturnType<typeof resumeSubscription> {
		return (resumeSubscription as (...a: any[]) => ReturnType<typeof resumeSubscription>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sandboxCheckout(...args: Parameters<typeof sandboxCheckout>): ReturnType<typeof sandboxCheckout> {
		return (sandboxCheckout as (...a: any[]) => ReturnType<typeof sandboxCheckout>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendNotification(...args: Parameters<typeof sendNotification>): ReturnType<typeof sendNotification> {
		return (sendNotification as (...a: any[]) => ReturnType<typeof sendNotification>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setActiveOwner(...args: Parameters<typeof setActiveOwner>): ReturnType<typeof setActiveOwner> {
		return (setActiveOwner as (...a: any[]) => ReturnType<typeof setActiveOwner>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	setDefaultPaymentMethod(...args: Parameters<typeof setDefaultPaymentMethod>): ReturnType<typeof setDefaultPaymentMethod> {
		return (setDefaultPaymentMethod as (...a: any[]) => ReturnType<typeof setDefaultPaymentMethod>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	signIn(...args: Parameters<typeof signIn>): ReturnType<typeof signIn> {
		return (signIn as (...a: any[]) => ReturnType<typeof signIn>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	signUp(...args: Parameters<typeof signUp>): ReturnType<typeof signUp> {
		return (signUp as (...a: any[]) => ReturnType<typeof signUp>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	unregisterFcmToken(...args: Parameters<typeof unregisterFcmToken>): ReturnType<typeof unregisterFcmToken> {
		return (unregisterFcmToken as (...a: any[]) => ReturnType<typeof unregisterFcmToken>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateBillingProfile(...args: Parameters<typeof updateBillingProfile>): ReturnType<typeof updateBillingProfile> {
		return (updateBillingProfile as (...a: any[]) => ReturnType<typeof updateBillingProfile>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateOwnerSettings(...args: Parameters<typeof updateOwnerSettings>): ReturnType<typeof updateOwnerSettings> {
		return (updateOwnerSettings as (...a: any[]) => ReturnType<typeof updateOwnerSettings>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	updateProfile(...args: Parameters<typeof updateProfile>): ReturnType<typeof updateProfile> {
		return (updateProfile as (...a: any[]) => ReturnType<typeof updateProfile>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	uploadAvatar(...args: Parameters<typeof uploadAvatar>): ReturnType<typeof uploadAvatar> {
		return (uploadAvatar as (...a: any[]) => ReturnType<typeof uploadAvatar>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
