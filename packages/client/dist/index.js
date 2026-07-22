import ky, { HTTPError } from "ky";
import { mutationOptions as react_query_mutationOptions, queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod/v4";
var __webpack_require__ = {};
(()=>{
    __webpack_require__.d = (exports, definition)=>{
        for(var key in definition)if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) Object.defineProperty(exports, key, {
            enumerable: true,
            get: definition[key]
        });
    };
})();
(()=>{
    __webpack_require__.o = (obj, prop)=>Object.prototype.hasOwnProperty.call(obj, prop);
})();
(()=>{
    __webpack_require__.r = (exports)=>{
        if ('undefined' != typeof Symbol && Symbol.toStringTag) Object.defineProperty(exports, Symbol.toStringTag, {
            value: 'Module'
        });
        Object.defineProperty(exports, '__esModule', {
            value: true
        });
    };
})();
var http_namespaceObject = {};
__webpack_require__.r(http_namespaceObject);
__webpack_require__.d(http_namespaceObject, {
    client: ()=>client,
    configureClient: ()=>http_configureClient,
    default: ()=>http,
    getConfig: ()=>http_getConfig,
    resetConfig: ()=>http_resetConfig
});
var api_namespaceObject = {};
__webpack_require__.r(api_namespaceObject);
__webpack_require__.d(api_namespaceObject, {
    ApiErrorsEnum: ()=>ApiErrors_ApiErrorsEnum,
    GameGenreEnum: ()=>GameGenre_GameGenreEnum,
    LanguageEnum: ()=>Language_LanguageEnum,
    NotificationLevelEnum: ()=>NotificationLevel_NotificationLevelEnum,
    docs: ()=>docs,
    operations: ()=>operations
});
var app_namespaceObject = {};
__webpack_require__.r(app_namespaceObject);
__webpack_require__.d(app_namespaceObject, {
    ApiErrorsEnum: ()=>types_ApiErrors_ApiErrorsEnum,
    Authentication: ()=>Authentication,
    Game: ()=>Game,
    GameGenreEnum: ()=>types_GameGenre_GameGenreEnum,
    LanguageEnum: ()=>types_Language_LanguageEnum,
    NotificationLevelEnum: ()=>types_NotificationLevel_NotificationLevelEnum,
    Ui: ()=>Ui,
    apiErrorsSchema: ()=>apiErrorsSchema,
    authGet: ()=>authGet,
    authGet200Schema: ()=>authGet200Schema,
    authGetQueryKey: ()=>authGetQueryKey,
    authGetQueryOptions: ()=>authGetQueryOptions,
    authGetQueryResponseSchema: ()=>authGetQueryResponseSchema,
    authPost: ()=>authPost,
    authPost200Schema: ()=>authPost200Schema,
    authPostMutationKey: ()=>authPostMutationKey,
    authPostMutationOptions: ()=>authPostMutationOptions,
    authPostMutationResponseSchema: ()=>authPostMutationResponseSchema,
    createGame: ()=>createGame,
    createGame200Schema: ()=>createGame200Schema,
    createGameMutationKey: ()=>createGameMutationKey,
    createGameMutationOptions: ()=>createGameMutationOptions,
    createGameMutationRequestSchema: ()=>createGameMutationRequestSchema,
    createGameMutationResponseSchema: ()=>createGameMutationResponseSchema,
    deleteGame: ()=>deleteGame,
    deleteGame200Schema: ()=>deleteGame200Schema,
    deleteGameMutationKey: ()=>deleteGameMutationKey,
    deleteGameMutationOptions: ()=>deleteGameMutationOptions,
    deleteGameMutationResponseSchema: ()=>deleteGameMutationResponseSchema,
    deleteGamePathParamsSchema: ()=>deleteGamePathParamsSchema,
    gameGenreSchema: ()=>gameGenreSchema,
    getGame: ()=>getGame,
    getGame200Schema: ()=>getGame200Schema,
    getGamePathParamsSchema: ()=>getGamePathParamsSchema,
    getGameQueryKey: ()=>getGameQueryKey,
    getGameQueryOptions: ()=>getGameQueryOptions,
    getGameQueryResponseSchema: ()=>getGameQueryResponseSchema,
    getUserInfo: ()=>getUserInfo,
    getUserInfo200Schema: ()=>getUserInfo200Schema,
    getUserInfoQueryKey: ()=>getUserInfoQueryKey,
    getUserInfoQueryOptions: ()=>getUserInfoQueryOptions,
    getUserInfoQueryResponseSchema: ()=>getUserInfoQueryResponseSchema,
    languageSchema: ()=>languageSchema,
    listGames: ()=>listGames,
    listGames200Schema: ()=>listGames200Schema,
    listGamesQueryKey: ()=>listGamesQueryKey,
    listGamesQueryOptions: ()=>listGamesQueryOptions,
    listGamesQueryResponseSchema: ()=>listGamesQueryResponseSchema,
    listNotifications: ()=>listNotifications,
    listNotifications200Schema: ()=>listNotifications200Schema,
    listNotificationsQueryKey: ()=>listNotificationsQueryKey,
    listNotificationsQueryOptions: ()=>listNotificationsQueryOptions,
    listNotificationsQueryParamsSchema: ()=>listNotificationsQueryParamsSchema,
    listNotificationsQueryResponseSchema: ()=>listNotificationsQueryResponseSchema,
    listenEvents: ()=>listenEvents,
    listenEvents200Schema: ()=>listenEvents200Schema,
    listenEventsOutputIntegrationGameCreatedSchema: ()=>listenEventsOutputIntegrationGameCreatedSchema,
    listenEventsQueryKey: ()=>listenEventsQueryKey,
    listenEventsQueryOptions: ()=>listenEventsQueryOptions,
    listenEventsQueryResponse: ()=>listenEventsQueryResponse,
    listenEventsQueryResponseSchema: ()=>listenEventsQueryResponseSchema,
    notificationLevelSchema: ()=>notificationLevelSchema,
    operations: ()=>operations_operations,
    requestPasswordReset: ()=>requestPasswordReset,
    requestPasswordReset200Schema: ()=>requestPasswordReset200Schema,
    requestPasswordResetMutationKey: ()=>requestPasswordResetMutationKey,
    requestPasswordResetMutationOptions: ()=>requestPasswordResetMutationOptions,
    requestPasswordResetMutationRequestSchema: ()=>requestPasswordResetMutationRequestSchema,
    requestPasswordResetMutationResponseSchema: ()=>requestPasswordResetMutationResponseSchema,
    resetPassword: ()=>resetPassword,
    resetPassword200Schema: ()=>resetPassword200Schema,
    resetPasswordBodySchema: ()=>resetPasswordBodySchema,
    resetPasswordMutationKey: ()=>resetPasswordMutationKey,
    resetPasswordMutationOptions: ()=>resetPasswordMutationOptions,
    resetPasswordMutationRequestSchema: ()=>resetPasswordMutationRequestSchema,
    resetPasswordMutationResponseSchema: ()=>resetPasswordMutationResponseSchema,
    signIn: ()=>signIn,
    signIn200Schema: ()=>signIn200Schema,
    signInMutationKey: ()=>signInMutationKey,
    signInMutationOptions: ()=>signInMutationOptions,
    signInMutationRequestSchema: ()=>signInMutationRequestSchema,
    signInMutationResponseSchema: ()=>signInMutationResponseSchema,
    signUp: ()=>signUp,
    signUp200Schema: ()=>signUp200Schema,
    signUpBodySchema: ()=>signUpBodySchema,
    signUpMutationKey: ()=>signUpMutationKey,
    signUpMutationOptions: ()=>signUpMutationOptions,
    signUpMutationRequestSchema: ()=>signUpMutationRequestSchema,
    signUpMutationResponseSchema: ()=>signUpMutationResponseSchema,
    updateGame: ()=>updateGame,
    updateGame200Schema: ()=>updateGame200Schema,
    updateGameMutationKey: ()=>updateGameMutationKey,
    updateGameMutationOptions: ()=>updateGameMutationOptions,
    updateGameMutationRequestSchema: ()=>updateGameMutationRequestSchema,
    updateGameMutationResponseSchema: ()=>updateGameMutationResponseSchema,
    updateGamePathParamsSchema: ()=>updateGamePathParamsSchema,
    useAuthGet: ()=>useAuthGet,
    useAuthPost: ()=>useAuthPost,
    useCreateGame: ()=>useCreateGame,
    useDeleteGame: ()=>useDeleteGame,
    useGetGame: ()=>useGetGame,
    useGetUserInfo: ()=>useGetUserInfo,
    useListGames: ()=>useListGames,
    useListNotifications: ()=>useListNotifications,
    useListenEvents: ()=>useListenEvents,
    useRequestPasswordReset: ()=>useRequestPasswordReset,
    useResetPassword: ()=>useResetPassword,
    useSignIn: ()=>useSignIn,
    useSignUp: ()=>useSignUp,
    useUpdateGame: ()=>useUpdateGame
});
const globalConfigs = globalThis;
function createConfigManager(symbolKey) {
    function getOrCreateConfig() {
        if (!globalConfigs[symbolKey]) globalConfigs[symbolKey] = {
            baseUrl: ''
        };
        return globalConfigs[symbolKey];
    }
    function configureClient(newConfig) {
        const config = getOrCreateConfig();
        Object.assign(config, newConfig);
    }
    function getConfig() {
        return getOrCreateConfig();
    }
    function resetConfig() {
        globalConfigs[symbolKey] = {
            baseUrl: ''
        };
    }
    function resolveURL(url) {
        const config = getOrCreateConfig();
        if (!config.baseUrl) return url;
        let path;
        try {
            const parsed = new URL(url);
            path = parsed.pathname + parsed.search + parsed.hash;
        } catch  {
            path = url;
        }
        if (!path.startsWith('/')) path = `/${path}`;
        const base = config.baseUrl.replace(/\/$/, '');
        return `${base}${path}`;
    }
    return {
        configureClient,
        getConfig,
        resetConfig,
        resolveURL
    };
}
const { configureClient: http_configureClient, getConfig: http_getConfig, resetConfig: http_resetConfig, resolveURL: http_resolveURL } = createConfigManager(Symbol.for('@medscall/monorepo-sdk'));
const DEFAULT_RETRY = {
    limit: 2,
    methods: [
        'get',
        'put',
        'head',
        'delete',
        'options',
        'trace'
    ],
    statusCodes: [
        408,
        413,
        429,
        500,
        502,
        503,
        504
    ],
    backoffLimit: 10000,
    retryOnTimeout: true,
    jitter: true
};
function isBodyInit(data) {
    return null != data && (data instanceof Blob || data instanceof FormData || data instanceof URLSearchParams || 'undefined' != typeof ReadableStream && data instanceof ReadableStream || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || 'string' == typeof data);
}
function buildRetryOptions(retry) {
    if (false === retry) return 0;
    if ('number' == typeof retry) return retry;
    if (!retry) return DEFAULT_RETRY;
    return {
        limit: retry.limit ?? DEFAULT_RETRY.limit,
        methods: retry.methods ?? DEFAULT_RETRY.methods,
        statusCodes: retry.statusCodes ?? DEFAULT_RETRY.statusCodes,
        backoffLimit: retry.backoffLimit ?? DEFAULT_RETRY.backoffLimit,
        retryOnTimeout: retry.retryOnTimeout ?? DEFAULT_RETRY.retryOnTimeout,
        jitter: retry.jitter ?? DEFAULT_RETRY.jitter,
        ...retry.delay && {
            delay: retry.delay
        }
    };
}
function buildBody(data) {
    if (null == data) return;
    if (!isBodyInit(data) && 'object' == typeof data) return serializeValue(data);
    return data;
}
function serializeValue(value) {
    if (null == value) return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serializeValue);
    if ('object' == typeof value) {
        const result = {};
        for (const [key, val] of Object.entries(value))result[key] = serializeValue(val);
        return result;
    }
    return value;
}
function serializeParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params))if (null != value) if (value instanceof Date) result[key] = value.toISOString();
    else if ('object' == typeof value) result[key] = JSON.stringify(serializeValue(value));
    else result[key] = String(value);
    return result;
}
const responseHandlers = {
    arraybuffer: (r)=>r.arrayBuffer(),
    blob: (r)=>r.blob(),
    stream: (r)=>r.body,
    text: (r)=>r.text(),
    formData: (r)=>r.formData(),
    document: async (r)=>{
        const txt = await r.text();
        if ('undefined' != typeof DOMParser) {
            const ct = r.headers.get('content-type') || '';
            const type = ct.includes('xml') ? 'text/xml' : 'text/html';
            return new DOMParser().parseFromString(txt, type);
        }
        return txt;
    },
    json: (r)=>r.json()
};
async function parseResponse(response, responseType) {
    if (204 === response.status || '0' === response.headers.get('content-length')) return;
    const handler = responseHandlers[responseType] ?? responseHandlers.json;
    return await handler(response);
}
const kyInstance = ky.create({
    credentials: 'include',
    timeout: 30000,
    retry: DEFAULT_RETRY,
    hooks: {
        beforeError: [
            async (error)=>{
                try {
                    const body = await error.response.clone().json();
                    if (body.message || body.error) error.message = body.message || body.error || error.message;
                } catch  {}
                return error;
            }
        ]
    }
});
const client = async (config)=>{
    const { url, params, method, data, responseType = 'json', signal, headers, retry, timeout } = config;
    const resolvedUrl = http_resolveURL(url);
    const searchParams = params ? new URLSearchParams(serializeParams(params)) : void 0;
    const body = buildBody(data);
    const isJsonBody = null != body && !isBodyInit(data);
    const kyOptions = {
        method: method.toLowerCase(),
        searchParams,
        signal,
        headers,
        retry: buildRetryOptions(retry),
        ...void 0 !== timeout && {
            timeout
        },
        ...isJsonBody ? {
            json: body
        } : {
            body: body
        }
    };
    try {
        const response = await kyInstance(resolvedUrl, kyOptions);
        const responseData = await parseResponse(response, responseType);
        return {
            data: responseData,
            status: response.status,
            statusText: response.statusText
        };
    } catch (err) {
        if (err instanceof HTTPError) {
            const errorData = await parseResponse(err.response.clone(), 'json').catch(()=>null);
            const error = new Error(errorData?.message || errorData?.error || err.message || 'UNKNOWN_ERROR');
            error.code = errorData?.code || 'UNKNOWN_ERROR';
            error.status = err.response.status;
            throw error;
        }
        if (err instanceof Error) throw err;
        throw new Error('UNKNOWN_ERROR');
    }
};
const http = client;
function getDocsUrl() {
    const res = {
        method: 'GET',
        url: "/api/internal/docs"
    };
    return res;
}
async function docs(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getDocsUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const operations = {
    Docs: {
        path: "/api/internal/docs",
        method: "get"
    }
};
var ApiErrors_ApiErrorsEnum = /*#__PURE__*/ function(ApiErrorsEnum) {
    ApiErrorsEnum["ACCOUNT_NOT_FOUND"] = "ACCOUNT_NOT_FOUND";
    ApiErrorsEnum["ASYNC_VALIDATION_NOT_SUPPORTED"] = "ASYNC_VALIDATION_NOT_SUPPORTED";
    ApiErrorsEnum["BODY_MUST_BE_AN_OBJECT"] = "BODY_MUST_BE_AN_OBJECT";
    ApiErrorsEnum["CALLBACK_URL_REQUIRED"] = "CALLBACK_URL_REQUIRED";
    ApiErrorsEnum["CANNOT_CONVERT_INPUT"] = "CANNOT_CONVERT_INPUT";
    ApiErrorsEnum["COMMAND_HANDLER_NOT_FOUND"] = "COMMAND_HANDLER_NOT_FOUND";
    ApiErrorsEnum["COMMAND_QUEUE_NOT_FOUND"] = "COMMAND_QUEUE_NOT_FOUND";
    ApiErrorsEnum["CREDENTIAL_ACCOUNT_NOT_FOUND"] = "CREDENTIAL_ACCOUNT_NOT_FOUND";
    ApiErrorsEnum["CROSS_SITE_NAVIGATION_LOGIN_BLOCKED"] = "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED";
    ApiErrorsEnum["EMAIL_ALREADY_VERIFIED"] = "EMAIL_ALREADY_VERIFIED";
    ApiErrorsEnum["EMAIL_CAN_NOT_BE_UPDATED"] = "EMAIL_CAN_NOT_BE_UPDATED";
    ApiErrorsEnum["EMAIL_MISMATCH"] = "EMAIL_MISMATCH";
    ApiErrorsEnum["EMAIL_NOT_VERIFIED"] = "EMAIL_NOT_VERIFIED";
    ApiErrorsEnum["ENTITY_NOT_FOUND_WHILE_SAVING"] = "ENTITY_NOT_FOUND_WHILE_SAVING";
    ApiErrorsEnum["FAILED_TO_CREATE_SESSION"] = "FAILED_TO_CREATE_SESSION";
    ApiErrorsEnum["FAILED_TO_CREATE_USER"] = "FAILED_TO_CREATE_USER";
    ApiErrorsEnum["FAILED_TO_CREATE_VERIFICATION"] = "FAILED_TO_CREATE_VERIFICATION";
    ApiErrorsEnum["FAILED_TO_GET_SESSION"] = "FAILED_TO_GET_SESSION";
    ApiErrorsEnum["FAILED_TO_GET_USER_INFO"] = "FAILED_TO_GET_USER_INFO";
    ApiErrorsEnum["FAILED_TO_UNLINK_LAST_ACCOUNT"] = "FAILED_TO_UNLINK_LAST_ACCOUNT";
    ApiErrorsEnum["FAILED_TO_UPDATE_USER"] = "FAILED_TO_UPDATE_USER";
    ApiErrorsEnum["FIELD_NOT_ALLOWED"] = "FIELD_NOT_ALLOWED";
    ApiErrorsEnum["GAME_NOT_FOUND"] = "GAME_NOT_FOUND";
    ApiErrorsEnum["GAME_TITLE_ALREADY_EXISTS"] = "GAME_TITLE_ALREADY_EXISTS";
    ApiErrorsEnum["GAME_TITLE_REQUIRED"] = "GAME_TITLE_REQUIRED";
    ApiErrorsEnum["HANDLER_NOT_BOUND"] = "HANDLER_NOT_BOUND";
    ApiErrorsEnum["ID_TOKEN_NOT_SUPPORTED"] = "ID_TOKEN_NOT_SUPPORTED";
    ApiErrorsEnum["INVALIDATED_AUTH_TOKEN"] = "INVALIDATED_AUTH_TOKEN";
    ApiErrorsEnum["INVALID_ADDRESS"] = "INVALID_ADDRESS";
    ApiErrorsEnum["INVALID_AUTH_TOKEN"] = "INVALID_AUTH_TOKEN";
    ApiErrorsEnum["INVALID_BIRTH_DATE"] = "INVALID_BIRTH_DATE";
    ApiErrorsEnum["INVALID_CALLBACK_URL"] = "INVALID_CALLBACK_URL";
    ApiErrorsEnum["INVALID_CNPJ"] = "INVALID_CNPJ";
    ApiErrorsEnum["INVALID_CONTROLLER_EXAMPLES"] = "INVALID_CONTROLLER_EXAMPLES";
    ApiErrorsEnum["INVALID_CPF"] = "INVALID_CPF";
    ApiErrorsEnum["INVALID_DOCUMENT"] = "INVALID_DOCUMENT";
    ApiErrorsEnum["INVALID_EMAIL"] = "INVALID_EMAIL";
    ApiErrorsEnum["INVALID_EMAIL_OR_PASSWORD"] = "INVALID_EMAIL_OR_PASSWORD";
    ApiErrorsEnum["INVALID_ENTITY"] = "INVALID_ENTITY";
    ApiErrorsEnum["INVALID_ERROR_CALLBACK_URL"] = "INVALID_ERROR_CALLBACK_URL";
    ApiErrorsEnum["INVALID_GAME_GENRE"] = "INVALID_GAME_GENRE";
    ApiErrorsEnum["INVALID_ID"] = "INVALID_ID";
    ApiErrorsEnum["INVALID_ID_VALUES_LENGTH"] = "INVALID_ID_VALUES_LENGTH";
    ApiErrorsEnum["INVALID_IMAGE_URL"] = "INVALID_IMAGE_URL";
    ApiErrorsEnum["INVALID_MONEY"] = "INVALID_MONEY";
    ApiErrorsEnum["INVALID_NAME"] = "INVALID_NAME";
    ApiErrorsEnum["INVALID_NEW_USER_CALLBACK_URL"] = "INVALID_NEW_USER_CALLBACK_URL";
    ApiErrorsEnum["INVALID_ORIGIN"] = "INVALID_ORIGIN";
    ApiErrorsEnum["INVALID_OUTBOX_PAYLOAD"] = "INVALID_OUTBOX_PAYLOAD";
    ApiErrorsEnum["INVALID_PASSWORD"] = "INVALID_PASSWORD";
    ApiErrorsEnum["INVALID_PHONE"] = "INVALID_PHONE";
    ApiErrorsEnum["INVALID_RANGE"] = "INVALID_RANGE";
    ApiErrorsEnum["INVALID_REDIRECT_URL"] = "INVALID_REDIRECT_URL";
    ApiErrorsEnum["INVALID_RELEASE_YEAR"] = "INVALID_RELEASE_YEAR";
    ApiErrorsEnum["INVALID_RG"] = "INVALID_RG";
    ApiErrorsEnum["INVALID_ROLE"] = "INVALID_ROLE";
    ApiErrorsEnum["INVALID_TOKEN"] = "INVALID_TOKEN";
    ApiErrorsEnum["INVALID_USER"] = "INVALID_USER";
    ApiErrorsEnum["INVALID_ZIP_CODE"] = "INVALID_ZIP_CODE";
    ApiErrorsEnum["LINKED_ACCOUNT_ALREADY_EXISTS"] = "LINKED_ACCOUNT_ALREADY_EXISTS";
    ApiErrorsEnum["METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED"] = "METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED";
    ApiErrorsEnum["MISSING_ENVIRONMENT_VARIABLE"] = "MISSING_ENVIRONMENT_VARIABLE";
    ApiErrorsEnum["MISSING_FIELD"] = "MISSING_FIELD";
    ApiErrorsEnum["MISSING_LOG_CONTENT"] = "MISSING_LOG_CONTENT";
    ApiErrorsEnum["MISSING_OR_NULL_ORIGIN"] = "MISSING_OR_NULL_ORIGIN";
    ApiErrorsEnum["NOT_FOUND"] = "NOT_FOUND";
    ApiErrorsEnum["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    ApiErrorsEnum["ONBOARDING_ALREADY_COMPLETED"] = "ONBOARDING_ALREADY_COMPLETED";
    ApiErrorsEnum["ONBOARDING_NOT_COMPLETED"] = "ONBOARDING_NOT_COMPLETED";
    ApiErrorsEnum["ONBOARDING_NOT_FOUND"] = "ONBOARDING_NOT_FOUND";
    ApiErrorsEnum["OPTIMISTIC_LOCK_CONFLICT"] = "OPTIMISTIC_LOCK_CONFLICT";
    ApiErrorsEnum["PASSWORDS_DONT_MATCH"] = "PASSWORDS_DONT_MATCH";
    ApiErrorsEnum["PASSWORD_ALREADY_SET"] = "PASSWORD_ALREADY_SET";
    ApiErrorsEnum["PASSWORD_TOO_LONG"] = "PASSWORD_TOO_LONG";
    ApiErrorsEnum["PASSWORD_TOO_SHORT"] = "PASSWORD_TOO_SHORT";
    ApiErrorsEnum["PROVIDER_NOT_FOUND"] = "PROVIDER_NOT_FOUND";
    ApiErrorsEnum["SESSION_EXPIRED"] = "SESSION_EXPIRED";
    ApiErrorsEnum["SESSION_NOT_FRESH"] = "SESSION_NOT_FRESH";
    ApiErrorsEnum["SOCIAL_ACCOUNT_ALREADY_LINKED"] = "SOCIAL_ACCOUNT_ALREADY_LINKED";
    ApiErrorsEnum["TOKEN_EXPIRED"] = "TOKEN_EXPIRED";
    ApiErrorsEnum["UNAUTHORIZED"] = "UNAUTHORIZED";
    ApiErrorsEnum["USER_ALREADY_EXISTS"] = "USER_ALREADY_EXISTS";
    ApiErrorsEnum["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"] = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
    ApiErrorsEnum["USER_ALREADY_HAS_PASSWORD"] = "USER_ALREADY_HAS_PASSWORD";
    ApiErrorsEnum["USER_EMAIL_NOT_FOUND"] = "USER_EMAIL_NOT_FOUND";
    ApiErrorsEnum["USER_NOT_FOUND"] = "USER_NOT_FOUND";
    ApiErrorsEnum["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ApiErrorsEnum["VERIFICATION_EMAIL_NOT_ENABLED"] = "VERIFICATION_EMAIL_NOT_ENABLED";
    return ApiErrorsEnum;
}({});
var GameGenre_GameGenreEnum = /*#__PURE__*/ function(GameGenreEnum) {
    GameGenreEnum["ACTION"] = "ACTION";
    GameGenreEnum["ADVENTURE"] = "ADVENTURE";
    GameGenreEnum["RPG"] = "RPG";
    GameGenreEnum["STRATEGY"] = "STRATEGY";
    GameGenreEnum["PUZZLE"] = "PUZZLE";
    GameGenreEnum["SPORTS"] = "SPORTS";
    GameGenreEnum["SIMULATION"] = "SIMULATION";
    GameGenreEnum["OTHER"] = "OTHER";
    return GameGenreEnum;
}({});
var Language_LanguageEnum = /*#__PURE__*/ function(LanguageEnum) {
    LanguageEnum["PT"] = "PT";
    LanguageEnum["EN"] = "EN";
    LanguageEnum["ES"] = "ES";
    LanguageEnum["FR"] = "FR";
    LanguageEnum["IT"] = "IT";
    LanguageEnum["DE"] = "DE";
    LanguageEnum["GA"] = "GA";
    return LanguageEnum;
}({});
var NotificationLevel_NotificationLevelEnum = /*#__PURE__*/ function(NotificationLevelEnum) {
    NotificationLevelEnum["INFO"] = "INFO";
    NotificationLevelEnum["WARNING"] = "WARNING";
    NotificationLevelEnum["ERROR"] = "ERROR";
    NotificationLevelEnum["SUCCESS"] = "SUCCESS";
    return NotificationLevelEnum;
}({});
function getAuthGetUrl() {
    const res = {
        method: 'GET',
        url: "/api/authentication/*"
    };
    return res;
}
async function authGet(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getAuthGetUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const authGetQueryKey = ()=>[
        {
            url: '/api/authentication/*'
        }
    ];
function authGetQueryOptions(config = {}) {
    const queryKey = authGetQueryKey();
    return queryOptions({
        queryKey,
        queryFn: async ({ signal })=>authGet({
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useAuthGet(options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? authGetQueryKey();
    const query = useQuery({
        ...authGetQueryOptions(config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function getAuthPostUrl() {
    const res = {
        method: 'POST',
        url: "/api/authentication/*"
    };
    return res;
}
async function authPost(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "POST",
        url: getAuthPostUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const authPostMutationKey = ()=>[
        {
            url: '/api/authentication/*'
        }
    ];
function authPostMutationOptions(config = {}) {
    const mutationKey = authPostMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ()=>authPost(config)
    });
}
function useAuthPost(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? authPostMutationKey();
    const baseOptions = authPostMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getRequestPasswordResetUrl() {
    const res = {
        method: 'POST',
        url: "/api/authentication/req-password-reset"
    };
    return res;
}
async function requestPasswordReset({ data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "POST",
        url: getRequestPasswordResetUrl().url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const requestPasswordResetMutationKey = ()=>[
        {
            url: '/api/authentication/req-password-reset'
        }
    ];
function requestPasswordResetMutationOptions(config = {}) {
    const mutationKey = requestPasswordResetMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ data })=>requestPasswordReset({
                data
            }, config)
    });
}
function useRequestPasswordReset(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? requestPasswordResetMutationKey();
    const baseOptions = requestPasswordResetMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getResetPasswordUrl() {
    const res = {
        method: 'POST',
        url: "/api/authentication/reset-pass"
    };
    return res;
}
async function resetPassword({ data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "POST",
        url: getResetPasswordUrl().url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const resetPasswordMutationKey = ()=>[
        {
            url: '/api/authentication/reset-pass'
        }
    ];
function resetPasswordMutationOptions(config = {}) {
    const mutationKey = resetPasswordMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ data })=>resetPassword({
                data
            }, config)
    });
}
function useResetPassword(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? resetPasswordMutationKey();
    const baseOptions = resetPasswordMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getSignInUrl() {
    const res = {
        method: 'POST',
        url: "/api/authentication/sign-in"
    };
    return res;
}
async function signIn({ data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "POST",
        url: getSignInUrl().url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const signInMutationKey = ()=>[
        {
            url: '/api/authentication/sign-in'
        }
    ];
function signInMutationOptions(config = {}) {
    const mutationKey = signInMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ data })=>signIn({
                data
            }, config)
    });
}
function useSignIn(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? signInMutationKey();
    const baseOptions = signInMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getSignUpUrl() {
    const res = {
        method: 'POST',
        url: "/api/authentication/sign-up"
    };
    return res;
}
async function signUp({ data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "POST",
        url: getSignUpUrl().url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const signUpMutationKey = ()=>[
        {
            url: '/api/authentication/sign-up'
        }
    ];
function signUpMutationOptions(config = {}) {
    const mutationKey = signUpMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ data })=>signUp({
                data
            }, config)
    });
}
function useSignUp(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? signUpMutationKey();
    const baseOptions = signUpMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getCreateGameUrl() {
    const res = {
        method: 'POST',
        url: "/api/game/"
    };
    return res;
}
async function createGame({ data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "POST",
        url: getCreateGameUrl().url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const createGameMutationKey = ()=>[
        {
            url: '/api/game/'
        }
    ];
function createGameMutationOptions(config = {}) {
    const mutationKey = createGameMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ data })=>createGame({
                data
            }, config)
    });
}
function useCreateGame(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? createGameMutationKey();
    const baseOptions = createGameMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getDeleteGameUrl({ gameId }) {
    const res = {
        method: 'DELETE',
        url: `/api/game/${gameId}`
    };
    return res;
}
async function deleteGame({ gameId }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "DELETE",
        url: getDeleteGameUrl({
            gameId
        }).url.toString(),
        ...requestConfig
    });
    return res.data;
}
const deleteGameMutationKey = ()=>[
        {
            url: '/api/game/:gameId'
        }
    ];
function deleteGameMutationOptions(config = {}) {
    const mutationKey = deleteGameMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ gameId })=>deleteGame({
                gameId
            }, config)
    });
}
function useDeleteGame(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? deleteGameMutationKey();
    const baseOptions = deleteGameMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getGetGameUrl({ gameId }) {
    const res = {
        method: 'GET',
        url: `/api/game/${gameId}`
    };
    return res;
}
async function getGame({ gameId }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getGetGameUrl({
            gameId
        }).url.toString(),
        ...requestConfig
    });
    return res.data;
}
const getGameQueryKey = ({ gameId })=>[
        {
            url: '/api/game/:gameId',
            params: {
                gameId: gameId
            }
        }
    ];
function getGameQueryOptions({ gameId }, config = {}) {
    const queryKey = getGameQueryKey({
        gameId
    });
    return queryOptions({
        enabled: !!gameId,
        queryKey,
        queryFn: async ({ signal })=>getGame({
                gameId: gameId
            }, {
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useGetGame({ gameId }, options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? getGameQueryKey({
        gameId
    });
    const query = useQuery({
        ...getGameQueryOptions({
            gameId
        }, config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function getListGamesUrl() {
    const res = {
        method: 'GET',
        url: "/api/game/"
    };
    return res;
}
async function listGames(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getListGamesUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const listGamesQueryKey = ()=>[
        {
            url: '/api/game/'
        }
    ];
function listGamesQueryOptions(config = {}) {
    const queryKey = listGamesQueryKey();
    return queryOptions({
        queryKey,
        queryFn: async ({ signal })=>listGames({
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useListGames(options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? listGamesQueryKey();
    const query = useQuery({
        ...listGamesQueryOptions(config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function getUpdateGameUrl({ gameId }) {
    const res = {
        method: 'PATCH',
        url: `/api/game/${gameId}`
    };
    return res;
}
async function updateGame({ gameId, data }, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const requestData = data;
    const res = await request({
        method: "PATCH",
        url: getUpdateGameUrl({
            gameId
        }).url.toString(),
        data: requestData,
        ...requestConfig
    });
    return res.data;
}
const updateGameMutationKey = ()=>[
        {
            url: '/api/game/:gameId'
        }
    ];
function updateGameMutationOptions(config = {}) {
    const mutationKey = updateGameMutationKey();
    return react_query_mutationOptions({
        mutationKey,
        mutationFn: async ({ gameId, data })=>updateGame({
                gameId,
                data
            }, config)
    });
}
function useUpdateGame(options = {}) {
    const { mutation = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...mutationOptions } = mutation;
    const mutationKey = mutationOptions.mutationKey ?? updateGameMutationKey();
    const baseOptions = updateGameMutationOptions(config);
    return useMutation({
        ...baseOptions,
        mutationKey,
        ...mutationOptions
    }, queryClient);
}
function getGetUserInfoUrl() {
    const res = {
        method: 'GET',
        url: "/api/ui/user/info"
    };
    return res;
}
async function getUserInfo(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getGetUserInfoUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const getUserInfoQueryKey = ()=>[
        {
            url: '/api/ui/user/info'
        }
    ];
function getUserInfoQueryOptions(config = {}) {
    const queryKey = getUserInfoQueryKey();
    return queryOptions({
        queryKey,
        queryFn: async ({ signal })=>getUserInfo({
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useGetUserInfo(options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? getUserInfoQueryKey();
    const query = useQuery({
        ...getUserInfoQueryOptions(config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function getListNotificationsUrl() {
    const res = {
        method: 'GET',
        url: "/api/ui/notifications"
    };
    return res;
}
async function listNotifications({ params } = {}, config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getListNotificationsUrl().url.toString(),
        params,
        ...requestConfig
    });
    return res.data;
}
const listNotificationsQueryKey = (params)=>[
        {
            url: '/api/ui/notifications'
        },
        ...params ? [
            params
        ] : []
    ];
function listNotificationsQueryOptions({ params } = {}, config = {}) {
    const queryKey = listNotificationsQueryKey(params);
    return queryOptions({
        queryKey,
        queryFn: async ({ signal })=>listNotifications({
                params: params
            }, {
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useListNotifications({ params } = {}, options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? listNotificationsQueryKey(params);
    const query = useQuery({
        ...listNotificationsQueryOptions({
            params
        }, config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function getListenEventsUrl() {
    const res = {
        method: 'GET',
        url: "/api/ui/events"
    };
    return res;
}
async function listenEvents(config = {}) {
    const { client: request = http, ...requestConfig } = config;
    const res = await request({
        method: "GET",
        url: getListenEventsUrl().url.toString(),
        ...requestConfig
    });
    return res.data;
}
const listenEventsQueryKey = ()=>[
        {
            url: '/api/ui/events'
        }
    ];
function listenEventsQueryOptions(config = {}) {
    const queryKey = listenEventsQueryKey();
    return queryOptions({
        queryKey,
        queryFn: async ({ signal })=>listenEvents({
                ...config,
                signal: config.signal ?? signal
            })
    });
}
function useListenEvents(options = {}) {
    const { query: queryConfig = {}, client: config = {} } = options ?? {};
    const { client: queryClient, ...resolvedOptions } = queryConfig;
    const queryKey = resolvedOptions?.queryKey ?? listenEventsQueryKey();
    const query = useQuery({
        ...listenEventsQueryOptions(config),
        ...resolvedOptions,
        queryKey
    }, queryClient);
    query.queryKey = queryKey;
    return query;
}
function Authentication() {
    return {
        authGet: authGet,
        authPost: authPost,
        requestPasswordReset: requestPasswordReset,
        resetPassword: resetPassword,
        signIn: signIn,
        signUp: signUp
    };
}
function Game() {
    return {
        createGame: createGame,
        listGames: listGames,
        deleteGame: deleteGame,
        getGame: getGame,
        updateGame: updateGame
    };
}
function Ui() {
    return {
        getUserInfo: getUserInfo,
        listNotifications: listNotifications,
        listenEvents: listenEvents
    };
}
const operations_operations = {
    AuthGet: {
        path: "/api/authentication/*",
        method: "get"
    },
    AuthPost: {
        path: "/api/authentication/*",
        method: "post"
    },
    RequestPasswordReset: {
        path: "/api/authentication/req-password-reset",
        method: "post"
    },
    ResetPassword: {
        path: "/api/authentication/reset-pass",
        method: "post"
    },
    SignIn: {
        path: "/api/authentication/sign-in",
        method: "post"
    },
    SignUp: {
        path: "/api/authentication/sign-up",
        method: "post"
    },
    CreateGame: {
        path: "/api/game/",
        method: "post"
    },
    ListGames: {
        path: "/api/game/",
        method: "get"
    },
    DeleteGame: {
        path: "/api/game/:gameId",
        method: "delete"
    },
    GetGame: {
        path: "/api/game/:gameId",
        method: "get"
    },
    UpdateGame: {
        path: "/api/game/:gameId",
        method: "patch"
    },
    GetUserInfo: {
        path: "/api/ui/user/info",
        method: "get"
    },
    ListNotifications: {
        path: "/api/ui/notifications",
        method: "get"
    },
    ListenEvents: {
        path: "/api/ui/events",
        method: "get"
    }
};
var types_ApiErrors_ApiErrorsEnum = /*#__PURE__*/ function(ApiErrorsEnum) {
    ApiErrorsEnum["ACCOUNT_NOT_FOUND"] = "ACCOUNT_NOT_FOUND";
    ApiErrorsEnum["ASYNC_VALIDATION_NOT_SUPPORTED"] = "ASYNC_VALIDATION_NOT_SUPPORTED";
    ApiErrorsEnum["BODY_MUST_BE_AN_OBJECT"] = "BODY_MUST_BE_AN_OBJECT";
    ApiErrorsEnum["CALLBACK_URL_REQUIRED"] = "CALLBACK_URL_REQUIRED";
    ApiErrorsEnum["CANNOT_CONVERT_INPUT"] = "CANNOT_CONVERT_INPUT";
    ApiErrorsEnum["COMMAND_HANDLER_NOT_FOUND"] = "COMMAND_HANDLER_NOT_FOUND";
    ApiErrorsEnum["COMMAND_QUEUE_NOT_FOUND"] = "COMMAND_QUEUE_NOT_FOUND";
    ApiErrorsEnum["CREDENTIAL_ACCOUNT_NOT_FOUND"] = "CREDENTIAL_ACCOUNT_NOT_FOUND";
    ApiErrorsEnum["CROSS_SITE_NAVIGATION_LOGIN_BLOCKED"] = "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED";
    ApiErrorsEnum["EMAIL_ALREADY_VERIFIED"] = "EMAIL_ALREADY_VERIFIED";
    ApiErrorsEnum["EMAIL_CAN_NOT_BE_UPDATED"] = "EMAIL_CAN_NOT_BE_UPDATED";
    ApiErrorsEnum["EMAIL_MISMATCH"] = "EMAIL_MISMATCH";
    ApiErrorsEnum["EMAIL_NOT_VERIFIED"] = "EMAIL_NOT_VERIFIED";
    ApiErrorsEnum["ENTITY_NOT_FOUND_WHILE_SAVING"] = "ENTITY_NOT_FOUND_WHILE_SAVING";
    ApiErrorsEnum["FAILED_TO_CREATE_SESSION"] = "FAILED_TO_CREATE_SESSION";
    ApiErrorsEnum["FAILED_TO_CREATE_USER"] = "FAILED_TO_CREATE_USER";
    ApiErrorsEnum["FAILED_TO_CREATE_VERIFICATION"] = "FAILED_TO_CREATE_VERIFICATION";
    ApiErrorsEnum["FAILED_TO_GET_SESSION"] = "FAILED_TO_GET_SESSION";
    ApiErrorsEnum["FAILED_TO_GET_USER_INFO"] = "FAILED_TO_GET_USER_INFO";
    ApiErrorsEnum["FAILED_TO_UNLINK_LAST_ACCOUNT"] = "FAILED_TO_UNLINK_LAST_ACCOUNT";
    ApiErrorsEnum["FAILED_TO_UPDATE_USER"] = "FAILED_TO_UPDATE_USER";
    ApiErrorsEnum["FIELD_NOT_ALLOWED"] = "FIELD_NOT_ALLOWED";
    ApiErrorsEnum["GAME_NOT_FOUND"] = "GAME_NOT_FOUND";
    ApiErrorsEnum["GAME_TITLE_ALREADY_EXISTS"] = "GAME_TITLE_ALREADY_EXISTS";
    ApiErrorsEnum["GAME_TITLE_REQUIRED"] = "GAME_TITLE_REQUIRED";
    ApiErrorsEnum["HANDLER_NOT_BOUND"] = "HANDLER_NOT_BOUND";
    ApiErrorsEnum["ID_TOKEN_NOT_SUPPORTED"] = "ID_TOKEN_NOT_SUPPORTED";
    ApiErrorsEnum["INVALIDATED_AUTH_TOKEN"] = "INVALIDATED_AUTH_TOKEN";
    ApiErrorsEnum["INVALID_ADDRESS"] = "INVALID_ADDRESS";
    ApiErrorsEnum["INVALID_AUTH_TOKEN"] = "INVALID_AUTH_TOKEN";
    ApiErrorsEnum["INVALID_BIRTH_DATE"] = "INVALID_BIRTH_DATE";
    ApiErrorsEnum["INVALID_CALLBACK_URL"] = "INVALID_CALLBACK_URL";
    ApiErrorsEnum["INVALID_CNPJ"] = "INVALID_CNPJ";
    ApiErrorsEnum["INVALID_CONTROLLER_EXAMPLES"] = "INVALID_CONTROLLER_EXAMPLES";
    ApiErrorsEnum["INVALID_CPF"] = "INVALID_CPF";
    ApiErrorsEnum["INVALID_DOCUMENT"] = "INVALID_DOCUMENT";
    ApiErrorsEnum["INVALID_EMAIL"] = "INVALID_EMAIL";
    ApiErrorsEnum["INVALID_EMAIL_OR_PASSWORD"] = "INVALID_EMAIL_OR_PASSWORD";
    ApiErrorsEnum["INVALID_ENTITY"] = "INVALID_ENTITY";
    ApiErrorsEnum["INVALID_ERROR_CALLBACK_URL"] = "INVALID_ERROR_CALLBACK_URL";
    ApiErrorsEnum["INVALID_GAME_GENRE"] = "INVALID_GAME_GENRE";
    ApiErrorsEnum["INVALID_ID"] = "INVALID_ID";
    ApiErrorsEnum["INVALID_ID_VALUES_LENGTH"] = "INVALID_ID_VALUES_LENGTH";
    ApiErrorsEnum["INVALID_IMAGE_URL"] = "INVALID_IMAGE_URL";
    ApiErrorsEnum["INVALID_MONEY"] = "INVALID_MONEY";
    ApiErrorsEnum["INVALID_NAME"] = "INVALID_NAME";
    ApiErrorsEnum["INVALID_NEW_USER_CALLBACK_URL"] = "INVALID_NEW_USER_CALLBACK_URL";
    ApiErrorsEnum["INVALID_ORIGIN"] = "INVALID_ORIGIN";
    ApiErrorsEnum["INVALID_OUTBOX_PAYLOAD"] = "INVALID_OUTBOX_PAYLOAD";
    ApiErrorsEnum["INVALID_PASSWORD"] = "INVALID_PASSWORD";
    ApiErrorsEnum["INVALID_PHONE"] = "INVALID_PHONE";
    ApiErrorsEnum["INVALID_RANGE"] = "INVALID_RANGE";
    ApiErrorsEnum["INVALID_REDIRECT_URL"] = "INVALID_REDIRECT_URL";
    ApiErrorsEnum["INVALID_RELEASE_YEAR"] = "INVALID_RELEASE_YEAR";
    ApiErrorsEnum["INVALID_RG"] = "INVALID_RG";
    ApiErrorsEnum["INVALID_ROLE"] = "INVALID_ROLE";
    ApiErrorsEnum["INVALID_TOKEN"] = "INVALID_TOKEN";
    ApiErrorsEnum["INVALID_USER"] = "INVALID_USER";
    ApiErrorsEnum["INVALID_ZIP_CODE"] = "INVALID_ZIP_CODE";
    ApiErrorsEnum["LINKED_ACCOUNT_ALREADY_EXISTS"] = "LINKED_ACCOUNT_ALREADY_EXISTS";
    ApiErrorsEnum["METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED"] = "METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED";
    ApiErrorsEnum["MISSING_ENVIRONMENT_VARIABLE"] = "MISSING_ENVIRONMENT_VARIABLE";
    ApiErrorsEnum["MISSING_FIELD"] = "MISSING_FIELD";
    ApiErrorsEnum["MISSING_LOG_CONTENT"] = "MISSING_LOG_CONTENT";
    ApiErrorsEnum["MISSING_OR_NULL_ORIGIN"] = "MISSING_OR_NULL_ORIGIN";
    ApiErrorsEnum["NOT_FOUND"] = "NOT_FOUND";
    ApiErrorsEnum["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    ApiErrorsEnum["ONBOARDING_ALREADY_COMPLETED"] = "ONBOARDING_ALREADY_COMPLETED";
    ApiErrorsEnum["ONBOARDING_NOT_COMPLETED"] = "ONBOARDING_NOT_COMPLETED";
    ApiErrorsEnum["ONBOARDING_NOT_FOUND"] = "ONBOARDING_NOT_FOUND";
    ApiErrorsEnum["OPTIMISTIC_LOCK_CONFLICT"] = "OPTIMISTIC_LOCK_CONFLICT";
    ApiErrorsEnum["PASSWORDS_DONT_MATCH"] = "PASSWORDS_DONT_MATCH";
    ApiErrorsEnum["PASSWORD_ALREADY_SET"] = "PASSWORD_ALREADY_SET";
    ApiErrorsEnum["PASSWORD_TOO_LONG"] = "PASSWORD_TOO_LONG";
    ApiErrorsEnum["PASSWORD_TOO_SHORT"] = "PASSWORD_TOO_SHORT";
    ApiErrorsEnum["PROVIDER_NOT_FOUND"] = "PROVIDER_NOT_FOUND";
    ApiErrorsEnum["SESSION_EXPIRED"] = "SESSION_EXPIRED";
    ApiErrorsEnum["SESSION_NOT_FRESH"] = "SESSION_NOT_FRESH";
    ApiErrorsEnum["SOCIAL_ACCOUNT_ALREADY_LINKED"] = "SOCIAL_ACCOUNT_ALREADY_LINKED";
    ApiErrorsEnum["TOKEN_EXPIRED"] = "TOKEN_EXPIRED";
    ApiErrorsEnum["UNAUTHORIZED"] = "UNAUTHORIZED";
    ApiErrorsEnum["USER_ALREADY_EXISTS"] = "USER_ALREADY_EXISTS";
    ApiErrorsEnum["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"] = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
    ApiErrorsEnum["USER_ALREADY_HAS_PASSWORD"] = "USER_ALREADY_HAS_PASSWORD";
    ApiErrorsEnum["USER_EMAIL_NOT_FOUND"] = "USER_EMAIL_NOT_FOUND";
    ApiErrorsEnum["USER_NOT_FOUND"] = "USER_NOT_FOUND";
    ApiErrorsEnum["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ApiErrorsEnum["VERIFICATION_EMAIL_NOT_ENABLED"] = "VERIFICATION_EMAIL_NOT_ENABLED";
    return ApiErrorsEnum;
}({});
var types_GameGenre_GameGenreEnum = /*#__PURE__*/ function(GameGenreEnum) {
    GameGenreEnum["ACTION"] = "ACTION";
    GameGenreEnum["ADVENTURE"] = "ADVENTURE";
    GameGenreEnum["RPG"] = "RPG";
    GameGenreEnum["STRATEGY"] = "STRATEGY";
    GameGenreEnum["PUZZLE"] = "PUZZLE";
    GameGenreEnum["SPORTS"] = "SPORTS";
    GameGenreEnum["SIMULATION"] = "SIMULATION";
    GameGenreEnum["OTHER"] = "OTHER";
    return GameGenreEnum;
}({});
var types_Language_LanguageEnum = /*#__PURE__*/ function(LanguageEnum) {
    LanguageEnum["PT"] = "PT";
    LanguageEnum["EN"] = "EN";
    LanguageEnum["ES"] = "ES";
    LanguageEnum["FR"] = "FR";
    LanguageEnum["IT"] = "IT";
    LanguageEnum["DE"] = "DE";
    LanguageEnum["GA"] = "GA";
    return LanguageEnum;
}({});
var types_NotificationLevel_NotificationLevelEnum = /*#__PURE__*/ function(NotificationLevelEnum) {
    NotificationLevelEnum["INFO"] = "INFO";
    NotificationLevelEnum["WARNING"] = "WARNING";
    NotificationLevelEnum["ERROR"] = "ERROR";
    NotificationLevelEnum["SUCCESS"] = "SUCCESS";
    return NotificationLevelEnum;
}({});
const authGet200Schema = z.any();
const authGetQueryResponseSchema = z.lazy(()=>authGet200Schema);
const authPost200Schema = z.any();
const authPostMutationResponseSchema = z.lazy(()=>authPost200Schema);
const requestPasswordReset200Schema = z.any();
const requestPasswordResetMutationRequestSchema = z.object({
    email: z.email(),
    redirectTo: z.optional(z.url())
});
const requestPasswordResetMutationResponseSchema = z.lazy(()=>requestPasswordReset200Schema);
const resetPasswordBodySchema = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8).max(32),
    confirmNewPassword: z.string().min(8).max(32)
}).refine((data)=>data.newPassword === data.confirmNewPassword, {
    error: "PASSWORDS_DONT_MATCH",
    path: [
        "confirmNewPassword"
    ]
});
const resetPassword200Schema = z.any();
const resetPasswordMutationRequestSchema = z.lazy(()=>resetPasswordBodySchema);
const resetPasswordMutationResponseSchema = z.lazy(()=>resetPassword200Schema);
const signIn200Schema = z.object({
    session: z.object({
        id: z.string(),
        expiresAt: z.date(),
        token: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        ipAddress: z.optional(z.string()),
        userAgent: z.optional(z.string()),
        userId: z.string()
    }),
    user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        emailVerified: z.boolean(),
        image: z.optional(z.union([
            z.string(),
            z["null"]()
        ])),
        createdAt: z.date(),
        updatedAt: z.date()
    })
});
const signInMutationRequestSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(64)
});
const signInMutationResponseSchema = z.lazy(()=>signIn200Schema);
const languageSchema = z["enum"](types_Language_LanguageEnum);
const signUpBodySchema = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string().min(8).max(64),
    confirmPassword: z.string().min(8).max(64),
    get language () {
        return languageSchema.optional();
    }
}).refine((data)=>data.password === data.confirmPassword, {
    error: "PASSWORDS_DONT_MATCH",
    path: [
        "confirmPassword"
    ]
});
const signUp200Schema = z.any();
const signUpMutationRequestSchema = z.lazy(()=>signUpBodySchema);
const signUpMutationResponseSchema = z.lazy(()=>signUp200Schema);
const gameGenreSchema = z["enum"](types_GameGenre_GameGenreEnum);
const createGame200Schema = z.object({
    gameId: z.string()
});
const createGameMutationRequestSchema = z.object({
    title: z.string().min(1).max(200),
    get genre () {
        return gameGenreSchema;
    },
    releaseYear: z.int().min(1950).max(2026),
    imageUrl: z.optional(z.union([
        z.url(),
        z["null"]()
    ]))
});
const createGameMutationResponseSchema = z.lazy(()=>createGame200Schema);
const deleteGamePathParamsSchema = z.object({
    gameId: z.string()
});
const deleteGame200Schema = z.any();
const deleteGameMutationResponseSchema = z.lazy(()=>deleteGame200Schema);
const getGamePathParamsSchema = z.object({
    gameId: z.string()
});
const getGame200Schema = z.object({
    id: z.string(),
    title: z.string(),
    get genre () {
        return gameGenreSchema;
    },
    releaseYear: z.number(),
    imageUrl: z.union([
        z.string(),
        z["null"]()
    ]),
    ownerId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date()
});
const getGameQueryResponseSchema = z.lazy(()=>getGame200Schema);
const listGames200Schema = z.object({
    items: z.array(z.object({
        id: z.string(),
        title: z.string(),
        get genre () {
            return gameGenreSchema;
        },
        releaseYear: z.number(),
        imageUrl: z.union([
            z.string(),
            z["null"]()
        ]),
        ownerId: z.string(),
        createdAt: z.date(),
        updatedAt: z.date()
    }))
});
const listGamesQueryResponseSchema = z.lazy(()=>listGames200Schema);
const updateGamePathParamsSchema = z.object({
    gameId: z.string()
});
const updateGame200Schema = z.object({
    gameId: z.string()
});
const updateGameMutationRequestSchema = z.object({
    title: z.optional(z.string().min(1).max(200)),
    get genre () {
        return gameGenreSchema.optional();
    },
    releaseYear: z.optional(z.int().min(1950).max(2026)),
    imageUrl: z.optional(z.union([
        z.url(),
        z["null"]()
    ]))
});
const updateGameMutationResponseSchema = z.lazy(()=>updateGame200Schema);
const getUserInfo200Schema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    picture: z.union([
        z.string(),
        z["null"]()
    ])
});
const getUserInfoQueryResponseSchema = z.lazy(()=>getUserInfo200Schema);
const notificationLevelSchema = z["enum"](types_NotificationLevel_NotificationLevelEnum);
const listNotificationsQueryParamsSchema = z.object({
    page: z.coerce.number().int().min(1).max(9007199254740991).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.optional(z.string())
});
const listNotifications200Schema = z.object({
    items: z.array(z.object({
        title: z.string(),
        content: z.string(),
        createdAt: z.date(),
        get level () {
            return notificationLevelSchema;
        }
    })),
    total: z.number(),
    totalPages: z.number()
});
const listNotificationsQueryResponseSchema = z.lazy(()=>listNotifications200Schema);
const listenEventsOutputIntegrationGameCreatedSchema = z.object({
    ownerId: z.string(),
    payload: z.object({
        gameId: z.string(),
        title: z.string(),
        ownerId: z.string()
    }),
    name: z.literal("integration.game.created")
});
const listenEvents200Schema = z.lazy(()=>listenEventsOutputIntegrationGameCreatedSchema).and(z.object({
    name: z.literal("integration.game.created")
}));
const listenEventsQueryResponseSchema = z.lazy(()=>listenEvents200Schema);
const listenEventsQueryResponse = {
    "INTEGRATION.GAME.CREATED": listenEventsOutputIntegrationGameCreatedSchema
};
const apiErrorsSchema = z["enum"](types_ApiErrors_ApiErrorsEnum).describe("All possible error codes");
export { api_namespaceObject as api, app_namespaceObject as app, http_namespaceObject as http };
