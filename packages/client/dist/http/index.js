import ky, { HTTPError } from "ky";
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
export { client, http_configureClient as configureClient, http as default, http_getConfig as getConfig, http_resetConfig as resetConfig };
