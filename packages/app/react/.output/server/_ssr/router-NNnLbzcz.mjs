import { b as QueryClient, c as MutationCache, d as QueryCache } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, d as createRootRouteWithContext, H as HeadContent, S as Scripts, O as Outlet, e as createFileRoute, l as lazyRouteComponent, a as useRouter } from "../_libs/tanstack__react-router.mjs";
import { C as redirect } from "../_libs/tanstack__router-core.mjs";
import { i as instance } from "../_libs/i18next.mjs";
import { t as toast, T as Toaster$1 } from "../_libs/sonner.mjs";
import { c as clsx } from "../_libs/clsx.mjs";
import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { R as ReactQueryDevtools2 } from "../_libs/tanstack__react-query-devtools.mjs";
import { T as TanStackRouterDevtools } from "../_libs/@tanstack/react-router-devtools+[...].mjs";
import { i as initReactI18next, u as useTranslation } from "../_libs/react-i18next.mjs";
import { B as Button$1 } from "../_libs/base-ui__react.mjs";
import { A as IconAlertTriangle, B as IconLoader, C as IconAlertOctagon, D as IconInfoCircle, E as IconCircleCheck } from "../_libs/tabler__icons-react.mjs";
import { _ as _enum, o as object, s as string, l as lazy, u as uuid, a as union, b as literal, c as optional, d as array, e as boolean, n as number, i as int, f as nullable, g as datetime, h as email, j as any, k as url, m as config } from "../_libs/zod.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
const SYMBOL = /* @__PURE__ */ Symbol.for("@codedm/client-typescript:baseUrls");
const globalRegistry = globalThis;
function registry() {
  if (!globalRegistry[SYMBOL]) globalRegistry[SYMBOL] = {};
  return globalRegistry[SYMBOL];
}
function configureClient(baseUrls) {
  Object.assign(registry(), baseUrls);
}
function getBaseUrl(service) {
  return registry()[service];
}
function resolveURL(service, url2, baseUrlOverride) {
  const base = baseUrlOverride ?? getBaseUrl(service);
  if (!base) return url2;
  let path;
  try {
    const parsed = new URL(url2);
    path = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    path = url2;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base.replace(/\/$/, "")}${path}`;
}
class HTTPError extends Error {
  response;
  request;
  options;
  constructor(response, request, options) {
    const code = response.status || response.status === 0 ? response.status : "";
    const title = response.statusText ?? "";
    const status = `${code} ${title}`.trim();
    const reason = status ? `status code ${status}` : "an unknown error";
    super(`Request failed with ${reason}: ${request.method} ${request.url}`);
    this.name = "HTTPError";
    this.response = response;
    this.request = request;
    this.options = options;
  }
}
class NonError extends Error {
  name = "NonError";
  value;
  constructor(value) {
    let message = "Non-error value was thrown";
    try {
      if (typeof value === "string") {
        message = value;
      } else if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
        message = value.message;
      }
    } catch {
    }
    super(message);
    this.value = value;
  }
}
class ForceRetryError extends Error {
  name = "ForceRetryError";
  customDelay;
  code;
  customRequest;
  constructor(options) {
    const cause = options?.cause ? options.cause instanceof Error ? options.cause : new NonError(options.cause) : void 0;
    super(options?.code ? `Forced retry: ${options.code}` : "Forced retry", cause ? { cause } : void 0);
    this.customDelay = options?.delay;
    this.code = options?.code;
    this.customRequest = options?.request;
  }
}
const supportsRequestStreams = (() => {
  let duplexAccessed = false;
  let hasContentType = false;
  const supportsReadableStream = typeof globalThis.ReadableStream === "function";
  const supportsRequest = typeof globalThis.Request === "function";
  if (supportsReadableStream && supportsRequest) {
    try {
      hasContentType = new globalThis.Request("https://empty.invalid", {
        body: new globalThis.ReadableStream(),
        method: "POST",
        // @ts-expect-error - Types are outdated.
        get duplex() {
          duplexAccessed = true;
          return "half";
        }
      }).headers.has("Content-Type");
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported BodyInit type") {
        return false;
      }
      throw error;
    }
  }
  return duplexAccessed && !hasContentType;
})();
const supportsAbortController = typeof globalThis.AbortController === "function";
const supportsAbortSignal = typeof globalThis.AbortSignal === "function" && typeof globalThis.AbortSignal.any === "function";
const supportsResponseStreams = typeof globalThis.ReadableStream === "function";
const supportsFormData = typeof globalThis.FormData === "function";
const requestMethods = ["get", "post", "put", "patch", "head", "delete"];
const responseTypes = {
  json: "application/json",
  text: "text/*",
  formData: "multipart/form-data",
  arrayBuffer: "*/*",
  blob: "*/*",
  // Supported in modern Fetch implementations (for example, browsers and recent Node.js/undici).
  // We still feature-check at runtime before exposing the shortcut.
  bytes: "*/*"
};
const maxSafeTimeout = 2147483647;
const usualFormBoundarySize = new TextEncoder().encode("------WebKitFormBoundaryaxpyiPgbbPti10Rw").length;
const stop = /* @__PURE__ */ Symbol("stop");
class RetryMarker {
  options;
  constructor(options) {
    this.options = options;
  }
}
const retry = (options) => new RetryMarker(options);
const kyOptionKeys = {
  json: true,
  parseJson: true,
  stringifyJson: true,
  searchParams: true,
  prefixUrl: true,
  retry: true,
  timeout: true,
  hooks: true,
  throwHttpErrors: true,
  onDownloadProgress: true,
  onUploadProgress: true,
  fetch: true,
  context: true
};
const vendorSpecificOptions = {
  next: true
  // Next.js cache revalidation (revalidate, tags)
};
const requestOptionsRegistry = {
  method: true,
  headers: true,
  body: true,
  mode: true,
  credentials: true,
  cache: true,
  redirect: true,
  referrer: true,
  referrerPolicy: true,
  integrity: true,
  keepalive: true,
  signal: true,
  window: true,
  duplex: true
};
const getBodySize = (body) => {
  if (!body) {
    return 0;
  }
  if (body instanceof FormData) {
    let size = 0;
    for (const [key, value] of body) {
      size += usualFormBoundarySize;
      size += new TextEncoder().encode(`Content-Disposition: form-data; name="${key}"`).length;
      size += typeof value === "string" ? new TextEncoder().encode(value).length : value.size;
    }
    return size;
  }
  if (body instanceof Blob) {
    return body.size;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (typeof body === "string") {
    return new TextEncoder().encode(body).length;
  }
  if (body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).length;
  }
  if ("byteLength" in body) {
    return body.byteLength;
  }
  if (typeof body === "object" && body !== null) {
    try {
      const jsonString = JSON.stringify(body);
      return new TextEncoder().encode(jsonString).length;
    } catch {
      return 0;
    }
  }
  return 0;
};
const withProgress = (stream, totalBytes, onProgress) => {
  let previousChunk;
  let transferredBytes = 0;
  return stream.pipeThrough(new TransformStream({
    transform(currentChunk, controller) {
      controller.enqueue(currentChunk);
      if (previousChunk) {
        transferredBytes += previousChunk.byteLength;
        let percent = totalBytes === 0 ? 0 : transferredBytes / totalBytes;
        if (percent >= 1) {
          percent = 1 - Number.EPSILON;
        }
        onProgress?.({ percent, totalBytes: Math.max(totalBytes, transferredBytes), transferredBytes }, previousChunk);
      }
      previousChunk = currentChunk;
    },
    flush() {
      if (previousChunk) {
        transferredBytes += previousChunk.byteLength;
        onProgress?.({ percent: 1, totalBytes: Math.max(totalBytes, transferredBytes), transferredBytes }, previousChunk);
      }
    }
  }));
};
const streamResponse = (response, onDownloadProgress) => {
  if (!response.body) {
    return response;
  }
  if (response.status === 204) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  const totalBytes = Math.max(0, Number(response.headers.get("content-length")) || 0);
  return new Response(withProgress(response.body, totalBytes, onDownloadProgress), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};
const streamRequest = (request, onUploadProgress, originalBody) => {
  if (!request.body) {
    return request;
  }
  const totalBytes = getBodySize(originalBody ?? request.body);
  return new Request(request, {
    // @ts-expect-error - Types are outdated.
    duplex: "half",
    body: withProgress(request.body, totalBytes, onUploadProgress)
  });
};
const isObject = (value) => value !== null && typeof value === "object";
const validateAndMerge = (...sources) => {
  for (const source of sources) {
    if ((!isObject(source) || Array.isArray(source)) && source !== void 0) {
      throw new TypeError("The `options` argument must be an object");
    }
  }
  return deepMerge({}, ...sources);
};
const mergeHeaders = (source1 = {}, source2 = {}) => {
  const result = new globalThis.Headers(source1);
  const isHeadersInstance = source2 instanceof globalThis.Headers;
  const source = new globalThis.Headers(source2);
  for (const [key, value] of source.entries()) {
    if (isHeadersInstance && value === "undefined" || value === void 0) {
      result.delete(key);
    } else {
      result.set(key, value);
    }
  }
  return result;
};
function newHookValue(original, incoming, property) {
  return Object.hasOwn(incoming, property) && incoming[property] === void 0 ? [] : deepMerge(original[property] ?? [], incoming[property] ?? []);
}
const mergeHooks = (original = {}, incoming = {}) => ({
  beforeRequest: newHookValue(original, incoming, "beforeRequest"),
  beforeRetry: newHookValue(original, incoming, "beforeRetry"),
  afterResponse: newHookValue(original, incoming, "afterResponse"),
  beforeError: newHookValue(original, incoming, "beforeError")
});
const appendSearchParameters = (target, source) => {
  const result = new URLSearchParams();
  for (const input of [target, source]) {
    if (input === void 0) {
      continue;
    }
    if (input instanceof URLSearchParams) {
      for (const [key, value] of input.entries()) {
        result.append(key, value);
      }
    } else if (Array.isArray(input)) {
      for (const pair of input) {
        if (!Array.isArray(pair) || pair.length !== 2) {
          throw new TypeError("Array search parameters must be provided in [[key, value], ...] format");
        }
        result.append(String(pair[0]), String(pair[1]));
      }
    } else if (isObject(input)) {
      for (const [key, value] of Object.entries(input)) {
        if (value !== void 0) {
          result.append(key, String(value));
        }
      }
    } else {
      const parameters = new URLSearchParams(input);
      for (const [key, value] of parameters.entries()) {
        result.append(key, value);
      }
    }
  }
  return result;
};
const deepMerge = (...sources) => {
  let returnValue = {};
  let headers = {};
  let hooks = {};
  let searchParameters;
  const signals = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      if (!Array.isArray(returnValue)) {
        returnValue = [];
      }
      returnValue = [...returnValue, ...source];
    } else if (isObject(source)) {
      for (let [key, value] of Object.entries(source)) {
        if (key === "signal" && value instanceof globalThis.AbortSignal) {
          signals.push(value);
          continue;
        }
        if (key === "context") {
          if (value !== void 0 && value !== null && (!isObject(value) || Array.isArray(value))) {
            throw new TypeError("The `context` option must be an object");
          }
          returnValue = {
            ...returnValue,
            context: value === void 0 || value === null ? {} : { ...returnValue.context, ...value }
          };
          continue;
        }
        if (key === "searchParams") {
          if (value === void 0 || value === null) {
            searchParameters = void 0;
          } else {
            searchParameters = searchParameters === void 0 ? value : appendSearchParameters(searchParameters, value);
          }
          continue;
        }
        if (isObject(value) && key in returnValue) {
          value = deepMerge(returnValue[key], value);
        }
        returnValue = { ...returnValue, [key]: value };
      }
      if (isObject(source.hooks)) {
        hooks = mergeHooks(hooks, source.hooks);
        returnValue.hooks = hooks;
      }
      if (isObject(source.headers)) {
        headers = mergeHeaders(headers, source.headers);
        returnValue.headers = headers;
      }
    }
  }
  if (searchParameters !== void 0) {
    returnValue.searchParams = searchParameters;
  }
  if (signals.length > 0) {
    if (signals.length === 1) {
      returnValue.signal = signals[0];
    } else if (supportsAbortSignal) {
      returnValue.signal = AbortSignal.any(signals);
    } else {
      returnValue.signal = signals.at(-1);
    }
  }
  return returnValue;
};
const normalizeRequestMethod = (input) => requestMethods.includes(input) ? input.toUpperCase() : input;
const retryMethods = ["get", "put", "head", "delete", "options", "trace"];
const retryStatusCodes = [408, 413, 429, 500, 502, 503, 504];
const retryAfterStatusCodes = [413, 429, 503];
const defaultRetryOptions = {
  limit: 2,
  methods: retryMethods,
  statusCodes: retryStatusCodes,
  afterStatusCodes: retryAfterStatusCodes,
  maxRetryAfter: Number.POSITIVE_INFINITY,
  backoffLimit: Number.POSITIVE_INFINITY,
  delay: (attemptCount) => 0.3 * 2 ** (attemptCount - 1) * 1e3,
  jitter: void 0,
  retryOnTimeout: false
};
const normalizeRetryOptions = (retry2 = {}) => {
  if (typeof retry2 === "number") {
    return {
      ...defaultRetryOptions,
      limit: retry2
    };
  }
  if (retry2.methods && !Array.isArray(retry2.methods)) {
    throw new Error("retry.methods must be an array");
  }
  retry2.methods &&= retry2.methods.map((method) => method.toLowerCase());
  if (retry2.statusCodes && !Array.isArray(retry2.statusCodes)) {
    throw new Error("retry.statusCodes must be an array");
  }
  const normalizedRetry = Object.fromEntries(Object.entries(retry2).filter(([, value]) => value !== void 0));
  return {
    ...defaultRetryOptions,
    ...normalizedRetry
  };
};
class TimeoutError extends Error {
  request;
  constructor(request) {
    super(`Request timed out: ${request.method} ${request.url}`);
    this.name = "TimeoutError";
    this.request = request;
  }
}
async function timeout(request, init, abortController, options) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (abortController) {
        abortController.abort();
      }
      reject(new TimeoutError(request));
    }, options.timeout);
    void options.fetch(request, init).then(resolve).catch(reject).then(() => {
      clearTimeout(timeoutId);
    });
  });
}
async function delay(ms, { signal }) {
  return new Promise((resolve, reject) => {
    if (signal) {
      signal.throwIfAborted();
      signal.addEventListener("abort", abortHandler, { once: true });
    }
    function abortHandler() {
      clearTimeout(timeoutId);
      reject(signal.reason);
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);
  });
}
const findUnknownOptions = (request, options) => {
  const unknownOptions = {};
  for (const key in options) {
    if (!Object.hasOwn(options, key)) {
      continue;
    }
    if (!(key in requestOptionsRegistry) && !(key in kyOptionKeys) && (!(key in request) || key in vendorSpecificOptions)) {
      unknownOptions[key] = options[key];
    }
  }
  return unknownOptions;
};
const hasSearchParameters = (search) => {
  if (search === void 0) {
    return false;
  }
  if (Array.isArray(search)) {
    return search.length > 0;
  }
  if (search instanceof URLSearchParams) {
    return search.size > 0;
  }
  if (typeof search === "object") {
    return Object.keys(search).length > 0;
  }
  if (typeof search === "string") {
    return search.trim().length > 0;
  }
  return Boolean(search);
};
function isHTTPError(error) {
  return error instanceof HTTPError || error?.name === HTTPError.name;
}
function isTimeoutError(error) {
  return error instanceof TimeoutError || error?.name === TimeoutError.name;
}
class Ky {
  static create(input, options) {
    const ky2 = new Ky(input, options);
    const function_ = async () => {
      if (typeof ky2.#options.timeout === "number" && ky2.#options.timeout > maxSafeTimeout) {
        throw new RangeError(`The \`timeout\` option cannot be greater than ${maxSafeTimeout}`);
      }
      await Promise.resolve();
      let response = await ky2.#fetch();
      for (const hook of ky2.#options.hooks.afterResponse) {
        const clonedResponse = ky2.#decorateResponse(response.clone());
        let modifiedResponse;
        try {
          modifiedResponse = await hook(ky2.request, ky2.#getNormalizedOptions(), clonedResponse, { retryCount: ky2.#retryCount });
        } catch (error) {
          ky2.#cancelResponseBody(clonedResponse);
          ky2.#cancelResponseBody(response);
          throw error;
        }
        if (modifiedResponse instanceof RetryMarker) {
          ky2.#cancelResponseBody(clonedResponse);
          ky2.#cancelResponseBody(response);
          throw new ForceRetryError(modifiedResponse.options);
        }
        const nextResponse = modifiedResponse instanceof globalThis.Response ? modifiedResponse : response;
        if (clonedResponse !== nextResponse) {
          ky2.#cancelResponseBody(clonedResponse);
        }
        if (response !== nextResponse) {
          ky2.#cancelResponseBody(response);
        }
        response = nextResponse;
      }
      ky2.#decorateResponse(response);
      if (!response.ok && (typeof ky2.#options.throwHttpErrors === "function" ? ky2.#options.throwHttpErrors(response.status) : ky2.#options.throwHttpErrors)) {
        let error = new HTTPError(response, ky2.request, ky2.#getNormalizedOptions());
        for (const hook of ky2.#options.hooks.beforeError) {
          error = await hook(error, { retryCount: ky2.#retryCount });
        }
        throw error;
      }
      if (ky2.#options.onDownloadProgress) {
        if (typeof ky2.#options.onDownloadProgress !== "function") {
          throw new TypeError("The `onDownloadProgress` option must be a function");
        }
        if (!supportsResponseStreams) {
          throw new Error("Streams are not supported in your environment. `ReadableStream` is missing.");
        }
        const progressResponse = response.clone();
        ky2.#cancelResponseBody(response);
        return streamResponse(progressResponse, ky2.#options.onDownloadProgress);
      }
      return response;
    };
    const result = ky2.#retry(function_).finally(() => {
      const originalRequest = ky2.#originalRequest;
      ky2.#cancelBody(originalRequest?.body ?? void 0);
      ky2.#cancelBody(ky2.request.body ?? void 0);
    });
    for (const [type, mimeType] of Object.entries(responseTypes)) {
      if (type === "bytes" && typeof globalThis.Response?.prototype?.bytes !== "function") {
        continue;
      }
      result[type] = async () => {
        ky2.request.headers.set("accept", ky2.request.headers.get("accept") || mimeType);
        const response = await result;
        if (type === "json") {
          if (response.status === 204) {
            return "";
          }
          const text = await response.text();
          if (text === "") {
            return "";
          }
          if (options.parseJson) {
            return options.parseJson(text);
          }
          return JSON.parse(text);
        }
        return response[type]();
      };
    }
    return result;
  }
  // eslint-disable-next-line unicorn/prevent-abbreviations
  static #normalizeSearchParams(searchParams) {
    if (searchParams && typeof searchParams === "object" && !Array.isArray(searchParams) && !(searchParams instanceof URLSearchParams)) {
      return Object.fromEntries(Object.entries(searchParams).filter(([, value]) => value !== void 0));
    }
    return searchParams;
  }
  request;
  #abortController;
  #retryCount = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-readonly -- False positive: #input is reassigned on line 202
  #input;
  #options;
  #originalRequest;
  #userProvidedAbortSignal;
  #cachedNormalizedOptions;
  // eslint-disable-next-line complexity
  constructor(input, options = {}) {
    this.#input = input;
    this.#options = {
      ...options,
      headers: mergeHeaders(this.#input.headers, options.headers),
      hooks: mergeHooks({
        beforeRequest: [],
        beforeRetry: [],
        beforeError: [],
        afterResponse: []
      }, options.hooks),
      method: normalizeRequestMethod(options.method ?? this.#input.method ?? "GET"),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      prefixUrl: String(options.prefixUrl || ""),
      retry: normalizeRetryOptions(options.retry),
      throwHttpErrors: options.throwHttpErrors ?? true,
      timeout: options.timeout ?? 1e4,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      context: options.context ?? {}
    };
    if (typeof this.#input !== "string" && !(this.#input instanceof URL || this.#input instanceof globalThis.Request)) {
      throw new TypeError("`input` must be a string, URL, or Request");
    }
    if (this.#options.prefixUrl && typeof this.#input === "string") {
      if (this.#input.startsWith("/")) {
        throw new Error("`input` must not begin with a slash when using `prefixUrl`");
      }
      if (!this.#options.prefixUrl.endsWith("/")) {
        this.#options.prefixUrl += "/";
      }
      this.#input = this.#options.prefixUrl + this.#input;
    }
    if (supportsAbortController && supportsAbortSignal) {
      this.#userProvidedAbortSignal = this.#options.signal ?? this.#input.signal;
      this.#abortController = new globalThis.AbortController();
      this.#options.signal = this.#userProvidedAbortSignal ? AbortSignal.any([this.#userProvidedAbortSignal, this.#abortController.signal]) : this.#abortController.signal;
    }
    if (supportsRequestStreams) {
      this.#options.duplex = "half";
    }
    if (this.#options.json !== void 0) {
      this.#options.body = this.#options.stringifyJson?.(this.#options.json) ?? JSON.stringify(this.#options.json);
      this.#options.headers.set("content-type", this.#options.headers.get("content-type") ?? "application/json");
    }
    const userProvidedContentType = options.headers && new globalThis.Headers(options.headers).has("content-type");
    if (this.#input instanceof globalThis.Request && (supportsFormData && this.#options.body instanceof globalThis.FormData || this.#options.body instanceof URLSearchParams) && !userProvidedContentType) {
      this.#options.headers.delete("content-type");
    }
    this.request = new globalThis.Request(this.#input, this.#options);
    if (hasSearchParameters(this.#options.searchParams)) {
      const textSearchParams = typeof this.#options.searchParams === "string" ? this.#options.searchParams.replace(/^\?/, "") : new URLSearchParams(Ky.#normalizeSearchParams(this.#options.searchParams)).toString();
      const searchParams = "?" + textSearchParams;
      const url2 = this.request.url.replace(/(?:\?.*?)?(?=#|$)/, searchParams);
      this.request = new globalThis.Request(url2, this.#options);
    }
    if (this.#options.onUploadProgress) {
      if (typeof this.#options.onUploadProgress !== "function") {
        throw new TypeError("The `onUploadProgress` option must be a function");
      }
      if (!supportsRequestStreams) {
        throw new Error("Request streams are not supported in your environment. The `duplex` option for `Request` is not available.");
      }
      this.request = this.#wrapRequestWithUploadProgress(this.request, this.#options.body ?? void 0);
    }
  }
  #calculateDelay() {
    const retryDelay = this.#options.retry.delay(this.#retryCount);
    let jitteredDelay = retryDelay;
    if (this.#options.retry.jitter === true) {
      jitteredDelay = Math.random() * retryDelay;
    } else if (typeof this.#options.retry.jitter === "function") {
      jitteredDelay = this.#options.retry.jitter(retryDelay);
      if (!Number.isFinite(jitteredDelay) || jitteredDelay < 0) {
        jitteredDelay = retryDelay;
      }
    }
    const backoffLimit = this.#options.retry.backoffLimit ?? Number.POSITIVE_INFINITY;
    return Math.min(backoffLimit, jitteredDelay);
  }
  async #calculateRetryDelay(error) {
    this.#retryCount++;
    if (this.#retryCount > this.#options.retry.limit) {
      throw error;
    }
    const errorObject = error instanceof Error ? error : new NonError(error);
    if (errorObject instanceof ForceRetryError) {
      return errorObject.customDelay ?? this.#calculateDelay();
    }
    if (!this.#options.retry.methods.includes(this.request.method.toLowerCase())) {
      throw error;
    }
    if (this.#options.retry.shouldRetry !== void 0) {
      const result = await this.#options.retry.shouldRetry({ error: errorObject, retryCount: this.#retryCount });
      if (result === false) {
        throw error;
      }
      if (result === true) {
        return this.#calculateDelay();
      }
    }
    if (isTimeoutError(error) && !this.#options.retry.retryOnTimeout) {
      throw error;
    }
    if (isHTTPError(error)) {
      if (!this.#options.retry.statusCodes.includes(error.response.status)) {
        throw error;
      }
      const retryAfter = error.response.headers.get("Retry-After") ?? error.response.headers.get("RateLimit-Reset") ?? error.response.headers.get("X-RateLimit-Retry-After") ?? error.response.headers.get("X-RateLimit-Reset") ?? error.response.headers.get("X-Rate-Limit-Reset");
      if (retryAfter && this.#options.retry.afterStatusCodes.includes(error.response.status)) {
        let after = Number(retryAfter) * 1e3;
        if (Number.isNaN(after)) {
          after = Date.parse(retryAfter) - Date.now();
        } else if (after >= Date.parse("2024-01-01")) {
          after -= Date.now();
        }
        const max = this.#options.retry.maxRetryAfter ?? after;
        return after < max ? after : max;
      }
      if (error.response.status === 413) {
        throw error;
      }
    }
    return this.#calculateDelay();
  }
  #decorateResponse(response) {
    if (this.#options.parseJson) {
      response.json = async () => this.#options.parseJson(await response.text());
    }
    return response;
  }
  #cancelBody(body) {
    if (!body) {
      return;
    }
    void body.cancel().catch(() => void 0);
  }
  #cancelResponseBody(response) {
    this.#cancelBody(response.body ?? void 0);
  }
  async #retry(function_) {
    try {
      return await function_();
    } catch (error) {
      const ms = Math.min(await this.#calculateRetryDelay(error), maxSafeTimeout);
      if (this.#retryCount < 1) {
        throw error;
      }
      await delay(ms, this.#userProvidedAbortSignal ? { signal: this.#userProvidedAbortSignal } : {});
      if (error instanceof ForceRetryError && error.customRequest) {
        const managedRequest = this.#options.signal ? new globalThis.Request(error.customRequest, { signal: this.#options.signal }) : new globalThis.Request(error.customRequest);
        this.#assignRequest(managedRequest);
      }
      for (const hook of this.#options.hooks.beforeRetry) {
        const hookResult = await hook({
          request: this.request,
          options: this.#getNormalizedOptions(),
          error,
          retryCount: this.#retryCount
        });
        if (hookResult instanceof globalThis.Request) {
          this.#assignRequest(hookResult);
          break;
        }
        if (hookResult instanceof globalThis.Response) {
          return hookResult;
        }
        if (hookResult === stop) {
          return;
        }
      }
      return this.#retry(function_);
    }
  }
  async #fetch() {
    if (this.#abortController?.signal.aborted) {
      this.#abortController = new globalThis.AbortController();
      this.#options.signal = this.#userProvidedAbortSignal ? AbortSignal.any([this.#userProvidedAbortSignal, this.#abortController.signal]) : this.#abortController.signal;
      this.request = new globalThis.Request(this.request, { signal: this.#options.signal });
    }
    for (const hook of this.#options.hooks.beforeRequest) {
      const result = await hook(this.request, this.#getNormalizedOptions(), { retryCount: this.#retryCount });
      if (result instanceof Response) {
        return result;
      }
      if (result instanceof globalThis.Request) {
        this.#assignRequest(result);
        break;
      }
    }
    const nonRequestOptions = findUnknownOptions(this.request, this.#options);
    this.#originalRequest = this.request;
    this.request = this.#originalRequest.clone();
    if (this.#options.timeout === false) {
      return this.#options.fetch(this.#originalRequest, nonRequestOptions);
    }
    return timeout(this.#originalRequest, nonRequestOptions, this.#abortController, this.#options);
  }
  #getNormalizedOptions() {
    if (!this.#cachedNormalizedOptions) {
      const { hooks, ...normalizedOptions } = this.#options;
      this.#cachedNormalizedOptions = Object.freeze(normalizedOptions);
    }
    return this.#cachedNormalizedOptions;
  }
  #assignRequest(request) {
    this.#cachedNormalizedOptions = void 0;
    this.request = this.#wrapRequestWithUploadProgress(request);
  }
  #wrapRequestWithUploadProgress(request, originalBody) {
    if (!this.#options.onUploadProgress || !request.body) {
      return request;
    }
    return streamRequest(request, this.#options.onUploadProgress, originalBody ?? this.#options.body ?? void 0);
  }
}
const createInstance = (defaults) => {
  const ky2 = (input, options) => Ky.create(input, validateAndMerge(defaults, options));
  for (const method of requestMethods) {
    ky2[method] = (input, options) => Ky.create(input, validateAndMerge(defaults, options, { method }));
  }
  ky2.create = (newDefaults) => createInstance(validateAndMerge(newDefaults));
  ky2.extend = (newDefaults) => {
    if (typeof newDefaults === "function") {
      newDefaults = newDefaults(defaults ?? {});
    }
    return createInstance(validateAndMerge(defaults, newDefaults));
  };
  ky2.stop = stop;
  ky2.retry = retry;
  return ky2;
};
const ky = createInstance();
const DEFAULT_RETRY = {
  limit: 2,
  methods: ["get", "put", "head", "delete", "options", "trace"],
  statusCodes: [408, 413, 429, 500, 502, 503, 504],
  backoffLimit: 1e4,
  retryOnTimeout: true,
  jitter: true
};
function isBodyInit(data) {
  return data != null && (data instanceof Blob || data instanceof FormData || data instanceof URLSearchParams || typeof ReadableStream !== "undefined" && data instanceof ReadableStream || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || typeof data === "string");
}
function buildRetryOptions(retry2) {
  if (retry2 === false) return 0;
  if (typeof retry2 === "number") return retry2;
  if (!retry2) return DEFAULT_RETRY;
  return {
    limit: retry2.limit ?? DEFAULT_RETRY.limit,
    methods: retry2.methods ?? DEFAULT_RETRY.methods,
    statusCodes: retry2.statusCodes ?? DEFAULT_RETRY.statusCodes,
    backoffLimit: retry2.backoffLimit ?? DEFAULT_RETRY.backoffLimit,
    retryOnTimeout: retry2.retryOnTimeout ?? DEFAULT_RETRY.retryOnTimeout,
    jitter: retry2.jitter ?? DEFAULT_RETRY.jitter,
    ...retry2.delay && { delay: retry2.delay }
  };
}
function serializeValue(value) {
  if (value === null || value === void 0) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) result[key] = serializeValue(val);
    return result;
  }
  return value;
}
function buildBody(data) {
  if (data == null) return void 0;
  if (!isBodyInit(data) && typeof data === "object") return serializeValue(data);
  return data;
}
function serializeParams(params) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) continue;
    if (value instanceof Date) result[key] = value.toISOString();
    else if (typeof value === "object") result[key] = JSON.stringify(serializeValue(value));
    else result[key] = String(value);
  }
  return result;
}
const responseHandlers = {
  arraybuffer: (r) => r.arrayBuffer(),
  blob: (r) => r.blob(),
  stream: (r) => r.body,
  text: (r) => r.text(),
  formData: (r) => r.formData(),
  document: async (r) => {
    const txt = await r.text();
    if (typeof DOMParser !== "undefined") {
      const ct = r.headers.get("content-type") || "";
      const type = ct.includes("xml") ? "text/xml" : "text/html";
      return new DOMParser().parseFromString(txt, type);
    }
    return txt;
  },
  json: (r) => r.json()
};
async function parseResponse(response, responseType) {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return void 0;
  }
  const handler = responseHandlers[responseType] ?? responseHandlers.json;
  return await handler(response);
}
const kyInstance = ky.create({
  credentials: "include",
  timeout: 3e4,
  retry: DEFAULT_RETRY,
  hooks: {
    beforeError: [
      async (error) => {
        try {
          const body = await error.response.clone().json();
          if (body.message || body.error) error.message = body.message || body.error || error.message;
        } catch {
        }
        return error;
      }
    ]
  }
});
function createClient(service) {
  return async function client(config2) {
    const { url: url2, params, method, data, responseType = "json", signal, headers, retry: retry2, timeout: timeout2, baseURL } = config2;
    const resolvedUrl = resolveURL(service, url2, baseURL);
    const searchParams = params ? new URLSearchParams(serializeParams(params)) : void 0;
    const body = buildBody(data);
    const isJsonBody = body != null && !isBodyInit(data);
    const kyOptions = {
      method: method.toLowerCase(),
      searchParams,
      signal,
      headers,
      retry: buildRetryOptions(retry2),
      ...timeout2 !== void 0 && { timeout: timeout2 },
      ...isJsonBody ? { json: body } : { body }
    };
    try {
      const response = await kyInstance(resolvedUrl, kyOptions);
      const responseData = await parseResponse(response, responseType);
      return { data: responseData, status: response.status, statusText: response.statusText };
    } catch (err) {
      if (err instanceof HTTPError) {
        const errorData = await parseResponse(
          err.response.clone(),
          "json"
        ).catch(() => null);
        const error = new Error(errorData?.message || errorData?.error || err.message || "UNKNOWN_ERROR");
        error.code = errorData?.code || "UNKNOWN_ERROR";
        error.status = err.response.status;
        throw error;
      }
      if (err instanceof Error) throw err;
      throw new Error("UNKNOWN_ERROR");
    }
  };
}
const Config = {
  baseUrl: "http://localhost:3030"
};
const account$1 = { "header": { "title": "Minha Conta" }, "preferences": { "currency": "Moeda (somente leitura)", "language": "Idioma", "languagePlaceholder": "Selecione um idioma", "loadError": "Erro ao carregar as preferências", "save": "Salvar preferências", "saveSuccess": "Preferências atualizadas com sucesso", "sectionDescription": "Configure idioma, fuso horário e notificações", "sectionTitle": "Preferências", "timezone": "Fuso horário" }, "profile": { "avatar": { "remove": "Remover foto", "upload": "Enviar foto", "uploadAriaLabel": "Escolher imagem de perfil", "uploadStub": "Upload de avatar ainda não disponível" }, "company": "Empresa", "email": "E-mail", "loadError": "Erro ao carregar os dados do perfil", "name": "Nome", "save": "Salvar alterações", "saveSuccess": "Perfil atualizado com sucesso", "sectionDescription": "Atualize suas informações pessoais", "sectionTitle": "Perfil" }, "security": { "changePassword": { "button": "Alterar senha", "cancel": "Cancelar", "confirmPassword": "Confirmar nova senha", "currentPassword": "Senha atual", "description": "Atualize sua senha de acesso", "dialogDescription": "Insira sua senha atual e escolha uma nova senha", "dialogTitle": "Alterar senha", "label": "Alterar senha", "newPassword": "Nova senha", "stub": "Alteração de senha ainda não disponível (SDK pendente)", "submit": "Alterar senha" }, "deleteAccount": { "button": "Excluir conta", "confirmAction": "Excluir", "confirmCancel": "Cancelar", "confirmDescription": "Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.", "confirmTitle": "Excluir conta", "description": "Esta ação é irreversível e apagará todos os seus dados", "label": "Excluir conta", "stub": "Exclusão de conta ainda não disponível (SDK pendente)" }, "lastPasswordChange": "Última alteração de senha em {{date}}", "loadError": "Erro ao carregar as configurações de segurança", "sectionDescription": "Gerencie sua senha e acesso à conta", "sectionTitle": "Segurança", "twoFactor": { "disabled": "Autenticação de dois fatores desativada", "enabled": "Autenticação de dois fatores ativada" } } };
const attach$1 = { "attached": "Vinculada", "attaching": "Vinculando…", "back": "Voltar", "close": "Fechar", "continue": "Continuar", "finish": "Vincular conversa", "goToChannels": "Ir para Canais", "navAgents": "Agentes", "navContact": "Contato", "navReview": "Revisão", "navWorkspace": "Espaço", "needChannelDescription": "Você precisa de ao menos um canal conectado antes de vincular uma conversa.", "needChannelTitle": "Conecte um canal primeiro", "rowAgents": "Agentes", "rowContact": "Contato", "rowWorkspace": "Espaço de trabalho", "searchContacts": "Buscar contatos e grupos", "stepAgentsSubtitle": "Quais CLIs de provedor podem trabalhar nesta conversa.", "stepAgentsTitle": "Escolha os agentes", "stepReviewSubtitle": "Confirme o vínculo e vincule a conversa.", "stepReviewTitle": "Revisão", "stepThreadSubtitle": "Escolha o contato, grupo ou caixa de entrada onde seu agente vai viver.", "stepThreadTitle": "Escolha uma conversa", "stepWorkspaceSubtitle": "A pasta de projeto em que seus agentes vão trabalhar.", "stepWorkspaceTitle": "Escolha um espaço de trabalho" };
const auth$1 = { "resetPassword": { "breadcrumb": "Recuperar senha", "confirmNewPassword": "Confirme a nova senha", "email": "E-mail", "newPassword": "Nova senha", "rememberPassword": "Lembrou a senha?", "requestSubmit": "Enviar e-mail", "requestSubtitle": "Enviaremos um e-mail com instruções", "requestSuccess": "E-mail enviado", "requestSuccessDescription": "Verifique sua caixa de entrada", "requestTitle": "Recuperar senha", "resetSubmit": "Salvar nova senha", "resetSubtitle": "Escolha uma senha nova e segura", "resetSuccess": "Senha alterada", "resetSuccessDescription": "Você já pode entrar com a nova senha", "resetTitle": "Definir nova senha" } };
const calendar$1 = { "presets": { "lastMonth": "Último mês", "lastWeek": "Última semana", "thisMonth": "Esse mês", "thisWeek": "Essa semana", "thisYear": "Este ano", "today": "Hoje", "yesterday": "Ontem" } };
const channels$1 = { "comingSoon": "Em breve", "comingSoonHint": "Suporte a este canal chega em breve.", "connectChannel": "Conectar canal", "connectDescription": "Mensagens de canais conectados podem ser encaminhadas aos seus agentes.", "connectTitle": "Conectar um canal", "emailImap": "E-mail (IMAP)", "gatewayWaiting": "Aguardando o gateway local do WhatsApp iniciar para gerar o código de pareamento…", "pairDescription": "Abra o Telegram no seu celular e escaneie este código para vincular o canal.", "pairTitle": "Parear Telegram", "pairViaQr": "Parear via QR code", "pairWaiting": "Aguardando o gateway local gerar um código de pareamento…", "title": "Canais", "whatsappPairDescription": "O pareamento acontece pelo gateway local do WhatsApp. Assim que ele estiver ativo, escaneie este QR code com o WhatsApp no seu celular para vincular o canal.", "whatsappPairTitle": "Parear WhatsApp", "yourChannels": "Seus canais" };
const common$1 = { "anonymous": "Anônimo", "back": "Voltar", "breadcrumbLabel": "Trilha de navegação", "cancel": "Cancelar", "close": "Fechar", "durationHoursSuffix": "h", "errorTitle": "Ocorreu um erro", "goToNextPage": "Ir para a próxima página", "goToPreviousPage": "Ir para a página anterior", "help": "Ajuda", "loading": "Carregando", "logout": "Sair", "more": "Mais", "morePages": "Mais páginas", "next": "Próximo", "noCurrencyFound": "Nenhuma moeda encontrada", "paginationLabel": "Paginação", "previous": "Anterior", "privacy": "Privacidade", "retry": "Tentar novamente", "searchCurrency": "Buscar moeda", "terms": "Termos" };
const console$1 = { "agentsRunning_one": "{{count}} agente em execução", "agentsRunning_other": "{{count}} agentes em execução", "attachThread": "Vincular uma conversa", "back": "Voltar", "footerLocal": "Código aberto · roda localmente", "footerNoAccount": "Sem conta necessária", "noThreadsYet": "Nenhuma conversa ainda", "send": "Enviar", "threads": "Conversas" };
const dashboard$1 = { "activeSessions": "Sessões ativas", "agentsWorkingNone": "Nenhum agente trabalhando agora", "agentsWorking_one": "{{count}} agente trabalhando agora", "agentsWorking_other": "{{count}} agentes trabalhando agora", "channels": "Canais", "issuesClosed": "Tarefas fechadas", "issuesOpened": "Tarefas abertas", "latestActivity": "Atividade recente", "medianResponse": "Resposta mediana", "needsYouName": "{{name}} precisa de você", "noActiveSessions": "Nenhuma sessão ativa.", "openSession": "Abrir sessão", "today": "Hoje" };
const dataTable$1 = { "emptyDescription": "Tente ajustar os filtros de busca.", "emptyTitle": "Nenhum resultado", "itemsPerPage": "itens por página" };
const enums$1 = { "ArtifactKind": { "FILE": "Arquivo", "IMAGE": "Captura de tela", "LINK": "Deploy de preview" }, "ChannelStatus": { "CONNECTED": "Conectado", "DISCONNECTED": "Não conectado", "PAIRING": "Pareando…" }, "CurrencyCode": { "AED": "Dirham (AED)", "ALL": "Lek albanês (ALL)", "ARS": "Peso Argentino (ARS)", "AUD": "Dólar Australiano (AUD)", "BDT": "Taka (BDT)", "BGN": "Lev búlgaro (BGN)", "BHD": "Dinar barenita (BHD)", "BIF": "Franco burundês (BIF)", "BOB": "Boliviano (BOB)", "BRL": "Real (BRL)", "BWP": "Pula (BWP)", "CAD": "Dólar Canadense (CAD)", "CHF": "Franco Suíço (CHF)", "CLP": "Peso Chileno (CLP)", "CNY": "Yuan (CNY)", "COP": "Peso Colombiano (COP)", "CVE": "Escudo cabo-verdiano (CVE)", "CZK": "Coroa tcheca (CZK)", "DKK": "Coroa dinamarquesa (DKK)", "DOP": "Peso dominicano (DOP)", "EGP": "Libra egípcia (EGP)", "ETB": "Birr etíope (ETB)", "EUR": "Euro (EUR)", "FJD": "Dólar de Fiji (FJD)", "GBP": "Libra (GBP)", "GHS": "Cedi ganês (GHS)", "GIP": "Libra gibraltarina (GIP)", "GMD": "Dalasi gambiano (GMD)", "GNF": "Franco guineense (GNF)", "GTQ": "Quetzal guatemalteco (GTQ)", "HKD": "Dólar de Hong Kong (HKD)", "HUF": "Forint húngaro (HUF)", "IDR": "Rupia indonésia (IDR)", "INR": "Rupia indiana (INR)", "ISK": "Coroa islandesa (ISK)", "JOD": "Dinar jordaniano (JOD)", "JPY": "Iene (JPY)", "KES": "Xelim queniano (KES)", "KRW": "Won sul-coreano (KRW)", "KWD": "Dinar kuwaitiano (KWD)", "LAK": "Kip laosiano (LAK)", "LKR": "Rupia do Sri Lanka (LKR)", "MAD": "Dirham marroquino (MAD)", "MGA": "Ariary malgaxe (MGA)", "MWK": "Kwacha malauiano (MWK)", "MXN": "Peso Mexicano (MXN)", "MYR": "Ringgit malaio (MYR)", "MZN": "Metical moçambicano (MZN)", "NGN": "Naira nigeriana (NGN)", "NOK": "Coroa norueguesa (NOK)", "NPR": "Rupia nepalesa (NPR)", "NZD": "Dólar neozelandês (NZD)", "OMR": "Rial omanense (OMR)", "PEN": "Sol Peruano (PEN)", "PHP": "Peso filipino (PHP)", "PKR": "Rupia paquistanesa (PKR)", "PLN": "Zloti polonês (PLN)", "PYG": "Guarani paraguaio (PYG)", "QAR": "Riyal catariano (QAR)", "RON": "Leu romeno (RON)", "RUB": "Rublo russo (RUB)", "RWF": "Franco ruandês (RWF)", "SAR": "Riyal saudita (SAR)", "SEK": "Coroa sueca (SEK)", "SGD": "Dólar de Cingapura (SGD)", "SLE": "Leone da Serra Leoa (SLE)", "SRD": "Dólar do Suriname (SRD)", "THB": "Baht tailandês (THB)", "TND": "Dinar tunisiano (TND)", "TRY": "Lira turca (TRY)", "TWD": "Dólar taiwanês (TWD)", "TZS": "Xelim tanzaniano (TZS)", "UGX": "Xelim ugandense (UGX)", "USD": "Dólar (USD)", "VND": "Dong vietnamita (VND)", "XAF": "Franco CFA Central (XAF)", "XCD": "Dólar do Caribe Oriental (XCD)", "XOF": "Franco CFA Ocidental (XOF)", "ZAR": "Rand sul-africano (ZAR)", "ZMW": "Kwacha zambiano (ZMW)" }, "IssueStatus": { "COMPLETED": "Concluída", "NEEDS_INPUT": "Precisa de entrada", "WORKING": "Em andamento" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Resumo diário", "FEATURE_ANNOUNCEMENT": "Anúncio de novidade", "INTEGRATION_DISCONNECTED": "Integração desconectada", "INVITATION": "Convite", "ORDER_RECEIVED": "Pedido recebido", "OTHER": "Outro", "SYNC_ERROR": "Erro de sincronização" }, "ProviderStatus": { "DETECTED": "Detectado", "NOT_INSTALLED": "Não instalado" }, "StopKind": { "APPROVAL_NEEDED": "Aprovação necessária", "BLOCKED_BY_CLASSIFICATION": "Bloqueada", "HUMAN_REQUESTED": "Humano solicitado", "SERVER_ERROR": "Erro de servidor" }, "StopResolution": { "APPROVE": "Aprovar", "DENY": "Negar", "RETRY": "Tentar novamente", "REVIEW_AND_SEND": "Revisar e enviar", "TAKE_OVER": "Assumir" }, "ThreadStatus": { "IDLE": "Ocioso", "NEEDS_ATTENTION": "Precisa de atenção", "PAUSED": "Pausado", "RUNNING": "Em execução" }, "WorkspaceBadge": { "CLAUDE_PROJECT": "Projeto Claude", "GIT": "git" } };
const errors$1 = { "CANNOT_CONVERT_INPUT": "Não foi possível processar a requisição. Revise os dados enviados.", "CHANNEL_NOT_CONNECTED": "O canal não está conectado.", "CHECKOUT_SESSION_REF_REQUIRED": "A referência da sessão de checkout é obrigatória.", "CLARIFICATION_ALREADY_PENDING": "Já há uma clarificação pendente para este remetente.", "CLASSIFICATION_FAILED": "Não foi possível classificar a mensagem.", "COMMAND_HANDLER_NOT_FOUND": "Erro interno ao processar a operação. Tente novamente em instantes.", "COMMAND_QUEUE_NOT_FOUND": "Erro interno ao enfileirar a operação. Tente novamente em instantes.", "CREDENTIAL_DECRYPT_FAILED": "Não foi possível ler as credenciais armazenadas. Contate o suporte.", "DELIVERY_NOT_OWNED_BY_USER": "Esta notificação não pertence à sua conta.", "DISPUTE_REF_REQUIRED": "A referência da disputa é obrigatória.", "DOWNGRADE_SELECTION_INVALID": "A seleção para o downgrade é inválida. Revise os itens mantidos.", "EMAIL_ALREADY_REGISTERED": "Este email já está cadastrado.", "EMPTY_RECIPIENTS": "Nenhum destinatário para esta notificação.", "ENTITY_NOT_FOUND_WHILE_SAVING": "O registro não existe mais e não pôde ser salvo.", "ENTRY_NOT_FOUND": "Mensagem não encontrada.", "ENTRY_NOT_INVOCABLE": "Esta mensagem não pode invocar um agente.", "FORBIDDEN": "Você não tem permissão para executar esta ação.", "FREE_PLAN_NOT_SUBSCRIBABLE": "O plano gratuito não pode ser assinado diretamente.", "HANDLER_NOT_BOUND": "Erro interno ao despachar a operação. Tente novamente em instantes.", "INVALIDATED_AUTH_TOKEN": "Sua sessão foi invalidada. Entre novamente.", "INVALID_AUTH_TOKEN": "Token de autenticação inválido. Entre novamente.", "INVALID_CHARGE_TRANSITION": "Esta cobrança não pode mudar para o status solicitado.", "INVALID_CHECKOUT_SESSION_TRANSITION": "Esta sessão de checkout não pode mudar para o status solicitado.", "INVALID_CONTROLLER_EXAMPLES": "Erro interno na documentação da API. Contate o suporte.", "INVALID_DISPUTE_TRANSITION": "Esta disputa não pode mudar para o status solicitado.", "INVALID_EMAIL": "E-mail inválido.", "INVALID_EMAIL_FORMAT": "Formato de email inválido.", "INVALID_EMAIL_OR_PASSWORD": "E-mail ou senha inválidos", "INVALID_ENTITY": "Os dados enviados são inválidos.", "INVALID_ID": "Identificador inválido.", "INVALID_ID_VALUES_LENGTH": "Valores de identificador inválidos.", "INVALID_LANGUAGE": 'Idioma inválido. Use uma tag BCP-47 como "pt-BR".', "INVALID_MANDATE": "O mandato de pagamento é inválido ou expirou.", "INVALID_NAME": "Nome inválido.", "INVALID_OUTBOX_PAYLOAD": "Erro interno no processamento de eventos. Tente novamente em instantes.", "INVALID_PAYMENT_METHOD_TRANSITION": "Este método de pagamento não pode mudar para o status solicitado.", "INVALID_PHONE": "Número de telefone inválido.", "INVALID_PICTURE_URL": "URL de imagem inválida.", "INVALID_RANGE": "Intervalo inválido.", "INVALID_REQUEST": "Requisição inválida.", "INVALID_TIMEZONE": 'Fuso horário inválido. Use um nome IANA como "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "Esta fatura já foi paga.", "INVOICE_LINES_MISMATCH": "As linhas da fatura não conferem com o total esperado.", "ISSUE_ALREADY_ARCHIVED": "Esta issue já está arquivada.", "ISSUE_ALREADY_COMPLETED": "Esta issue já foi concluída.", "ISSUE_ARCHIVED": "Esta issue está arquivada.", "ISSUE_NOT_ARCHIVED": "Esta issue não está arquivada.", "ISSUE_NOT_FOUND": "Issue não encontrada.", "LAST_INVOKER": "Ao menos um participante deve manter permissão de invocação.", "MISSING_ENVIRONMENT_VARIABLE": "Erro de configuração do servidor. Contate o suporte.", "MISSING_LOG_CONTENT": "Erro interno de logging.", "NETWORK_ERROR": "Erro de rede", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notificação não encontrada.", "NOT_FOUND": "Recurso não encontrado.", "NOT_IMPLEMENTED": "Este recurso ainda não está disponível.", "NO_CHANNEL_CONNECTED": "Conecte um canal primeiro.", "NO_CHANNEL_ENABLED": "Nenhum canal de notificação habilitado para esta entrega.", "NO_PROVIDER_SELECTED": "Selecione ao menos um provider.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding já concluído", "ONBOARDING_NOT_COMPLETED": "Onboarding não concluído", "OPTIMISTIC_LOCK_CONFLICT": "O registro foi alterado por outra operação. Recarregue e tente novamente.", "OWNER_ALREADY_DISABLED": "Esta conta já está desativada.", "OWNER_NOT_DISABLED": "Esta conta não está desativada.", "OWNER_NOT_FOUND": "Conta não encontrada.", "PARTICIPANT_NOT_FOUND": "Participante não encontrado.", "PASSWORDS_DONT_MATCH": "As senhas não coincidem.", "PASSWORD_TOO_LONG": "Senha muito longa.", "PASSWORD_TOO_SHORT": "Senha muito curta (mínimo 8 caracteres).", "PASSWORD_TOO_WEAK": "Senha muito fraca. Use letras, números e símbolos.", "PATH_NOT_A_DIRECTORY": "O caminho selecionado não é um diretório.", "PATH_NOT_FOUND": "O caminho selecionado não existe.", "PAYMENT_METHOD_IS_DEFAULT": "O método de pagamento padrão não pode ser removido. Defina outro como padrão antes.", "PAYMENT_METHOD_LAST_ACTIVE": "O último método de pagamento ativo não pode ser removido com uma assinatura ativa.", "PAYMENT_METHOD_NOT_FOUND": "Método de pagamento não encontrado.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "O identificador da conta é obrigatório para este método de pagamento.", "PAYMENT_METHOD_REQUIRED": "Adicione um método de pagamento para continuar.", "PAYMENT_METHOD_UNSUPPORTED": "Este método de pagamento não é suportado.", "PROVIDER_CAPABILITY_UNSUPPORTED": "O provedor de pagamento não suporta esta operação.", "PROVIDER_ERROR": "O provedor de pagamento retornou um erro. Tente novamente em instantes.", "PROVIDER_NOT_DETECTED": "Provedor de agente não detectado.", "RATE_LIMITED": "Muitas tentativas. Aguarde um momento e tente novamente.", "RESOLUTION_NOT_APPLICABLE": "Essa resolução não se aplica a este stop.", "RESOURCE_LOCKED_BY_PLAN": "Este recurso está bloqueado pelo seu plano atual.", "SESSION_ALREADY_STREAMING": "Esta sessão já está sendo transmitida.", "SESSION_EXPIRED": "Sessão expirada", "STOP_CRITERION_DISABLED": "Este critério de stop está desativado nas configurações.", "STOP_NOT_FOUND": "Stop não encontrado.", "SUBSCRIPTION_ALREADY_EXISTS": "Já existe uma assinatura ativa.", "SUBSCRIPTION_ALREADY_FINALIZED": "Esta assinatura já foi finalizada.", "SUBSCRIPTION_NOT_FOUND": "Assinatura não encontrada.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "Esta assinatura não está agendada para cancelamento.", "SUBSCRIPTION_PENDING_CANCELLATION": "Esta assinatura está com cancelamento pendente.", "TERMINAL_ALREADY_RUNNING": "Já existe uma sessão de terminal ativa para esta issue.", "TERMINAL_SPAWN_FAILED": "Falha ao iniciar a sessão de terminal.", "TERMS_REQUIRED": "Aceite os termos para continuar.", "THREAD_ALREADY_ATTACHED": "Já existe uma thread para este contato.", "THREAD_NOT_FOUND": "Thread não encontrada.", "THREAD_NOT_PAUSED": "Pause a thread para falar diretamente.", "THREAD_PAUSED": "Esta thread está pausada — use o modo direto.", "TOO_MANY_TERMINAL_STREAMS": "Muitas sessões de terminal simultâneas.", "UNAUTHORIZED": "Não autorizado", "UNKNOWN_ERROR": "Erro desconhecido", "USER_ALREADY_EXISTS": "Usuário já existe", "USER_NOT_FOUND": "Usuário não encontrado.", "VALIDATION_ERROR": "Alguns campos são inválidos.", "WEAK_PASSWORD": "Senha muito fraca. Use letras, números e símbolos.", "WEBHOOK_SIGNATURE_INVALID": "Assinatura de webhook inválida.", "WEBHOOK_SOURCE_UNKNOWN": "Origem de webhook desconhecida.", "WORKSPACE_ALREADY_REGISTERED": "Este workspace já está registrado.", "WORKSPACE_IN_USE": "Há uma issue trabalhando neste workspace.", "WORKSPACE_NOT_FOUND": "Workspace não encontrado." };
const home$1 = { "replayIntro": "Rever introdução", "setupChannelDesc": "WhatsApp, Instagram ou Telegram", "setupChannelTitle": "Conecte um canal", "setupCta": "Configurar", "setupDone": "Concluído", "setupThreadDesc": "Contato + pasta + agente", "setupThreadTitle": "Vincule sua primeira conversa", "setupWorkspaceDesc": "Aponte para uma pasta de projeto neste Mac", "setupWorkspaceTitle": "Adicione um espaço de trabalho", "welcome": "Bem-vindo ao CodeDM", "welcomeSubtitle": "Três passos rápidos e seus contatos podem colocar agentes de código para trabalhar neste Mac." };
const issues$1 = { "archived": "Arquivadas", "emptyDescription": "As tarefas aparecem aqui quando seus agentes começam a trabalhar em mensagens encaminhadas.", "emptyTitle": "Nenhuma tarefa ainda", "hideArchived": "Ocultar arquivadas", "showArchived": "Mostrar arquivadas", "statsLine": "{{awaitingInput}} aguardando entrada · {{working}} em andamento · {{completed}} concluídas · {{archived}} arquivadas", "title": "Tarefas" };
const nav$1 = { "account": "Minha Conta", "comingSoon": "Em breve", "home": "Início", "settings": "Configurações" };
const notifications$1 = { "allCaughtUp": "Você está em dia.", "aria": "Notificações", "title": "Notificações", "unreadCount_one": "{{count}} não lida", "unreadCount_other": "{{count}} não lidas" };
const onboarding$1 = { "back": "Voltar", "getStarted": "Começar", "next": "Próximo", "skip": "Pular", "slide1Body": "O CodeDM conecta WhatsApp, Instagram e Telegram a agentes de código rodando neste Mac — converse com seu código como em qualquer plataforma de mensagens. Código aberto, sem conta, tudo permanece local.", "slide1Title": "Converse com seu código", "slide2Title": "Como funciona", "slide3Body": "Os agentes pausam em erros de servidor, respostas bloqueadas ou quando alguém pede um humano. Você revisa, orienta com um sussurro ou assume o controle — nada é enviado sem a sua palavra.", "slide3Title": "Você mantém o controle", "stepChannelDesc": "Pareie o WhatsApp por QR code", "stepChannelTitle": "Conecte um canal", "stepThreadDesc": "Ligue um contato ou grupo a uma pasta e escolha os agentes", "stepThreadTitle": "Vincule uma conversa", "stepWorkspaceDesc": "Aponte para uma pasta de projeto — projetos Claude são detectados", "stepWorkspaceTitle": "Adicione um espaço de trabalho" };
const session$1 = { "agentStopped": "O agente parou e está aguardando", "allIssues": "Todas as tarefas", "archive": "Arquivar", "archived": "Arquivadas", "artifactsEmptyDescription": "Deploys de preview, capturas de tela e arquivos produzidos pelos seus agentes aparecem aqui.", "artifactsEmptyTitle": "Nenhum artefato ainda", "back": "Voltar", "canInvoke": "{{count}} podem invocar", "chatEmptyDescription": "Mensagens deste contato e dos seus agentes aparecerão aqui.", "chatEmptyTitle": "Nenhuma mensagem ainda", "composerDirectHint": "Respostas diretas são enviadas ao canal como você.", "composerPlaceholderDirect": "Responda no canal…", "composerPlaceholderSteer": "Sussurre uma orientação aos agentes…", "composerSteerHint": "Sussurros chegam apenas aos agentes — nunca enviados ao canal.", "contextBuffer": "Buffer de contexto", "contextBufferHint": "Quantas mensagens recentes os agentes veem como contexto.", "issuesEmptyDescription": "Mensagens encaminhadas que geram trabalho aparecerão aqui como tarefas.", "issuesEmptyTitle": "Nenhuma tarefa nesta conversa", "issuesStats": "{{awaiting}} aguardando entrada · {{working}} em andamento · {{completed}} concluídas", "mentionTag": "Tag de menção", "mentionTagPlaceholder": "@codedm", "messagesRoutedHere": "Mensagens encaminhadas para cá", "modeDirect": "Direto", "modeWhisper": "Sussurro", "needsYou": "Precisa de você", "onlyWhenMentioned": "Responder apenas quando mencionado", "onlyWhenMentionedHint": "Caso contrário, os agentes respondem a todas as mensagens da conversa.", "participants": "Participantes", "pause": "Pausar", "respondTrigger": "Gatilho de resposta", "resume": "Retomar", "send": "Enviar", "settingsDescription": "Ajuste como os agentes se comportam nesta conversa.", "settingsTitle": "Configurações da conversa", "steer": "Orientar", "steerHint": "As orientações chegam apenas ao agente que trabalha nesta tarefa.", "steerPlaceholder": "Oriente esta tarefa…", "tabArtifacts": "Artefatos", "tabChat": "Chat", "tabIssues": "Tarefas", "terminalSession": "Sessão de terminal", "threadSettings": "Configurações da conversa", "transcriptIssue": "tarefa", "waitingTerminal": "Aguardando saída do terminal…" };
const settings$1 = { "agentProviders": "Provedores de agentes", "criteriaApprovalNeeded": "Aprovação necessária", "criteriaApprovalNeededDesc": "O agente quer rodar um comando que precisa de aval.", "criteriaBlocked": "Bloqueada pela classificação", "criteriaBlockedDesc": "Uma resposta rascunhada é sinalizada antes de ser enviada.", "criteriaHumanRequested": "Humano solicitado", "criteriaHumanRequestedDesc": "O contato pede explicitamente por uma pessoa.", "criteriaServerErrors": "Erros de servidor", "criteriaServerErrorsDesc": "A CLI do provedor falha (429s, crashes, timeouts).", "general": "Geral", "generalAppVersion": "Versão do app", "generalDataDir": "Diretório de dados", "generalOperator": "Operador", "generalTimezone": "Fuso horário", "providerNotFound": "não encontrado no PATH", "stopCriteria": "Critérios de parada", "stopCriteriaDescription": 'Quando qualquer um desses ocorre, o agente para, a conversa é marcada como "Precisa de você" e a parada aparece na sessão até você resolvê-la.', "title": "Configurações" };
const workspaces$1 = { "addDescription": "Aponte para uma pasta de projeto neste Mac. Selos de Git e de projeto Claude são detectados automaticamente.", "addFolder": "Adicionar pasta", "addTitle": "Adicionar um espaço de trabalho", "adding": "Adicionando…", "emptyDescription": "Adicione uma pasta de projeto e o CodeDM detectará seu repositório git e o projeto Claude.", "emptyTitle": "Nenhum espaço de trabalho ainda", "pathPlaceholder": "~/dev/acme-storefront", "projectFolder": "Pasta do projeto", "projectFolders": "Pastas de projeto", "threadCount_one": "{{count}} conversa", "threadCount_other": "{{count}} conversas", "title": "Espaços de trabalho" };
const zod$1 = { "invalidEmail": "E-mail inválido", "invalid_date": "Data inválida.", "invalid_enum_value": "Valor inválido. Opções: {{options}}", "invalid_format_datetime": "Data/hora inválida", "invalid_format_email": "E-mail inválido", "invalid_format_regex": "Formato inválido", "invalid_format_url": "URL inválida", "invalid_format_uuid": "UUID inválido", "invalid_type": "Tipo inválido (esperado {{expected}}, recebido {{received}})", "required": "Campo obrigatório", "too_big_array": "Deve ter no máximo {{maximum}} item(s)", "too_big_number": "Deve ser no máximo {{maximum}}", "too_big_string": "Deve ter no máximo {{maximum}} caractere(s)", "too_small_array": "Precisa ter pelo menos {{minimum}} item(s)", "too_small_number": "Precisa ser pelo menos {{minimum}}", "too_small_string": "Precisa ter pelo menos {{minimum}} caractere(s)" };
const ptTranslations = {
  account: account$1,
  attach: attach$1,
  auth: auth$1,
  calendar: calendar$1,
  channels: channels$1,
  common: common$1,
  console: console$1,
  dashboard: dashboard$1,
  dataTable: dataTable$1,
  enums: enums$1,
  errors: errors$1,
  home: home$1,
  issues: issues$1,
  nav: nav$1,
  notifications: notifications$1,
  onboarding: onboarding$1,
  session: session$1,
  settings: settings$1,
  workspaces: workspaces$1,
  zod: zod$1
};
const account = { "header": { "title": "My Account" }, "preferences": { "currency": "Currency (read-only)", "language": "Language", "languagePlaceholder": "Select a language", "loadError": "Failed to load preferences", "save": "Save preferences", "saveSuccess": "Preferences updated successfully", "sectionDescription": "Configure language, timezone and notifications", "sectionTitle": "Preferences", "timezone": "Timezone" }, "profile": { "avatar": { "remove": "Remove photo", "upload": "Upload photo", "uploadAriaLabel": "Choose profile image", "uploadStub": "Avatar upload not yet available" }, "company": "Company", "email": "Email", "loadError": "Failed to load profile data", "name": "Name", "save": "Save changes", "saveSuccess": "Profile updated successfully", "sectionDescription": "Update your personal information", "sectionTitle": "Profile" }, "security": { "changePassword": { "button": "Change password", "cancel": "Cancel", "confirmPassword": "Confirm new password", "currentPassword": "Current password", "description": "Update your login password", "dialogDescription": "Enter your current password and choose a new one", "dialogTitle": "Change password", "label": "Change password", "newPassword": "New password", "stub": "Password change not yet available (SDK pending)", "submit": "Change password" }, "deleteAccount": { "button": "Delete account", "confirmAction": "Delete", "confirmCancel": "Cancel", "confirmDescription": "Are you sure you want to delete your account? This action cannot be undone.", "confirmTitle": "Delete account", "description": "This action is irreversible and will delete all your data", "label": "Delete account", "stub": "Account deletion not yet available (SDK pending)" }, "lastPasswordChange": "Last password change on {{date}}", "loadError": "Failed to load security settings", "sectionDescription": "Manage your password and account access", "sectionTitle": "Security", "twoFactor": { "disabled": "Two-factor authentication disabled", "enabled": "Two-factor authentication enabled" } } };
const attach = { "attached": "Attached", "attaching": "Attaching…", "back": "Back", "close": "Close", "continue": "Continue", "finish": "Attach thread", "goToChannels": "Go to Channels", "navAgents": "Agents", "navContact": "Contact", "navReview": "Review", "navWorkspace": "Workspace", "needChannelDescription": "You need at least one connected channel before you can attach a thread.", "needChannelTitle": "Connect a channel first", "rowAgents": "Agents", "rowContact": "Contact", "rowWorkspace": "Workspace", "searchContacts": "Search contacts and groups", "stepAgentsSubtitle": "Which provider CLIs can work in this thread.", "stepAgentsTitle": "Pick the agents", "stepReviewSubtitle": "Confirm the binding and attach the thread.", "stepReviewTitle": "Review", "stepThreadSubtitle": "Choose the contact, group or inbox your agent will live in.", "stepThreadTitle": "Pick a thread", "stepWorkspaceSubtitle": "The project folder your agents will work in.", "stepWorkspaceTitle": "Pick a workspace" };
const auth = { "resetPassword": { "breadcrumb": "Reset password", "confirmNewPassword": "Confirm password", "email": "Email", "newPassword": "New password", "rememberPassword": "Remembered your password?", "requestSubmit": "Send email", "requestSubtitle": "We'll send you an email with instructions", "requestSuccess": "Email sent", "requestSuccessDescription": "Check your inbox", "requestTitle": "Reset password", "resetSubmit": "Save new password", "resetSubtitle": "Choose a new, secure password", "resetSuccess": "Password updated", "resetSuccessDescription": "You can now sign in with the new password", "resetTitle": "Set a new password" } };
const calendar = { "presets": { "lastMonth": "Last month", "lastWeek": "Last week", "thisMonth": "This month", "thisWeek": "This week", "thisYear": "This year", "today": "Today", "yesterday": "Yesterday" } };
const channels = { "comingSoon": "Coming soon", "comingSoonHint": "Support for this channel is coming soon.", "connectChannel": "Connect channel", "connectDescription": "Messages in connected channels can be routed to your agents.", "connectTitle": "Connect a channel", "emailImap": "Email (IMAP)", "gatewayWaiting": "Waiting for the local WhatsApp gateway to start so it can generate the pairing code…", "pairDescription": "Open Telegram on your phone, then scan this code to link the channel.", "pairTitle": "Pair Telegram", "pairViaQr": "Pair via QR code", "pairWaiting": "Waiting for the local gateway to generate a pairing code…", "title": "Channels", "whatsappPairDescription": "Pairing happens through the local WhatsApp gateway. Once it's running, scan this QR code with WhatsApp on your phone to link the channel.", "whatsappPairTitle": "Pair WhatsApp", "yourChannels": "Your channels" };
const common = { "anonymous": "Anonymous", "back": "Back", "breadcrumbLabel": "Breadcrumb", "cancel": "Cancel", "close": "Close", "durationHoursSuffix": "h", "errorTitle": "Something went wrong", "goToNextPage": "Go to next page", "goToPreviousPage": "Go to previous page", "help": "Help", "loading": "Loading", "logout": "Log out", "more": "More", "morePages": "More pages", "next": "Next", "noCurrencyFound": "No currency found", "paginationLabel": "Pagination", "previous": "Previous", "privacy": "Privacy", "retry": "Retry", "searchCurrency": "Search currency", "terms": "Terms" };
const console = { "agentsRunning_one": "{{count}} agent running", "agentsRunning_other": "{{count}} agents running", "attachThread": "Attach a thread", "back": "Back", "footerLocal": "Open source · runs locally", "footerNoAccount": "No account needed", "noThreadsYet": "No threads yet", "send": "Send", "threads": "Threads" };
const dashboard = { "activeSessions": "Active sessions", "agentsWorkingNone": "No agents working right now", "agentsWorking_one": "{{count}} agent working right now", "agentsWorking_other": "{{count}} agents working right now", "channels": "Channels", "issuesClosed": "Issues closed", "issuesOpened": "Issues opened", "latestActivity": "Latest activity", "medianResponse": "Median response", "needsYouName": "{{name}} needs you", "noActiveSessions": "No active sessions.", "openSession": "Open session", "today": "Today" };
const dataTable = { "emptyDescription": "Try adjusting your search filters.", "emptyTitle": "No results", "itemsPerPage": "items per page" };
const enums = { "ArtifactKind": { "FILE": "File", "IMAGE": "Screenshot", "LINK": "Preview deploy" }, "ChannelStatus": { "CONNECTED": "Connected", "DISCONNECTED": "Not connected", "PAIRING": "Pairing…" }, "CurrencyCode": { "AED": "UAE Dirham (AED)", "ALL": "Albanian Lek (ALL)", "ARS": "Argentine Peso (ARS)", "AUD": "Australian Dollar (AUD)", "BDT": "Bangladeshi Taka (BDT)", "BGN": "Bulgarian Lev (BGN)", "BHD": "Bahraini Dinar (BHD)", "BIF": "Burundian Franc (BIF)", "BOB": "Bolivian Boliviano (BOB)", "BRL": "Brazilian Real (BRL)", "BWP": "Botswanan Pula (BWP)", "CAD": "Canadian Dollar (CAD)", "CHF": "Swiss Franc (CHF)", "CLP": "Chilean Peso (CLP)", "CNY": "Chinese Yuan (CNY)", "COP": "Colombian Peso (COP)", "CVE": "Cape Verdean Escudo (CVE)", "CZK": "Czech Koruna (CZK)", "DKK": "Danish Krone (DKK)", "DOP": "Dominican Peso (DOP)", "EGP": "Egyptian Pound (EGP)", "ETB": "Ethiopian Birr (ETB)", "EUR": "Euro (EUR)", "FJD": "Fijian Dollar (FJD)", "GBP": "British Pound (GBP)", "GHS": "Ghanaian Cedi (GHS)", "GIP": "Gibraltar Pound (GIP)", "GMD": "Gambian Dalasi (GMD)", "GNF": "Guinean Franc (GNF)", "GTQ": "Guatemalan Quetzal (GTQ)", "HKD": "Hong Kong Dollar (HKD)", "HUF": "Hungarian Forint (HUF)", "IDR": "Indonesian Rupiah (IDR)", "INR": "Indian Rupee (INR)", "ISK": "Icelandic Krona (ISK)", "JOD": "Jordanian Dinar (JOD)", "JPY": "Japanese Yen (JPY)", "KES": "Kenyan Shilling (KES)", "KRW": "South Korean Won (KRW)", "KWD": "Kuwaiti Dinar (KWD)", "LAK": "Laotian Kip (LAK)", "LKR": "Sri Lankan Rupee (LKR)", "MAD": "Moroccan Dirham (MAD)", "MGA": "Malagasy Ariary (MGA)", "MWK": "Malawian Kwacha (MWK)", "MXN": "Mexican Peso (MXN)", "MYR": "Malaysian Ringgit (MYR)", "MZN": "Mozambican Metical (MZN)", "NGN": "Nigerian Naira (NGN)", "NOK": "Norwegian Krone (NOK)", "NPR": "Nepalese Rupee (NPR)", "NZD": "New Zealand Dollar (NZD)", "OMR": "Omani Rial (OMR)", "PEN": "Peruvian Sol (PEN)", "PHP": "Philippine Peso (PHP)", "PKR": "Pakistani Rupee (PKR)", "PLN": "Polish Zloty (PLN)", "PYG": "Paraguayan Guarani (PYG)", "QAR": "Qatari Riyal (QAR)", "RON": "Romanian Leu (RON)", "RUB": "Russian Ruble (RUB)", "RWF": "Rwandan Franc (RWF)", "SAR": "Saudi Riyal (SAR)", "SEK": "Swedish Krona (SEK)", "SGD": "Singapore Dollar (SGD)", "SLE": "Sierra Leonean Leone (SLE)", "SRD": "Surinamese Dollar (SRD)", "THB": "Thai Baht (THB)", "TND": "Tunisian Dinar (TND)", "TRY": "Turkish Lira (TRY)", "TWD": "New Taiwan Dollar (TWD)", "TZS": "Tanzanian Shilling (TZS)", "UGX": "Ugandan Shilling (UGX)", "USD": "US Dollar (USD)", "VND": "Vietnamese Dong (VND)", "XAF": "Central African CFA Franc (XAF)", "XCD": "East Caribbean Dollar (XCD)", "XOF": "West African CFA Franc (XOF)", "ZAR": "South African Rand (ZAR)", "ZMW": "Zambian Kwacha (ZMW)" }, "IssueStatus": { "COMPLETED": "Completed", "NEEDS_INPUT": "Needs input", "WORKING": "Working" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Daily digest", "FEATURE_ANNOUNCEMENT": "Feature announcement", "INTEGRATION_DISCONNECTED": "Integration disconnected", "INVITATION": "Invitation", "ORDER_RECEIVED": "Order received", "OTHER": "Other", "SYNC_ERROR": "Sync error" }, "ProviderStatus": { "DETECTED": "Detected", "NOT_INSTALLED": "Not installed" }, "StopKind": { "APPROVAL_NEEDED": "Approval needed", "BLOCKED_BY_CLASSIFICATION": "Blocked", "HUMAN_REQUESTED": "Human requested", "SERVER_ERROR": "Server error" }, "StopResolution": { "APPROVE": "Approve", "DENY": "Deny", "RETRY": "Retry", "REVIEW_AND_SEND": "Review & send", "TAKE_OVER": "Take over" }, "ThreadStatus": { "IDLE": "Idle", "NEEDS_ATTENTION": "Needs attention", "PAUSED": "Paused", "RUNNING": "Running" }, "WorkspaceBadge": { "CLAUDE_PROJECT": "Claude project", "GIT": "git" } };
const errors = { "CANNOT_CONVERT_INPUT": "The request could not be processed. Review the submitted data.", "CHANNEL_NOT_CONNECTED": "The channel is not connected.", "CHECKOUT_SESSION_REF_REQUIRED": "The checkout session reference is required.", "CLARIFICATION_ALREADY_PENDING": "A clarification is already pending for this sender.", "CLASSIFICATION_FAILED": "Could not classify the message.", "COMMAND_HANDLER_NOT_FOUND": "Internal error while processing the operation. Try again shortly.", "COMMAND_QUEUE_NOT_FOUND": "Internal error while queuing the operation. Try again shortly.", "CREDENTIAL_DECRYPT_FAILED": "Stored credentials could not be read. Contact support.", "DELIVERY_NOT_OWNED_BY_USER": "This notification does not belong to your account.", "DISPUTE_REF_REQUIRED": "The dispute reference is required.", "DOWNGRADE_SELECTION_INVALID": "The selection for the downgrade is invalid. Review the kept items.", "EMAIL_ALREADY_REGISTERED": "This email is already registered.", "EMPTY_RECIPIENTS": "No recipients for this notification.", "ENTITY_NOT_FOUND_WHILE_SAVING": "The record no longer exists and could not be saved.", "ENTRY_NOT_FOUND": "Message entry not found.", "ENTRY_NOT_INVOCABLE": "This message cannot invoke an agent.", "FORBIDDEN": "You do not have permission to perform this action.", "FREE_PLAN_NOT_SUBSCRIBABLE": "The free plan cannot be subscribed to directly.", "HANDLER_NOT_BOUND": "Internal error while dispatching the operation. Try again shortly.", "INVALIDATED_AUTH_TOKEN": "Your session was invalidated. Sign in again.", "INVALID_AUTH_TOKEN": "Invalid authentication token. Sign in again.", "INVALID_CHARGE_TRANSITION": "This charge cannot change to the requested status.", "INVALID_CHECKOUT_SESSION_TRANSITION": "This checkout session cannot change to the requested status.", "INVALID_CONTROLLER_EXAMPLES": "Internal API documentation error. Contact support.", "INVALID_DISPUTE_TRANSITION": "This dispute cannot change to the requested status.", "INVALID_EMAIL": "Invalid email address.", "INVALID_EMAIL_FORMAT": "Invalid email format.", "INVALID_EMAIL_OR_PASSWORD": "Invalid email or password", "INVALID_ENTITY": "The submitted data is invalid.", "INVALID_ID": "Invalid identifier.", "INVALID_ID_VALUES_LENGTH": "Invalid identifier values.", "INVALID_LANGUAGE": 'Invalid language. Use a BCP-47 tag such as "en-US".', "INVALID_MANDATE": "The payment mandate is invalid or expired.", "INVALID_NAME": "Invalid name.", "INVALID_OUTBOX_PAYLOAD": "Internal event processing error. Try again shortly.", "INVALID_PAYMENT_METHOD_TRANSITION": "This payment method cannot change to the requested status.", "INVALID_PHONE": "Invalid phone number.", "INVALID_PICTURE_URL": "Invalid picture URL.", "INVALID_RANGE": "Invalid range.", "INVALID_REQUEST": "Invalid request.", "INVALID_TIMEZONE": 'Invalid timezone. Use an IANA name such as "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "This invoice has already been paid.", "INVOICE_LINES_MISMATCH": "The invoice lines do not match the expected total.", "ISSUE_ALREADY_ARCHIVED": "This issue is already archived.", "ISSUE_ALREADY_COMPLETED": "This issue is already completed.", "ISSUE_ARCHIVED": "This issue is archived.", "ISSUE_NOT_ARCHIVED": "This issue is not archived.", "ISSUE_NOT_FOUND": "Issue not found.", "LAST_INVOKER": "At least one participant must keep invocation rights.", "MISSING_ENVIRONMENT_VARIABLE": "Server configuration error. Contact support.", "MISSING_LOG_CONTENT": "Internal logging error.", "NETWORK_ERROR": "Network error", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notification not found.", "NOT_FOUND": "Resource not found.", "NOT_IMPLEMENTED": "This feature is not available yet.", "NO_CHANNEL_CONNECTED": "Connect a channel first.", "NO_CHANNEL_ENABLED": "No notification channel is enabled for this delivery.", "NO_PROVIDER_SELECTED": "Select at least one provider.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding already completed", "ONBOARDING_NOT_COMPLETED": "Onboarding not completed", "OPTIMISTIC_LOCK_CONFLICT": "The record was changed by another operation. Reload and try again.", "OWNER_ALREADY_DISABLED": "This account is already disabled.", "OWNER_NOT_DISABLED": "This account is not disabled.", "OWNER_NOT_FOUND": "Account not found.", "PARTICIPANT_NOT_FOUND": "Participant not found.", "PASSWORDS_DONT_MATCH": "Passwords do not match.", "PASSWORD_TOO_LONG": "Password is too long.", "PASSWORD_TOO_SHORT": "Password is too short (minimum 8 characters).", "PASSWORD_TOO_WEAK": "Password too weak. Use letters, numbers and symbols.", "PATH_NOT_A_DIRECTORY": "The selected path is not a directory.", "PATH_NOT_FOUND": "The selected path does not exist.", "PAYMENT_METHOD_IS_DEFAULT": "The default payment method cannot be removed. Set another as default first.", "PAYMENT_METHOD_LAST_ACTIVE": "The last active payment method cannot be removed while a subscription is active.", "PAYMENT_METHOD_NOT_FOUND": "Payment method not found.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "Account identifier is required for this payment method.", "PAYMENT_METHOD_REQUIRED": "Add a payment method to continue.", "PAYMENT_METHOD_UNSUPPORTED": "This payment method is not supported.", "PROVIDER_CAPABILITY_UNSUPPORTED": "The payment provider does not support this operation.", "PROVIDER_ERROR": "The payment provider returned an error. Try again shortly.", "PROVIDER_NOT_DETECTED": "Agent provider not detected.", "RATE_LIMITED": "Too many attempts. Please wait a moment and try again.", "RESOLUTION_NOT_APPLICABLE": "That resolution does not apply to this stop.", "RESOURCE_LOCKED_BY_PLAN": "This resource is locked by your current plan.", "SESSION_ALREADY_STREAMING": "This session is already streaming.", "SESSION_EXPIRED": "Session expired", "STOP_CRITERION_DISABLED": "This stop criterion is disabled in settings.", "STOP_NOT_FOUND": "Stop not found.", "SUBSCRIPTION_ALREADY_EXISTS": "An active subscription already exists.", "SUBSCRIPTION_ALREADY_FINALIZED": "This subscription has already been finalized.", "SUBSCRIPTION_NOT_FOUND": "Subscription not found.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "This subscription is not scheduled for cancellation.", "SUBSCRIPTION_PENDING_CANCELLATION": "This subscription is pending cancellation.", "TERMINAL_ALREADY_RUNNING": "A terminal session is already running for this issue.", "TERMINAL_SPAWN_FAILED": "Failed to start the terminal session.", "TERMS_REQUIRED": "Please accept the terms to continue.", "THREAD_ALREADY_ATTACHED": "A thread is already attached to this contact.", "THREAD_NOT_FOUND": "Thread not found.", "THREAD_NOT_PAUSED": "Pause the thread to talk directly.", "THREAD_PAUSED": "This thread is paused — use direct mode instead.", "TOO_MANY_TERMINAL_STREAMS": "Too many concurrent terminal streams.", "UNAUTHORIZED": "Unauthorized", "UNKNOWN_ERROR": "Unknown error", "USER_ALREADY_EXISTS": "User already exists", "USER_NOT_FOUND": "User not found.", "VALIDATION_ERROR": "Some fields are invalid.", "WEAK_PASSWORD": "Password too weak. Use letters, numbers and symbols.", "WEBHOOK_SIGNATURE_INVALID": "Invalid webhook signature.", "WEBHOOK_SOURCE_UNKNOWN": "Unknown webhook source.", "WORKSPACE_ALREADY_REGISTERED": "This workspace is already registered.", "WORKSPACE_IN_USE": "This workspace has an issue currently working on it.", "WORKSPACE_NOT_FOUND": "Workspace not found." };
const home = { "replayIntro": "Replay intro", "setupChannelDesc": "WhatsApp, Instagram or Telegram", "setupChannelTitle": "Connect a channel", "setupCta": "Set up", "setupDone": "Done", "setupThreadDesc": "Contact + folder + agent", "setupThreadTitle": "Attach your first thread", "setupWorkspaceDesc": "Point at a project folder on this Mac", "setupWorkspaceTitle": "Add a workspace", "welcome": "Welcome to CodeDM", "welcomeSubtitle": "Three quick steps and your contacts can put coding agents to work on this Mac." };
const issues = { "archived": "Archived", "emptyDescription": "Issues appear here once your agents start working on routed messages.", "emptyTitle": "No issues yet", "hideArchived": "Hide archived", "showArchived": "Show archived", "statsLine": "{{awaitingInput}} awaiting input · {{working}} working · {{completed}} completed · {{archived}} archived", "title": "Issues" };
const nav = { "account": "My Account", "comingSoon": "Coming soon", "home": "Home", "settings": "Settings" };
const notifications = { "allCaughtUp": "You're all caught up.", "aria": "Notifications", "title": "Notifications", "unreadCount_one": "{{count}} unread", "unreadCount_other": "{{count}} unread" };
const onboarding = { "back": "Back", "getStarted": "Get started", "next": "Next", "skip": "Skip", "slide1Body": "CodeDM connects WhatsApp, Instagram and Telegram to coding agents running on this Mac — DM your codebase like it's any DM platform. Open source, no account, everything stays local.", "slide1Title": "DM your codebase", "slide2Title": "How it works", "slide3Body": "Agents pause on server errors, blocked replies, or when someone asks for a human. You review, steer with a whisper, or take over — nothing ships without your say.", "slide3Title": "You stay in control", "stepChannelDesc": "Pair WhatsApp via QR code", "stepChannelTitle": "Connect a channel", "stepThreadDesc": "Bind a contact or group to a folder and pick the agents", "stepThreadTitle": "Attach a thread", "stepWorkspaceDesc": "Point at a project folder — Claude projects are detected", "stepWorkspaceTitle": "Add a workspace" };
const session = { "agentStopped": "Agent stopped and is waiting", "allIssues": "All issues", "archive": "Archive", "archived": "Archived", "artifactsEmptyDescription": "Preview deploys, screenshots and files produced by your agents land here.", "artifactsEmptyTitle": "No artifacts yet", "back": "Back", "canInvoke": "{{count}} can invoke", "chatEmptyDescription": "Messages from this contact and your agents will appear here.", "chatEmptyTitle": "No messages yet", "composerDirectHint": "Direct replies are sent to the channel as you.", "composerPlaceholderDirect": "Reply in the channel…", "composerPlaceholderSteer": "Whisper a steer to the agents…", "composerSteerHint": "Whispers reach agents only — never sent to the channel.", "contextBuffer": "Context buffer", "contextBufferHint": "How many recent messages agents see as context.", "issuesEmptyDescription": "Routed messages that spawn work will show up here as issues.", "issuesEmptyTitle": "No issues in this thread", "issuesStats": "{{awaiting}} awaiting input · {{working}} working · {{completed}} completed", "mentionTag": "Mention tag", "mentionTagPlaceholder": "@codedm", "messagesRoutedHere": "Messages routed here", "modeDirect": "Direct", "modeWhisper": "Whisper", "needsYou": "Needs you", "onlyWhenMentioned": "Only reply when mentioned", "onlyWhenMentionedHint": "Otherwise agents respond to every message in the thread.", "participants": "Participants", "pause": "Pause", "respondTrigger": "Respond trigger", "resume": "Resume", "send": "Send", "settingsDescription": "Tune how agents behave in this thread.", "settingsTitle": "Thread settings", "steer": "Steer", "steerHint": "Steers reach the agent working this issue only.", "steerPlaceholder": "Steer this issue…", "tabArtifacts": "Artifacts", "tabChat": "Chat", "tabIssues": "Issues", "terminalSession": "Terminal session", "threadSettings": "Thread settings", "transcriptIssue": "issue", "waitingTerminal": "Waiting for terminal output…" };
const settings = { "agentProviders": "Agent providers", "criteriaApprovalNeeded": "Approval needed", "criteriaApprovalNeededDesc": "The agent wants to run a command that needs sign-off.", "criteriaBlocked": "Blocked by classification", "criteriaBlockedDesc": "A drafted reply is flagged before it is sent.", "criteriaHumanRequested": "Human requested", "criteriaHumanRequestedDesc": "The contact explicitly asks for a person.", "criteriaServerErrors": "Server errors", "criteriaServerErrorsDesc": "The provider CLI errors out (429s, crashes, timeouts).", "general": "General", "generalAppVersion": "App version", "generalDataDir": "Data directory", "generalOperator": "Operator", "generalTimezone": "Timezone", "providerNotFound": "not found in PATH", "stopCriteria": "Stop criteria", "stopCriteriaDescription": 'When any of these happen the agent stops, the thread is flagged "Needs you", and the stop shows up in the session until you resolve it.', "title": "Settings" };
const workspaces = { "addDescription": "Point at a project folder on this Mac. Git and Claude-project badges are detected automatically.", "addFolder": "Add folder", "addTitle": "Add a workspace", "adding": "Adding…", "emptyDescription": "Add a project folder and CodeDM will detect its git repo and Claude project.", "emptyTitle": "No workspaces yet", "pathPlaceholder": "~/dev/acme-storefront", "projectFolder": "Project folder", "projectFolders": "Project folders", "threadCount_one": "{{count}} thread", "threadCount_other": "{{count}} threads", "title": "Workspaces" };
const zod = { "invalidEmail": "Invalid email", "invalid_date": "Invalid date.", "invalid_enum_value": "Invalid value. Options: {{options}}", "invalid_format_datetime": "Invalid date/time", "invalid_format_email": "Invalid email", "invalid_format_regex": "Invalid format", "invalid_format_url": "Invalid URL", "invalid_format_uuid": "Invalid UUID", "invalid_type": "Invalid type (expected {{expected}}, received {{received}})", "required": "Required", "too_big_array": "Must have at most {{maximum}} item(s)", "too_big_number": "Must be at most {{maximum}}", "too_big_string": "Must be at most {{maximum}} character(s)", "too_small_array": "Must have at least {{minimum}} item(s)", "too_small_number": "Must be at least {{minimum}}", "too_small_string": "Must be at least {{minimum}} character(s)" };
const enTranslations = {
  account,
  attach,
  auth,
  calendar,
  channels,
  common,
  console,
  dashboard,
  dataTable,
  enums,
  errors,
  home,
  issues,
  nav,
  notifications,
  onboarding,
  session,
  settings,
  workspaces,
  zod
};
const chain = instance.use(initReactI18next);
if (typeof window !== "undefined") {
  const detectorModule = await import("../_libs/i18next-browser-languagedetector+[...].mjs");
  chain.use(detectorModule.default);
}
chain.init({
  resources: {
    pt: { translation: ptTranslations },
    en: { translation: enTranslations }
  },
  lng: typeof window === "undefined" ? "pt" : void 0,
  fallbackLng: "pt",
  defaultNS: "translation",
  interpolation: {
    escapeValue: false
  },
  returnNull: false,
  detection: {
    order: ["localStorage", "navigator"],
    caches: ["localStorage"]
  }
});
const ApiErrorsEnum = {
  CANNOT_CONVERT_INPUT: "CANNOT_CONVERT_INPUT",
  CHANNEL_NOT_CONNECTED: "CHANNEL_NOT_CONNECTED",
  CLARIFICATION_ALREADY_PENDING: "CLARIFICATION_ALREADY_PENDING",
  CLASSIFICATION_FAILED: "CLASSIFICATION_FAILED",
  COMMAND_HANDLER_NOT_FOUND: "COMMAND_HANDLER_NOT_FOUND",
  COMMAND_QUEUE_NOT_FOUND: "COMMAND_QUEUE_NOT_FOUND",
  CREDENTIAL_DECRYPT_FAILED: "CREDENTIAL_DECRYPT_FAILED",
  EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
  ENTITY_NOT_FOUND_WHILE_SAVING: "ENTITY_NOT_FOUND_WHILE_SAVING",
  ENTRY_NOT_FOUND: "ENTRY_NOT_FOUND",
  ENTRY_NOT_INVOCABLE: "ENTRY_NOT_INVOCABLE",
  FORBIDDEN: "FORBIDDEN",
  HANDLER_NOT_BOUND: "HANDLER_NOT_BOUND",
  INVALIDATED_AUTH_TOKEN: "INVALIDATED_AUTH_TOKEN",
  INVALID_AUTH_TOKEN: "INVALID_AUTH_TOKEN",
  INVALID_CONTROLLER_EXAMPLES: "INVALID_CONTROLLER_EXAMPLES",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_EMAIL_FORMAT: "INVALID_EMAIL_FORMAT",
  INVALID_ENTITY: "INVALID_ENTITY",
  INVALID_ID: "INVALID_ID",
  INVALID_ID_VALUES_LENGTH: "INVALID_ID_VALUES_LENGTH",
  INVALID_LANGUAGE: "INVALID_LANGUAGE",
  INVALID_OUTBOX_PAYLOAD: "INVALID_OUTBOX_PAYLOAD",
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_PICTURE_URL: "INVALID_PICTURE_URL",
  INVALID_RANGE: "INVALID_RANGE",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_TIMEZONE: "INVALID_TIMEZONE",
  ISSUE_ALREADY_ARCHIVED: "ISSUE_ALREADY_ARCHIVED",
  ISSUE_ALREADY_COMPLETED: "ISSUE_ALREADY_COMPLETED",
  ISSUE_ARCHIVED: "ISSUE_ARCHIVED",
  ISSUE_NOT_ARCHIVED: "ISSUE_NOT_ARCHIVED",
  ISSUE_NOT_FOUND: "ISSUE_NOT_FOUND",
  LAST_INVOKER: "LAST_INVOKER",
  MISSING_ENVIRONMENT_VARIABLE: "MISSING_ENVIRONMENT_VARIABLE",
  MISSING_LOG_CONTENT: "MISSING_LOG_CONTENT",
  NOT_FOUND: "NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  NO_CHANNEL_CONNECTED: "NO_CHANNEL_CONNECTED",
  NO_PROVIDER_SELECTED: "NO_PROVIDER_SELECTED",
  OPTIMISTIC_LOCK_CONFLICT: "OPTIMISTIC_LOCK_CONFLICT",
  OWNER_ALREADY_DISABLED: "OWNER_ALREADY_DISABLED",
  OWNER_NOT_DISABLED: "OWNER_NOT_DISABLED",
  OWNER_NOT_FOUND: "OWNER_NOT_FOUND",
  PARTICIPANT_NOT_FOUND: "PARTICIPANT_NOT_FOUND",
  PASSWORDS_DONT_MATCH: "PASSWORDS_DONT_MATCH",
  PASSWORD_TOO_WEAK: "PASSWORD_TOO_WEAK",
  PATH_NOT_A_DIRECTORY: "PATH_NOT_A_DIRECTORY",
  PATH_NOT_FOUND: "PATH_NOT_FOUND",
  PROVIDER_NOT_DETECTED: "PROVIDER_NOT_DETECTED",
  RATE_LIMITED: "RATE_LIMITED",
  RESOLUTION_NOT_APPLICABLE: "RESOLUTION_NOT_APPLICABLE",
  SESSION_ALREADY_STREAMING: "SESSION_ALREADY_STREAMING",
  STOP_CRITERION_DISABLED: "STOP_CRITERION_DISABLED",
  STOP_NOT_FOUND: "STOP_NOT_FOUND",
  TERMINAL_ALREADY_RUNNING: "TERMINAL_ALREADY_RUNNING",
  TERMINAL_SPAWN_FAILED: "TERMINAL_SPAWN_FAILED",
  THREAD_ALREADY_ATTACHED: "THREAD_ALREADY_ATTACHED",
  THREAD_NOT_FOUND: "THREAD_NOT_FOUND",
  THREAD_NOT_PAUSED: "THREAD_NOT_PAUSED",
  THREAD_PAUSED: "THREAD_PAUSED",
  TOO_MANY_TERMINAL_STREAMS: "TOO_MANY_TERMINAL_STREAMS",
  UNAUTHORIZED: "UNAUTHORIZED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  WEAK_PASSWORD: "WEAK_PASSWORD",
  WORKSPACE_ALREADY_REGISTERED: "WORKSPACE_ALREADY_REGISTERED",
  WORKSPACE_IN_USE: "WORKSPACE_IN_USE",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND"
};
const workspaceBadgeSchema = _enum(["GIT", "CLAUDE_PROJECT"]);
const addWorkspace200Schema = object({
  "workspaceId": uuid(),
  get "badges"() {
    return array(workspaceBadgeSchema);
  }
});
object({
  "path": string().min(1)
});
lazy(() => addWorkspace200Schema);
_enum(["CANNOT_CONVERT_INPUT", "CHANNEL_NOT_CONNECTED", "CLARIFICATION_ALREADY_PENDING", "CLASSIFICATION_FAILED", "COMMAND_HANDLER_NOT_FOUND", "COMMAND_QUEUE_NOT_FOUND", "CREDENTIAL_DECRYPT_FAILED", "EMAIL_ALREADY_REGISTERED", "ENTITY_NOT_FOUND_WHILE_SAVING", "ENTRY_NOT_FOUND", "ENTRY_NOT_INVOCABLE", "FORBIDDEN", "HANDLER_NOT_BOUND", "INVALIDATED_AUTH_TOKEN", "INVALID_AUTH_TOKEN", "INVALID_CONTROLLER_EXAMPLES", "INVALID_EMAIL", "INVALID_EMAIL_FORMAT", "INVALID_ENTITY", "INVALID_ID", "INVALID_ID_VALUES_LENGTH", "INVALID_LANGUAGE", "INVALID_OUTBOX_PAYLOAD", "INVALID_PHONE", "INVALID_PICTURE_URL", "INVALID_RANGE", "INVALID_REQUEST", "INVALID_TIMEZONE", "ISSUE_ALREADY_ARCHIVED", "ISSUE_ALREADY_COMPLETED", "ISSUE_ARCHIVED", "ISSUE_NOT_ARCHIVED", "ISSUE_NOT_FOUND", "LAST_INVOKER", "MISSING_ENVIRONMENT_VARIABLE", "MISSING_LOG_CONTENT", "NOT_FOUND", "NOT_IMPLEMENTED", "NO_CHANNEL_CONNECTED", "NO_PROVIDER_SELECTED", "OPTIMISTIC_LOCK_CONFLICT", "OWNER_ALREADY_DISABLED", "OWNER_NOT_DISABLED", "OWNER_NOT_FOUND", "PARTICIPANT_NOT_FOUND", "PASSWORDS_DONT_MATCH", "PASSWORD_TOO_WEAK", "PATH_NOT_A_DIRECTORY", "PATH_NOT_FOUND", "PROVIDER_NOT_DETECTED", "RATE_LIMITED", "RESOLUTION_NOT_APPLICABLE", "SESSION_ALREADY_STREAMING", "STOP_CRITERION_DISABLED", "STOP_NOT_FOUND", "TERMINAL_ALREADY_RUNNING", "TERMINAL_SPAWN_FAILED", "THREAD_ALREADY_ATTACHED", "THREAD_NOT_FOUND", "THREAD_NOT_PAUSED", "THREAD_PAUSED", "TOO_MANY_TERMINAL_STREAMS", "UNAUTHORIZED", "USER_NOT_FOUND", "VALIDATION_ERROR", "WEAK_PASSWORD", "WORKSPACE_ALREADY_REGISTERED", "WORKSPACE_IN_USE", "WORKSPACE_NOT_FOUND"]).describe("All possible error codes");
object({
  "issueId": string()
});
const archiveIssue200Schema = any();
lazy(() => archiveIssue200Schema);
const artifactKindSchema = _enum(["IMAGE", "FILE", "LINK"]);
const contactKindSchema = _enum(["CONTACT", "GROUP"]);
const providerKindSchema = _enum(["CLAUDE_CODE", "CODEX", "OPENCODE"]);
const attachThread200Schema = object({
  "threadId": uuid()
});
const attachThreadMutationRequestSchema = object({
  "contactRef": object({
    "channelId": uuid(),
    "externalId": string().min(1),
    "displayName": string().min(1),
    get "kind"() {
      return contactKindSchema;
    }
  }),
  "workspaceId": uuid(),
  get "providers"() {
    return array(providerKindSchema).min(1);
  }
});
lazy(() => attachThread200Schema);
const bufferSizeSchema = _enum(["25", "50", "100", "200"]);
const channelKindSchema = _enum(["WHATSAPP", "INSTAGRAM_DM", "TELEGRAM"]);
const channelStatusSchema = _enum(["DISCONNECTED", "PAIRING", "CONNECTED"]);
const classificationMethodSchema = _enum(["REPLY_QUOTE", "CONTEXT_MATCH", "NEW_ISSUE", "CLARIFIED"]);
object({
  "threadId": string()
});
const configureContextBuffer200Schema = any();
object({
  get "bufferSize"() {
    return bufferSizeSchema;
  }
});
lazy(() => configureContextBuffer200Schema);
object({
  "threadId": string()
});
const configureMentionGate200Schema = any();
object({
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string().min(1)
  })])
});
lazy(() => configureMentionGate200Schema);
const ownerKindSchema = _enum(["ORGANIZATION", "INDIVIDUAL"]).default("ORGANIZATION");
const createOwner200Schema = object({
  "ownerId": uuid()
});
object({
  "name": string().min(1).max(120),
  get "kind"() {
    return ownerKindSchema.default("ORGANIZATION").optional();
  },
  "timezone": optional(string().min(1)),
  "pictureUrl": optional(url())
});
lazy(() => createOwner200Schema);
const currencyCodeSchema = _enum(["AED", "ALL", "ARS", "AUD", "BDT", "BGN", "BHD", "BIF", "BOB", "BRL", "BWP", "CAD", "CHF", "CLP", "CNY", "COP", "CVE", "CZK", "DKK", "DOP", "EGP", "ETB", "EUR", "FJD", "GBP", "GHS", "GIP", "GMD", "GNF", "GTQ", "HKD", "HUF", "IDR", "INR", "ISK", "JOD", "JPY", "KES", "KRW", "KWD", "LAK", "LKR", "MAD", "MGA", "MWK", "MXN", "MYR", "MZN", "NGN", "NOK", "NPR", "NZD", "OMR", "PEN", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RUB", "RWF", "SAR", "SEK", "SGD", "SLE", "SRD", "THB", "TND", "TRY", "TWD", "TZS", "UGX", "USD", "VND", "XAF", "XCD", "XOF", "ZAR", "ZMW"]);
const providerStatusSchema = _enum(["DETECTED", "NOT_INSTALLED"]);
const refreshSchema = _enum(["true", "false"]);
object({
  get "refresh"() {
    return refreshSchema.optional();
  }
}).optional();
const detectProviders200Schema = object({
  "providers": array(object({
    get "name"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "binaryPath": optional(string()),
    "version": optional(string())
  }))
});
lazy(() => detectProviders200Schema);
const disableOwner200Schema = object({
  "ownerId": uuid(),
  "isDisabled": boolean()
});
object({
  "reason": optional(string().min(1).max(500))
});
lazy(() => disableOwner200Schema);
const enableOwner200Schema = object({
  "ownerId": uuid(),
  "isDisabled": boolean()
});
lazy(() => enableOwner200Schema);
const getAttachThreadWizard200Schema = object({
  "noChannelConnected": boolean(),
  "channels": array(object({
    "channelId": uuid(),
    get "kind"() {
      return channelKindSchema;
    }
  })),
  "contacts": array(object({
    "channelId": uuid(),
    "externalId": string(),
    "displayName": string(),
    get "kind"() {
      return contactKindSchema;
    },
    "alreadyAttached": boolean()
  })),
  "workspaces": array(object({
    "workspaceId": uuid(),
    "path": string(),
    get "badges"() {
      return array(workspaceBadgeSchema);
    }
  })),
  "providers": array(object({
    get "provider"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "available": boolean(),
    "version": optional(string())
  }))
});
lazy(() => getAttachThreadWizard200Schema);
const stopKindSchema = _enum(["SERVER_ERROR", "BLOCKED_BY_CLASSIFICATION", "HUMAN_REQUESTED", "APPROVAL_NEEDED"]);
const threadStatusSchema = _enum(["RUNNING", "IDLE", "NEEDS_ATTENTION", "PAUSED"]);
const getHomeDashboard200Schema = object({
  "agentsRunningNow": int().min(-9007199254740991).max(9007199254740991),
  "needsYou": optional(object({
    "threadId": uuid(),
    "threadDisplayName": string(),
    get "stopKinds"() {
      return array(stopKindSchema);
    }
  })),
  "activeSessions": array(object({
    "threadId": uuid(),
    "displayName": string(),
    get "channelKind"() {
      return channelKindSchema;
    },
    "workspacePath": string(),
    get "providers"() {
      return array(providerKindSchema);
    },
    get "status"() {
      return threadStatusSchema;
    },
    "lastActivity": string()
  })),
  "latestActivity": array(object({
    "title": string(),
    "subtitle": string(),
    "threadId": uuid(),
    "at": string()
  })),
  "today": object({
    "issuesOpened": int().min(-9007199254740991).max(9007199254740991),
    "issuesClosed": int().min(-9007199254740991).max(9007199254740991),
    "medianResponseSeconds": number()
  }),
  "channels": array(object({
    get "kind"() {
      return channelKindSchema;
    },
    get "status"() {
      return channelStatusSchema;
    }
  }))
});
lazy(() => getHomeDashboard200Schema);
const issueStatusSchema = _enum(["NEEDS_INPUT", "WORKING", "COMPLETED"]);
const transcriptKindSchema = _enum(["CONTACT", "AGENT", "OPERATOR_DIRECT", "WHISPER", "ACTION"]);
object({
  "issueId": string()
});
const getIssueDetail200Schema = object({
  "issue": object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean()
  }),
  get "provider"() {
    return providerKindSchema;
  },
  "terminalLog": array(object({
    "at": string(),
    "line": string()
  })),
  "routedMessages": array(object({
    "entryId": uuid(),
    get "kind"() {
      return transcriptKindSchema;
    },
    "text": string(),
    "at": string(),
    get "classification"() {
      return classificationMethodSchema.optional();
    }
  })),
  "stops": array(object({
    "stopId": uuid(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string()
  }))
});
lazy(() => getIssueDetail200Schema);
object({
  "includeArchived": boolean().default(false)
});
const getIssuesOverview200Schema = object({
  "statsLine": object({
    "awaitingInput": int().min(-9007199254740991).max(9007199254740991),
    "working": int().min(-9007199254740991).max(9007199254740991),
    "completed": int().min(-9007199254740991).max(9007199254740991),
    "archived": int().min(-9007199254740991).max(9007199254740991)
  }),
  "groups": array(object({
    get "status"() {
      return issueStatusSchema;
    },
    "items": array(object({
      "issueId": uuid(),
      "key": string(),
      "title": string(),
      get "status"() {
        return issueStatusSchema;
      },
      "meta": optional(string()),
      "archived": boolean(),
      "threadId": uuid(),
      "threadDisplayName": string()
    }))
  })),
  "archived": array(object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean(),
    "threadId": uuid(),
    "threadDisplayName": string()
  }))
});
lazy(() => getIssuesOverview200Schema);
const languageSchema = _enum(["pt-BR", "en-US"]);
const getMyAccount200Schema = object({
  "profile": object({
    "userId": string(),
    "name": string(),
    "email": string(),
    "company": nullable(string()),
    "pictureUrl": nullable(url())
  }),
  "preferences": object({
    get "language"() {
      return languageSchema;
    },
    get "currency"() {
      return currencyCodeSchema;
    },
    "timezone": string()
  }),
  "security": object({
    "hasPassword": boolean(),
    "lastPasswordChangeAt": nullable(datetime()),
    "twoFactorEnabled": boolean()
  })
});
lazy(() => getMyAccount200Schema);
const stopResolutionSchema = _enum(["RETRY", "REVIEW_AND_SEND", "TAKE_OVER", "APPROVE", "DENY"]);
object({
  "threadId": string()
});
const getNeedsYouPanel200Schema = object({
  "stops": array(object({
    "stopId": uuid(),
    "issueId": uuid(),
    "issueKey": string(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string(),
    get "availableResolutions"() {
      return array(stopResolutionSchema);
    }
  }))
});
lazy(() => getNeedsYouPanel200Schema);
const threadModeSchema = _enum(["STEER", "DIRECT"]);
object({
  "threadId": string()
});
const getSessionChat200Schema = object({
  "thread": object({
    "threadId": uuid(),
    "displayName": string(),
    get "channelKind"() {
      return channelKindSchema;
    },
    "workspacePath": string(),
    get "providers"() {
      return array(providerKindSchema);
    },
    get "status"() {
      return threadStatusSchema;
    },
    "lastActivity": string()
  }),
  "paused": boolean(),
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string()
  })]),
  "autonomyCaption": string(),
  "activeStops": array(object({
    "stopId": uuid(),
    get "kind"() {
      return stopKindSchema;
    },
    "title": string(),
    "detail": string(),
    "raisedAt": string()
  })),
  "transcript": array(object({
    "entryId": uuid(),
    get "kind"() {
      return transcriptKindSchema;
    },
    "text": string(),
    "at": string(),
    "issueId": optional(uuid()),
    get "provider"() {
      return providerKindSchema.optional();
    },
    "quotedEntryId": optional(string()),
    get "classification"() {
      return classificationMethodSchema.optional();
    }
  })),
  get "composerMode"() {
    return threadModeSchema;
  }
});
lazy(() => getSessionChat200Schema);
object({
  "threadId": string()
});
const getSessionIssues200Schema = object({
  "statsLine": object({
    "awaitingInput": int().min(-9007199254740991).max(9007199254740991),
    "working": int().min(-9007199254740991).max(9007199254740991),
    "completed": int().min(-9007199254740991).max(9007199254740991)
  }),
  "groups": array(object({
    get "status"() {
      return issueStatusSchema;
    },
    "items": array(object({
      "issueId": uuid(),
      "key": string(),
      "title": string(),
      get "status"() {
        return issueStatusSchema;
      },
      "meta": optional(string()),
      "archived": boolean()
    }))
  })),
  "archived": array(object({
    "issueId": uuid(),
    "key": string(),
    "title": string(),
    get "status"() {
      return issueStatusSchema;
    },
    "meta": optional(string()),
    "archived": boolean()
  })),
  "autoArchiveNote": string()
});
lazy(() => getSessionIssues200Schema);
const getSession200Schema = object({
  "user": object({
    "id": string(),
    "email": string(),
    "name": nullable(string()),
    "emailVerified": boolean()
  }),
  "session": object({
    "id": string(),
    "userId": uuid(),
    "expiresAt": datetime(),
    "ownerId": nullable(string())
  })
});
lazy(() => getSession200Schema);
const getSettings200Schema = object({
  "providers": array(object({
    get "provider"() {
      return providerKindSchema;
    },
    get "status"() {
      return providerStatusSchema;
    },
    "available": boolean(),
    "version": optional(string())
  })),
  "stopCriteria": object({
    "serverErrors": boolean(),
    "blockedByClassification": boolean(),
    "humanRequested": boolean(),
    "approvalNeeded": boolean()
  }),
  "general": object({
    "operatorName": string(),
    "timezone": string(),
    "dataDir": string()
  }),
  "appVersion": string()
});
lazy(() => getSettings200Schema);
const getSetupChecklist200Schema = object({
  "channelDone": boolean(),
  "workspaceDone": boolean(),
  "threadDone": boolean()
});
lazy(() => getSetupChecklist200Schema);
object({
  "threadId": string()
});
const getThreadSettings200Schema = object({
  "mentionGate": union([object({
    "enabled": literal(false)
  }), object({
    "enabled": literal(true),
    "tag": string()
  })]),
  "participants": array(object({
    "participantId": string(),
    "name": string(),
    "source": string(),
    "canInvoke": boolean()
  })),
  "invokerCount": int().min(-9007199254740991).max(9007199254740991),
  get "bufferSize"() {
    return bufferSizeSchema;
  }
});
lazy(() => getThreadSettings200Schema);
const getUserInfo200Schema = object({
  "user": object({
    "id": uuid(),
    "name": string(),
    "email": email(),
    "avatarUrl": nullable(url())
  }),
  "current": nullable(object({
    "id": uuid(),
    "name": string()
  })),
  "owners": array(object({
    "id": uuid(),
    "name": string()
  }))
});
lazy(() => getUserInfo200Schema);
object({
  "threadId": string()
});
const listArtifacts200Schema = object({
  "artifacts": array(object({
    "artifactId": uuid(),
    "issueId": optional(uuid()),
    get "kind"() {
      return artifactKindSchema;
    },
    "name": string(),
    "meta": string(),
    "recordedAt": string()
  }))
});
lazy(() => listArtifacts200Schema);
const listWorkspaces200Schema = object({
  "workspaces": array(object({
    "workspaceId": uuid(),
    "path": string(),
    get "badges"() {
      return array(workspaceBadgeSchema);
    },
    "threadCount": int().min(-9007199254740991).max(9007199254740991),
    "addedAt": datetime()
  }))
});
lazy(() => listWorkspaces200Schema);
const listenEvents200Schema = union([object({
  "name": _enum(["browser.thread_status_changed"]),
  "threadId": string(),
  get "status"() {
    return threadStatusSchema;
  },
  "agentsRunningNow": int().min(-9007199254740991).max(9007199254740991)
}), object({
  "name": _enum(["browser.stop_raised"]),
  "threadId": string(),
  "threadDisplayName": string(),
  "issueId": string(),
  "issueKey": string(),
  get "stopKind"() {
    return stopKindSchema;
  }
}), object({
  "name": string(),
  "ownerId": string(),
  "payload": object({
    "ownerId": uuid()
  }).catchall(any())
})]);
lazy(() => listenEvents200Schema);
object({
  "threadId": string()
});
const pauseThread200Schema = any();
lazy(() => pauseThread200Schema);
object({
  "threadId": string()
});
const recordArtifact200Schema = object({
  "artifactId": uuid()
});
object({
  "issueId": optional(uuid()),
  get "kind"() {
    return artifactKindSchema;
  },
  "name": string().min(1),
  "ref": string().min(1),
  "meta": string()
});
lazy(() => recordArtifact200Schema);
object({
  "workspaceId": string()
});
const removeWorkspace200Schema = any();
lazy(() => removeWorkspace200Schema);
object({
  "stopId": string()
});
const resolveStop200Schema = any();
object({
  get "resolution"() {
    return stopResolutionSchema;
  }
});
lazy(() => resolveStop200Schema);
object({
  "issueId": string()
});
const restoreIssue200Schema = any();
lazy(() => restoreIssue200Schema);
object({
  "threadId": string()
});
const resumeThread200Schema = any();
lazy(() => resumeThread200Schema);
object({
  "threadId": string()
});
const sendDirectMessage200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => sendDirectMessage200Schema);
object({
  "ownerId": string()
});
const setActiveOwner200Schema = object({
  "ownerId": string()
});
lazy(() => setActiveOwner200Schema);
object({
  "threadId": string(),
  "participantId": string()
});
const setParticipantInvocation200Schema = any();
object({
  "canInvoke": boolean()
});
lazy(() => setParticipantInvocation200Schema);
object({
  "issueId": string()
});
const steerIssue200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => steerIssue200Schema);
object({
  "threadId": string()
});
const steerThread200Schema = object({
  "entryId": uuid()
});
object({
  "text": string().min(1)
});
lazy(() => steerThread200Schema);
object({
  "issueId": string()
});
const streamTerminalSession200Schema = any();
lazy(() => streamTerminalSession200Schema);
const updateOwnerSettings200Schema = any();
object({
  "name": optional(string().min(1).max(120)),
  "pictureUrl": url().nullish(),
  "timezone": optional(string().min(1))
});
lazy(() => updateOwnerSettings200Schema);
const updateStopCriteria200Schema = any();
object({
  "stopCriteria": object({
    "serverErrors": boolean(),
    "blockedByClassification": boolean(),
    "humanRequested": boolean(),
    "approvalNeeded": boolean()
  })
});
lazy(() => updateStopCriteria200Schema);
const uploadAvatar200Schema = object({
  "pictureUrl": url()
});
lazy(() => uploadAvatar200Schema);
const frontendErrorsEnum = {
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  SESSION_EXPIRED: "SESSION_EXPIRED"
};
const errorsEnum = {
  ...ApiErrorsEnum,
  ...frontendErrorsEnum
};
function getErrorTranslation(code) {
  const t = instance.getFixedT(instance.language, "translation");
  return t(`errors.${code}`) || code;
}
new Proxy({}, {
  get: (_, prop) => {
    if (prop in errorsEnum) {
      return getErrorTranslation(prop);
    }
    return void 0;
  }
});
const defaultErrorHandler = (ctx) => {
  const t = instance.getFixedT(instance.language, "translation");
  const translatedMessage = getErrorTranslation(ctx.code) || ctx.message || getErrorTranslation("UNKNOWN_ERROR");
  toast.error(t("common.errorTitle"), {
    description: translatedMessage
  });
};
const customErrorHandlers = {};
function handleError(code, message, originalError) {
  const errorCode = isValidErrorCode(code) ? code : "UNKNOWN_ERROR";
  const ctx = {
    code: errorCode,
    message,
    originalError
  };
  const handler = customErrorHandlers[errorCode] || defaultErrorHandler;
  handler(ctx);
}
function isValidErrorCode(code) {
  return code in errorsEnum;
}
function translateError(message) {
  if (!message) return getErrorTranslation("UNKNOWN_ERROR");
  if (isValidErrorCode(message)) {
    return getErrorTranslation(message);
  }
  return message;
}
function extractErrorCode(error) {
  if (error && typeof error === "object") {
    if ("code" in error && typeof error.code === "string" && isValidErrorCode(error.code)) {
      return error.code;
    }
    if ("data" in error && error.data && typeof error.data === "object") {
      const data = error.data;
      if ("code" in data && typeof data.code === "string" && isValidErrorCode(data.code)) {
        return data.code;
      }
      if ("name" in data && typeof data.name === "string" && isValidErrorCode(data.name)) {
        return data.name;
      }
    }
    if ("name" in error && typeof error.name === "string" && isValidErrorCode(error.name)) {
      return error.name;
    }
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return "NETWORK_ERROR";
    }
  }
  return "UNKNOWN_ERROR";
}
function handleApiError(error, fallbackMessage) {
  const code = extractErrorCode(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallbackMessage;
  handleError(code, message, error);
}
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function tryCatch(fn) {
  try {
    const data = fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
function getEnumLabel(value) {
  const resources = instance.getResourceBundle(instance.language, "translation");
  const enums2 = resources?.enums;
  if (!enums2 || typeof enums2 !== "object") return void 0;
  for (const enumMap of Object.values(enums2)) {
    if (typeof enumMap === "object" && enumMap !== null && value in enumMap) {
      return enumMap[value];
    }
  }
  return void 0;
}
const zodErrorMap = (issue) => {
  const t = instance.getFixedT(instance.language, "translation", "zod");
  switch (issue.code) {
    case "invalid_type":
      if (!issue.received || issue.received === "undefined" || issue.received === "null") {
        return t("required");
      }
      return t("invalid_type", { expected: issue.expected, received: issue.received });
    case "too_small":
      if (issue.origin === "string") {
        if (issue.minimum === 1) {
          return t("required");
        }
        return t("too_small_string", { minimum: issue.minimum });
      }
      if (issue.origin === "number") {
        return t("too_small_number", { minimum: issue.minimum });
      }
      if (issue.origin === "array") {
        return t("too_small_array", { minimum: issue.minimum });
      }
      break;
    case "too_big":
      if (issue.origin === "string") {
        return t("too_big_string", { maximum: issue.maximum });
      }
      if (issue.origin === "number") {
        return t("too_big_number", { maximum: issue.maximum });
      }
      if (issue.origin === "array") {
        return t("too_big_array", { maximum: issue.maximum });
      }
      break;
    case "invalid_value": {
      const values = issue.values ?? [];
      const maxShown = 3;
      const shown = values.slice(0, maxShown).map((v) => {
        const label = getEnumLabel(String(v));
        return `"${label ?? v}"`;
      }).join(", ");
      const options = values.length > maxShown ? `${shown}, ...` : shown;
      return t("invalid_enum_value", { options });
    }
    case "invalid_format":
      if (issue.format === "email") {
        return t("invalid_format_email");
      }
      if (issue.format === "url") {
        return t("invalid_format_url");
      }
      if (issue.format === "uuid") {
        return t("invalid_format_uuid");
      }
      if (issue.format === "regex") {
        return t("invalid_format_regex");
      }
      if (issue.format === "datetime") {
        return t("invalid_format_datetime");
      }
      break;
  }
  return void 0;
};
function configureZod() {
  config({ customError: zodErrorMap });
}
const surface = "bg-card border border-border";
function Toaster({ theme = "system", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      icons: {
        success: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCircleCheck, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 12,
          columnNumber: 14
        }, this),
        info: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconInfoCircle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 13,
          columnNumber: 11
        }, this),
        warning: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertTriangle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 14,
          columnNumber: 14
        }, this),
        error: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertOctagon, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 15,
          columnNumber: 12
        }, this),
        loading: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLoader, { className: "size-4 animate-spin" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 16,
          columnNumber: 14
        }, this)
      },
      style: (
        // Neutralize sonner's internal --*-bg / --*-border vars so the surface
        // gradient applied via classNames.toast is what gets painted. Per-type
        // text colors are handled by [data-sonner-toast][data-type="…"] rules
        // in index.css.
        {
          "--normal-bg": "transparent",
          "--normal-text": "var(--foreground)",
          "--normal-border": "transparent",
          "--success-bg": "transparent",
          "--success-text": "var(--success)",
          "--success-border": "transparent",
          "--error-bg": "transparent",
          "--error-text": "var(--destructive)",
          "--error-border": "transparent",
          "--warning-bg": "transparent",
          "--warning-text": "var(--warning)",
          "--warning-border": "transparent",
          "--info-bg": "transparent",
          "--info-text": "var(--info)",
          "--info-border": "transparent",
          "--border-radius": "var(--radius)"
        }
      ),
      toastOptions: {
        classNames: {
          toast: `${surface} group toast rounded-lg group-[.toaster]:shadow-lg`,
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/sonner.tsx",
      lineNumber: 8,
      columnNumber: 3
    },
    this
  );
}
const buttonVariants = cva(
  "focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-full text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ease-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85 font-semibold",
        primaryAlt: "bg-foreground text-background hover:bg-foreground/90 font-semibold",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60",
        outline: "border border-border bg-background text-foreground hover:bg-muted active:bg-muted/70",
        ghost: "border border-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold",
        warning: "border border-warning/40 text-warning hover:bg-warning/10 aria-expanded:bg-warning/10",
        link: "text-foreground underline-offset-4 hover:underline aria-expanded:underline"
      },
      size: {
        default: "h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
        none: ""
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
const Button = reactExports.forwardRef(function Button2({ className, variant, size, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button$1, { ref, "data-slot": "button", className: cn(buttonVariants({ variant, size }), className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/button.tsx",
    lineNumber: 48,
    columnNumber: 9
  }, this);
});
function Empty({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty",
      className: cn(
        "gap-4 rounded-lg border-dashed p-6 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 7,
      columnNumber: 3
    },
    this
  );
}
function EmptyHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-header", className: cn("gap-2 flex max-w-sm flex-col items-center", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 19,
    columnNumber: 9
  }, this);
}
const emptyMediaVariants = cva("mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-transparent",
      icon: "bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-4"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});
