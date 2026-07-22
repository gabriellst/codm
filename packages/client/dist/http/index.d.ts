declare const configureClient: (newConfig: Partial<import("./config").ClientConfig>) => void, getConfig: () => Readonly<import("./config").ClientConfig>, resetConfig: () => void;
export { configureClient, getConfig, resetConfig };
export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formData';
export type RetryConfig = {
    /** Maximum number of retry attempts (default: 2) */
    limit?: number;
    /** HTTP methods to retry (default: ['get', 'put', 'head', 'delete', 'options', 'trace']) */
    methods?: Array<'get' | 'put' | 'patch' | 'post' | 'delete' | 'head' | 'options' | 'trace'>;
    /** Status codes that trigger a retry (default: [408, 413, 429, 500, 502, 503, 504]) */
    statusCodes?: number[];
    /** Max delay between retries in ms (default: undefined) */
    backoffLimit?: number;
    /** Whether to retry on timeout (default: false) */
    retryOnTimeout?: boolean;
    /** Custom delay function (attemptCount) => delay in ms */
    delay?: (attemptCount: number) => number;
    /** Enable jitter to prevent thundering herd */
    jitter?: boolean | ((delay: number) => number);
};
export type RequestConfig<TData = unknown> = {
    url: string;
    method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';
    params?: object;
    data?: TData | FormData | Blob | File | ArrayBuffer | ArrayBufferView | ReadableStream;
    responseType?: ResponseType;
    signal?: AbortSignal;
    headers?: HeadersInit;
    /** Retry configuration (number for simple limit, object for advanced config, false to disable) */
    retry?: number | RetryConfig | false;
    /** Request timeout in ms (default: 10000, false to disable) */
    timeout?: number | false;
};
export type ResponseConfig<TData = unknown> = {
    data: TData;
    status: number;
    statusText: string;
};
export type ResponseErrorConfig<TError = unknown> = {
    data: TError;
    status: number;
    statusText: string;
};
export declare const client: <TData, TError = unknown, TVariables = unknown>(config: RequestConfig<TVariables>) => Promise<ResponseConfig<TData>>;
export type Client = typeof client;
export default client;