function EmptyMedia({ className, variant = "default", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-icon", "data-variant": variant, className: cn(emptyMediaVariants({ variant, className })), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 35,
    columnNumber: 9
  }, this);
}
function EmptyTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-title", className: cn("text-sm font-medium tracking-tight", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 39,
    columnNumber: 9
  }, this);
}
function EmptyDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty-description",
      className: cn("text-sm/relaxed text-muted-foreground [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 44,
      columnNumber: 3
    },
    this
  );
}
function EmptyContent({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "empty-content",
      className: cn("gap-2.5 text-sm flex w-full max-w-sm min-w-0 flex-col items-center text-balance", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 54,
      columnNumber: 3
    },
    this
  );
}
function RouteError({ title, description }) {
  const router2 = useRouter();
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("common.errorTitle");
  const resolvedDescription = description ?? t("errors.UNKNOWN_ERROR");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { className: "flex-1 border-none", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyHeader, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyMedia, { variant: "icon", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertTriangle, { className: "text-destructive" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 23,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 22,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: resolvedTitle }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: resolvedDescription }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 26,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 21,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyContent, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", size: "sm", onClick: () => router2.history.back(), children: t("common.back") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 29,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/RouteError/index.tsx",
    lineNumber: 20,
    columnNumber: 3
  }, this);
}
const Route$g = createRootRouteWithContext()({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "App" }]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RouteError
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("html", { lang: "pt", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("head", { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HeadContent, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 28,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("body", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { id: "root", children }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
        lineNumber: 31,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Scripts, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 30,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
function RootComponent() {
  const { queryClient } = Route$g.useRouteContext();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(QueryClientProvider, { client: queryClient, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 42,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toaster, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 43,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TanStackRouterDevtools, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 44,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ReactQueryDevtools2, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
      lineNumber: 45,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/__root.tsx",
    lineNumber: 41,
    columnNumber: 3
  }, this);
}
const Route$f = createFileRoute("/")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  }
});
const $$splitComponentImporter$e = () => import("./route-CQq1fHqL.mjs");
const Route$e = createFileRoute("/(app)")({
  component: lazyRouteComponent($$splitComponentImporter$e, "component")
});
const $$splitComponentImporter$d = () => import("./index-DT525tQU.mjs");
const Route$d = createFileRoute("/attach/")({
  component: lazyRouteComponent($$splitComponentImporter$d, "component")
});
const $$splitComponentImporter$c = () => import("./index-De29gp36.mjs");
const Route$c = createFileRoute("/onboarding/")({
  component: lazyRouteComponent($$splitComponentImporter$c, "component")
});
const $$splitComponentImporter$b = () => import("./index-C7R4foa-.mjs");
const Route$b = createFileRoute("/styleguide/")({
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./index-C_5Xs0c3.mjs");
const Route$a = createFileRoute("/(app)/channels/")({
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
const $$splitComponentImporter$9 = () => import("./index-CKdhneyw.mjs");
const Route$9 = createFileRoute("/(app)/dashboard/")({
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
const $$splitComponentImporter$8 = () => import("./index-MDby_kdN.mjs");
const Route$8 = createFileRoute("/(app)/issues/")({
  validateSearch: (search) => ({
    archived: search.archived === true
  }),
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./index-CEOOsmIr.mjs");
const Route$7 = createFileRoute("/(app)/settings/")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./route-DBJW7bfT.mjs");
const Route$6 = createFileRoute("/(app)/threads/$threadId")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./index-C1MiSaZm.mjs");
const Route$5 = createFileRoute("/(app)/workspaces/")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./index-Bs052VJq.mjs");
const Route$4 = createFileRoute("/(app)/settings/account/")({
  staticData: {
    breadcrumb: "Minha Conta"
  },
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./index-B5dVI1R1.mjs");
const Route$3 = createFileRoute("/(app)/threads/$threadId/")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./index-X1dUhVwm.mjs");
const Route$2 = createFileRoute("/(app)/threads/$threadId/artifacts/")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./index-Djwz0xk_.mjs");
const Route$1 = createFileRoute("/(app)/threads/$threadId/issues/")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./index-BKvOqWVL.mjs");
const Route = createFileRoute("/(app)/threads/$threadId/issues/$issueId/")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const IndexRoute = Route$f.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$g
});
const appRouteRoute = Route$e.update({
  id: "/(app)",
  getParentRoute: () => Route$g
});
const AttachIndexRoute = Route$d.update({
  id: "/attach/",
  path: "/attach/",
  getParentRoute: () => Route$g
});
const OnboardingIndexRoute = Route$c.update({
  id: "/onboarding/",
  path: "/onboarding/",
  getParentRoute: () => Route$g
});
const StyleguideIndexRoute = Route$b.update({
  id: "/styleguide/",
  path: "/styleguide/",
  getParentRoute: () => Route$g
});
const appChannelsIndexRoute = Route$a.update({
  id: "/channels/",
  path: "/channels/",
  getParentRoute: () => appRouteRoute
});
const appDashboardIndexRoute = Route$9.update({
  id: "/dashboard/",
  path: "/dashboard/",
  getParentRoute: () => appRouteRoute
});
const appIssuesIndexRoute = Route$8.update({
  id: "/issues/",
  path: "/issues/",
  getParentRoute: () => appRouteRoute
});
const appSettingsIndexRoute = Route$7.update({
  id: "/settings/",
  path: "/settings/",
  getParentRoute: () => appRouteRoute
});
const appThreadsThreadIdRouteRoute = Route$6.update({
  id: "/threads/$threadId",
  path: "/threads/$threadId",
  getParentRoute: () => appRouteRoute
});
const appWorkspacesIndexRoute = Route$5.update({
  id: "/workspaces/",
  path: "/workspaces/",
  getParentRoute: () => appRouteRoute
});
const appSettingsAccountIndexRoute = Route$4.update({
  id: "/settings/account/",
  path: "/settings/account/",
  getParentRoute: () => appRouteRoute
});
const appThreadsThreadIdIndexRoute = Route$3.update({
  id: "/",
  path: "/",
  getParentRoute: () => appThreadsThreadIdRouteRoute
});
const appThreadsThreadIdArtifactsIndexRoute = Route$2.update({
  id: "/artifacts/",
  path: "/artifacts/",
  getParentRoute: () => appThreadsThreadIdRouteRoute
});
const appThreadsThreadIdIssuesIndexRoute = Route$1.update({
  id: "/issues/",
  path: "/issues/",
  getParentRoute: () => appThreadsThreadIdRouteRoute
});
const appThreadsThreadIdIssuesIssueIdIndexRoute = Route.update({
  id: "/issues/$issueId/",
  path: "/issues/$issueId/",
  getParentRoute: () => appThreadsThreadIdRouteRoute
});
const appThreadsThreadIdRouteRouteChildren = {
  appThreadsThreadIdIndexRoute,
  appThreadsThreadIdArtifactsIndexRoute,
  appThreadsThreadIdIssuesIndexRoute,
  appThreadsThreadIdIssuesIssueIdIndexRoute
};
const appThreadsThreadIdRouteRouteWithChildren = appThreadsThreadIdRouteRoute._addFileChildren(
  appThreadsThreadIdRouteRouteChildren
);
const appRouteRouteChildren = {
  appThreadsThreadIdRouteRoute: appThreadsThreadIdRouteRouteWithChildren,
  appChannelsIndexRoute,
  appDashboardIndexRoute,
  appIssuesIndexRoute,
  appSettingsIndexRoute,
  appWorkspacesIndexRoute,
  appSettingsAccountIndexRoute
};
const appRouteRouteWithChildren = appRouteRoute._addFileChildren(
  appRouteRouteChildren
);
const rootRouteChildren = {
  IndexRoute,
  appRouteRoute: appRouteRouteWithChildren,
  AttachIndexRoute,
  OnboardingIndexRoute,
  StyleguideIndexRoute
};
const routeTree = Route$g._addFileChildren(rootRouteChildren)._addFileTypes();
configureZod();
configureClient({
  typescript: Config.baseUrl,
  rust: Config.baseUrl,
  go: Config.baseUrl
});
function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => handleApiError(error)
    }),
    mutationCache: new MutationCache({
      onError: (error) => handleApiError(error)
    }),
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: false
      }
    }
  });
  return createRouter({
    routeTree,
    basepath: "/app",
    context: { queryClient },
    // Prefetch route chunks + loaders on hover/focus. `defaultPreloadStaleTime: 0`
    // hands staleness control to React Query: the loader always re-runs and
    // `ensureQueryData` decides from its cache whether a request actually fires.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true
  });
}
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Button as B,
  Config as C,
  Empty as E,
  Route$6 as R,
  attachThreadMutationRequestSchema as a,
  EmptyTitle as b,
  cn as c,
  EmptyDescription as d,
  Route$3 as e,
  tryCatch as f,
  Route$2 as g,
  Route$1 as h,
  Route as i,
  createClient as j,
  router as r,
  surface as s,
  translateError as t
};
