import { k as ky, H as HTTPError } from "../_libs/ky.mjs";
import { b as QueryClient, c as MutationCache, d as QueryCache } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, d as createRootRouteWithContext, H as HeadContent, S as Scripts, O as Outlet, e as createFileRoute, l as lazyRouteComponent, f as useRouter } from "../_libs/tanstack__react-router.mjs";
import { J as redirect } from "../_libs/tanstack__router-core.mjs";
import { c as capitalizeFirstLetter, e as env, B as BetterAuthError } from "../_libs/better-auth__core.mjs";
import { d as defu } from "../_libs/defu.mjs";
import { c as createFetch } from "../_libs/better-fetch__fetch.mjs";
import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { i as instance } from "../_libs/i18next.mjs";
import { t as toast, T as Toaster$1 } from "../_libs/sonner.mjs";
import { c as clsx } from "../_libs/clsx.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { R as ReactQueryDevtools2 } from "../_libs/tanstack__react-query-devtools.mjs";
import { T as TanStackRouterDevtools } from "../_libs/@tanstack/react-router-devtools+[...].mjs";
import { i as initReactI18next, u as useTranslation } from "../_libs/react-i18next.mjs";
import { E as Button$1 } from "../_libs/base-ui__react.mjs";
import { p as IconAlertTriangle, q as IconLoader, r as IconAlertOctagon, s as IconInfoCircle, t as IconCircleCheck } from "../_libs/tabler__icons-react.mjs";
import { l as listenKeys, o as onMount, a as atom } from "../_libs/nanostores.mjs";
import { _ as _enum, o as object, s as string, i as int, l as lazy, a as optional, b as boolean, n as nullable, d as datetime, u as uuid, c as array, f as number, e as email, g as any, h as number$1, j as union, k as url, m as config, p as date } from "../_libs/zod.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
const SYMBOL = /* @__PURE__ */ Symbol.for("@template/client-typescript:baseUrls");
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
function buildRetryOptions(retry) {
  if (retry === false) return 0;
  if (typeof retry === "number") return retry;
  if (!retry) return DEFAULT_RETRY;
  return {
    limit: retry.limit ?? DEFAULT_RETRY.limit,
    methods: retry.methods ?? DEFAULT_RETRY.methods,
    statusCodes: retry.statusCodes ?? DEFAULT_RETRY.statusCodes,
    backoffLimit: retry.backoffLimit ?? DEFAULT_RETRY.backoffLimit,
    retryOnTimeout: retry.retryOnTimeout ?? DEFAULT_RETRY.retryOnTimeout,
    jitter: retry.jitter ?? DEFAULT_RETRY.jitter,
    ...retry.delay && { delay: retry.delay }
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
    const { url: url2, params, method, data, responseType = "json", signal, headers, retry, timeout, baseURL } = config2;
    const resolvedUrl = resolveURL(service, url2, baseURL);
    const searchParams = params ? new URLSearchParams(serializeParams(params)) : void 0;
    const body = buildBody(data);
    const isJsonBody = body != null && !isBodyInit(data);
    const kyOptions = {
      method: method.toLowerCase(),
      searchParams,
      signal,
      headers,
      retry: buildRetryOptions(retry),
      ...timeout !== void 0 && { timeout },
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
function checkHasPath(url2) {
  try {
    return (new URL(url2).pathname.replace(/\/+$/, "") || "/") !== "/";
  } catch {
    throw new BetterAuthError(`Invalid base URL: ${url2}. Please provide a valid base URL.`);
  }
}
function assertHasProtocol(url2) {
  try {
    const parsedUrl = new URL(url2);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new BetterAuthError(`Invalid base URL: ${url2}. URL must include 'http://' or 'https://'`);
  } catch (error) {
    if (error instanceof BetterAuthError) throw error;
    throw new BetterAuthError(`Invalid base URL: ${url2}. Please provide a valid base URL.`, { cause: error });
  }
}
function withPath(url2, path = "/api/auth") {
  assertHasProtocol(url2);
  if (checkHasPath(url2)) return url2;
  const trimmedUrl = url2.replace(/\/+$/, "");
  if (!path || path === "/") return trimmedUrl;
  path = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedUrl}${path}`;
}
function getBaseURL(url2, path, request, loadEnv, trustedProxyHeaders) {
  if (url2) return withPath(url2, path);
  {
    const fromEnv = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_BETTER_AUTH_URL || env.PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_AUTH_URL || (env.BASE_URL !== "/" ? env.BASE_URL : void 0);
    if (fromEnv) return withPath(fromEnv, path);
  }
  if (typeof window !== "undefined" && window.location) return withPath(window.location.origin, path);
}
const PROTO_POLLUTION_PATTERNS = {
  proto: /"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/,
  constructor: /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/,
  protoShort: /"__proto__"\s*:/,
  constructorShort: /"constructor"\s*:/
};
const JSON_SIGNATURE = /^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;
const SPECIAL_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: void 0,
  nan: NaN,
  infinity: Number.POSITIVE_INFINITY,
  "-infinity": Number.NEGATIVE_INFINITY
};
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function isValidDate(date2) {
  return date2 instanceof Date && !isNaN(date2.getTime());
}
function parseISODate(value) {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, ms, offsetSign, offsetHour, offsetMinute] = match;
  const date2 = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10), ms ? parseInt(ms.padEnd(3, "0"), 10) : 0));
  if (offsetSign) {
    const offset = (parseInt(offsetHour, 10) * 60 + parseInt(offsetMinute, 10)) * (offsetSign === "+" ? -1 : 1);
    date2.setUTCMinutes(date2.getUTCMinutes() + offset);
  }
  return isValidDate(date2) ? date2 : null;
}
function betterJSONParse(value, options = {}) {
  const { strict = false, warnings = false, reviver, parseDates = true } = options;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length > 0 && trimmed[0] === '"' && trimmed.endsWith('"') && !trimmed.slice(1, -1).includes('"')) return trimmed.slice(1, -1);
  const lowerValue = trimmed.toLowerCase();
  if (lowerValue.length <= 9 && lowerValue in SPECIAL_VALUES) return SPECIAL_VALUES[lowerValue];
  if (!JSON_SIGNATURE.test(trimmed)) {
    if (strict) throw new SyntaxError("[better-json] Invalid JSON");
    return value;
  }
  if (Object.entries(PROTO_POLLUTION_PATTERNS).some(([key, pattern]) => {
    const matches = pattern.test(trimmed);
    if (matches && warnings) console.warn(`[better-json] Detected potential prototype pollution attempt using ${key} pattern`);
    return matches;
  }) && strict) throw new Error("[better-json] Potential prototype pollution attempt detected");
  try {
    const secureReviver = (key, value2) => {
      if (key === "__proto__" || key === "constructor" && value2 && typeof value2 === "object" && "prototype" in value2) {
        if (warnings) console.warn(`[better-json] Dropping "${key}" key to prevent prototype pollution`);
        return;
      }
      if (parseDates && typeof value2 === "string") {
        const date2 = parseISODate(value2);
        if (date2) return date2;
      }
      return reviver ? reviver(key, value2) : value2;
    };
    return JSON.parse(trimmed, secureReviver);
  } catch (error) {
    if (strict) throw error;
    return value;
  }
}
function parseJSON(value, options = { strict: true }) {
  return betterJSONParse(value, options);
}
const redirectPlugin = {
  id: "redirect",
  name: "Redirect",
  hooks: { onSuccess(context) {
    if (context.data?.url && context.data?.redirect) {
      if (typeof window !== "undefined" && window.location) {
        if (window.location) try {
          window.location.href = context.data.url;
        } catch {
        }
      }
    }
  } }
};
const isServer = () => typeof window === "undefined";
const useAuthQuery = (initializedAtom, path, $fetch, options) => {
  const value = atom({
    data: null,
    error: null,
    isPending: true,
    isRefetching: false,
    refetch: (queryParams) => fn(queryParams)
  });
  const fn = async (queryParams) => {
    return new Promise((resolve) => {
      const opts = typeof options === "function" ? options({
        data: value.get().data,
        error: value.get().error,
        isPending: value.get().isPending
      }) : options;
      $fetch(path, {
        ...opts,
        query: {
          ...opts?.query,
          ...queryParams?.query
        },
        async onSuccess(context) {
          value.set({
            data: context.data,
            error: null,
            isPending: false,
            isRefetching: false,
            refetch: value.value.refetch
          });
          await opts?.onSuccess?.(context);
        },
        async onError(context) {
          const { request } = context;
          const retryAttempts = typeof request.retry === "number" ? request.retry : request.retry?.attempts;
          const retryAttempt = request.retryAttempt || 0;
          if (retryAttempts && retryAttempt < retryAttempts) return;
          const isUnauthorized = context.error.status === 401;
          value.set({
            error: context.error,
            data: isUnauthorized ? null : value.get().data,
            isPending: false,
            isRefetching: false,
            refetch: value.value.refetch
          });
          await opts?.onError?.(context);
        },
        async onRequest(context) {
          const currentValue = value.get();
          value.set({
            isPending: currentValue.data === null,
            data: currentValue.data,
            error: null,
            isRefetching: true,
            refetch: value.value.refetch
          });
          await opts?.onRequest?.(context);
        }
      }).catch((error) => {
        value.set({
          error,
          data: value.get().data,
          isPending: false,
          isRefetching: false,
          refetch: value.value.refetch
        });
      }).finally(() => {
        resolve(void 0);
      });
    });
  };
  initializedAtom = Array.isArray(initializedAtom) ? initializedAtom : [initializedAtom];
  let isInitialized = false;
  for (const initAtom of initializedAtom) initAtom.subscribe(async () => {
    if (isServer()) return;
    if (isInitialized) await fn();
    else onMount(value, () => {
      const timeoutId = setTimeout(async () => {
        if (!isInitialized) {
          isInitialized = true;
          await fn();
        }
      }, 0);
      return () => {
        value.off();
        initAtom.off();
        clearTimeout(timeoutId);
      };
    });
  });
  return value;
};
const kBroadcastChannel = /* @__PURE__ */ Symbol.for("better-auth:broadcast-channel");
const now$1 = () => Math.floor(Date.now() / 1e3);
var WindowBroadcastChannel = class {
  listeners = /* @__PURE__ */ new Set();
  name;
  constructor(name = "better-auth.message") {
    this.name = name;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  post(message) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.name, JSON.stringify({
        ...message,
        timestamp: now$1()
      }));
    } catch {
    }
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const handler = (event) => {
      if (event.key !== this.name) return;
      const message = JSON.parse(event.newValue ?? "{}");
      if (message?.event !== "session" || !message?.data) return;
      this.listeners.forEach((listener) => listener(message));
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }
};
function getGlobalBroadcastChannel(name = "better-auth.message") {
  if (!globalThis[kBroadcastChannel]) globalThis[kBroadcastChannel] = new WindowBroadcastChannel(name);
  return globalThis[kBroadcastChannel];
}
const kFocusManager = /* @__PURE__ */ Symbol.for("better-auth:focus-manager");
var WindowFocusManager = class {
  listeners = /* @__PURE__ */ new Set();
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setFocused(focused) {
    this.listeners.forEach((listener) => listener(focused));
  }
  setup() {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") this.setFocused(true);
    };
    document.addEventListener("visibilitychange", visibilityHandler, false);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler, false);
    };
  }
};
function getGlobalFocusManager() {
  if (!globalThis[kFocusManager]) globalThis[kFocusManager] = new WindowFocusManager();
  return globalThis[kFocusManager];
}
const kOnlineManager = /* @__PURE__ */ Symbol.for("better-auth:online-manager");
var WindowOnlineManager = class {
  listeners = /* @__PURE__ */ new Set();
  isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setOnline(online) {
    this.isOnline = online;
    this.listeners.forEach((listener) => listener(online));
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);
    window.addEventListener("online", onOnline, false);
    window.addEventListener("offline", onOffline, false);
    return () => {
      window.removeEventListener("online", onOnline, false);
      window.removeEventListener("offline", onOffline, false);
    };
  }
};
function getGlobalOnlineManager() {
  if (!globalThis[kOnlineManager]) globalThis[kOnlineManager] = new WindowOnlineManager();
  return globalThis[kOnlineManager];
}
const now = () => Math.floor(Date.now() / 1e3);
function normalizeSessionResponse(res) {
  if (typeof res === "object" && res !== null && "data" in res && "error" in res) return res;
  return {
    data: res,
    error: null
  };
}
const FOCUS_REFETCH_RATE_LIMIT_SECONDS = 5;
function createSessionRefreshManager(opts) {
  const { sessionAtom, sessionSignal, $fetch, options = {} } = opts;
  const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
  const refetchOnWindowFocus = options.sessionOptions?.refetchOnWindowFocus ?? true;
  const refetchWhenOffline = options.sessionOptions?.refetchWhenOffline ?? false;
  const state = {
    lastSync: 0,
    lastSessionRequest: 0,
    cachedSession: void 0
  };
  const shouldRefetch = () => {
    return refetchWhenOffline || getGlobalOnlineManager().isOnline;
  };
  const triggerRefetch = (event) => {
    if (!shouldRefetch()) return;
    if (event?.event === "storage") {
      state.lastSync = now();
      sessionSignal.set(!sessionSignal.get());
      return;
    }
    const currentSession = sessionAtom.get();
    const fetchSessionWithRefresh = () => {
      state.lastSessionRequest = now();
      $fetch("/get-session").then(async (res) => {
        let { data, error } = normalizeSessionResponse(res);
        if (data?.needsRefresh) try {
          const refreshRes = await $fetch("/get-session", { method: "POST" });
          ({ data, error } = normalizeSessionResponse(refreshRes));
        } catch {
        }
        const sessionData = data?.session && data?.user ? data : null;
        sessionAtom.set({
          ...currentSession,
          data: sessionData,
          error
        });
        state.lastSync = now();
        sessionSignal.set(!sessionSignal.get());
      }).catch(() => {
      });
    };
    if (event?.event === "poll") {
      fetchSessionWithRefresh();
      return;
    }
    if (event?.event === "visibilitychange") {
      if (now() - state.lastSessionRequest < FOCUS_REFETCH_RATE_LIMIT_SECONDS) return;
      state.lastSessionRequest = now();
    }
    if (event?.event === "visibilitychange") {
      fetchSessionWithRefresh();
      return;
    }
    if (currentSession?.data === null || currentSession?.data === void 0) {
      state.lastSync = now();
      sessionSignal.set(!sessionSignal.get());
    }
  };
  const broadcastSessionUpdate = (trigger2) => {
    getGlobalBroadcastChannel().post({
      event: "session",
      data: { trigger: trigger2 },
      clientId: Math.random().toString(36).substring(7)
    });
  };
  const setupPolling = () => {
    if (refetchInterval && refetchInterval > 0) state.pollInterval = setInterval(() => {
      if (sessionAtom.get()?.data) triggerRefetch({ event: "poll" });
    }, refetchInterval * 1e3);
  };
  const setupBroadcast = () => {
    state.unsubscribeBroadcast = getGlobalBroadcastChannel().subscribe(() => {
      triggerRefetch({ event: "storage" });
    });
  };
  const setupFocusRefetch = () => {
    if (!refetchOnWindowFocus) return;
    state.unsubscribeFocus = getGlobalFocusManager().subscribe(() => {
      triggerRefetch({ event: "visibilitychange" });
    });
  };
  const setupOnlineRefetch = () => {
    state.unsubscribeOnline = getGlobalOnlineManager().subscribe((online) => {
      if (online) triggerRefetch({ event: "visibilitychange" });
    });
  };
  const init = () => {
    setupPolling();
    setupBroadcast();
    setupFocusRefetch();
    setupOnlineRefetch();
    getGlobalBroadcastChannel().setup();
    getGlobalFocusManager().setup();
    getGlobalOnlineManager().setup();
  };
  const cleanup = () => {
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = void 0;
    }
    if (state.unsubscribeBroadcast) {
      state.unsubscribeBroadcast();
      state.unsubscribeBroadcast = void 0;
    }
    if (state.unsubscribeFocus) {
      state.unsubscribeFocus();
      state.unsubscribeFocus = void 0;
    }
    if (state.unsubscribeOnline) {
      state.unsubscribeOnline();
      state.unsubscribeOnline = void 0;
    }
    state.lastSync = 0;
    state.lastSessionRequest = 0;
    state.cachedSession = void 0;
  };
  return {
    init,
    cleanup,
    triggerRefetch,
    broadcastSessionUpdate
  };
}
function getSessionAtom($fetch, options) {
  const $signal = atom(false);
  const session = useAuthQuery($signal, "/get-session", $fetch, { method: "GET" });
  let broadcastSessionUpdate = () => {
  };
  onMount(session, () => {
    const refreshManager = createSessionRefreshManager({
      sessionAtom: session,
      sessionSignal: $signal,
      $fetch,
      options
    });
    refreshManager.init();
    broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;
    return () => {
      refreshManager.cleanup();
    };
  });
  return {
    session,
    $sessionSignal: $signal,
    broadcastSessionUpdate: (trigger2) => broadcastSessionUpdate(trigger2)
  };
}
const resolvePublicAuthUrl = (basePath) => {
  if (typeof process === "undefined") return void 0;
  const path = basePath ?? "/api/auth";
  if (process.env.NEXT_PUBLIC_AUTH_URL) return process.env.NEXT_PUBLIC_AUTH_URL;
  if (typeof window === "undefined") {
    if (process.env.NEXTAUTH_URL) try {
      return process.env.NEXTAUTH_URL;
    } catch {
    }
    if (process.env.VERCEL_URL) try {
      const protocol = process.env.VERCEL_URL.startsWith("http") ? "" : "https://";
      return `${new URL(`${protocol}${process.env.VERCEL_URL}`).origin}${path}`;
    } catch {
    }
  }
};
const getClientConfig = (options, loadEnv) => {
  const isCredentialsSupported = "credentials" in Request.prototype;
  const baseURL = getBaseURL(options?.baseURL, options?.basePath) ?? resolvePublicAuthUrl(options?.basePath) ?? "/api/auth";
  const pluginsFetchPlugins = options?.plugins?.flatMap((plugin) => plugin.fetchPlugins).filter((pl) => pl !== void 0) || [];
  const lifeCyclePlugin = {
    id: "lifecycle-hooks",
    name: "lifecycle-hooks",
    hooks: {
      onSuccess: options?.fetchOptions?.onSuccess,
      onError: options?.fetchOptions?.onError,
      onRequest: options?.fetchOptions?.onRequest,
      onResponse: options?.fetchOptions?.onResponse
    }
  };
  const { onSuccess: _onSuccess, onError: _onError, onRequest: _onRequest, onResponse: _onResponse, ...restOfFetchOptions } = options?.fetchOptions || {};
  const $fetch = createFetch({
    baseURL,
    ...isCredentialsSupported ? { credentials: "include" } : {},
    method: "GET",
    jsonParser(text) {
      if (!text) return null;
      return parseJSON(text, { strict: false });
    },
    customFetchImpl: fetch,
    ...restOfFetchOptions,
    plugins: [
      lifeCyclePlugin,
      ...restOfFetchOptions.plugins || [],
      ...options?.disableDefaultFetchPlugins ? [] : [redirectPlugin],
      ...pluginsFetchPlugins
    ]
  });
  const { $sessionSignal, session, broadcastSessionUpdate } = getSessionAtom($fetch, options);
  const plugins = options?.plugins || [];
  let pluginsActions = {};
  const pluginsAtoms = {
    $sessionSignal,
    session
  };
  const pluginPathMethods = {
    "/sign-out": "POST",
    "/revoke-sessions": "POST",
    "/revoke-other-sessions": "POST",
    "/delete-user": "POST"
  };
  const atomListeners = [{
    signal: "$sessionSignal",
    matcher(path) {
      return path === "/sign-out" || path === "/update-user" || path === "/update-session" || path === "/sign-up/email" || path === "/sign-in/email" || path === "/delete-user" || path === "/verify-email" || path === "/revoke-sessions" || path === "/revoke-session" || path === "/revoke-other-sessions" || path === "/change-email" || path === "/change-password";
    },
    callback(path) {
      if (path === "/sign-out") broadcastSessionUpdate("signout");
      else if (path === "/update-user" || path === "/update-session") broadcastSessionUpdate("updateUser");
    }
  }];
  for (const plugin of plugins) {
    if (plugin.getAtoms) Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
    if (plugin.pathMethods) Object.assign(pluginPathMethods, plugin.pathMethods);
    if (plugin.atomListeners) atomListeners.push(...plugin.atomListeners);
  }
  const $store = {
    notify: (signal) => {
      pluginsAtoms[signal].set(!pluginsAtoms[signal].get());
    },
    listen: (signal, listener) => {
      pluginsAtoms[signal].subscribe(listener);
    },
    atoms: pluginsAtoms
  };
  for (const plugin of plugins) if (plugin.getActions) pluginsActions = defu(plugin.getActions?.($fetch, $store, options) ?? {}, pluginsActions);
  return {
    get baseURL() {
      return baseURL;
    },
    pluginsActions,
    pluginsAtoms,
    pluginPathMethods,
    atomListeners,
    $fetch,
    $store
  };
};
function isAtom(value) {
  return typeof value === "object" && value !== null && "get" in value && typeof value.get === "function" && "lc" in value && typeof value.lc === "number";
}
function getMethod(path, knownPathMethods, args) {
  const method = knownPathMethods[path];
  const { fetchOptions, query: _query, ...body } = args || {};
  if (method) return method;
  if (fetchOptions?.method) return fetchOptions.method;
  if (body && Object.keys(body).length > 0) return "POST";
  return "GET";
}
function createDynamicPathProxy(routes, client, knownPathMethods, atoms, atomListeners) {
  function createProxy(path = []) {
    return new Proxy(function() {
    }, {
      get(_, prop) {
        if (typeof prop !== "string") return;
        if (prop === "then" || prop === "catch" || prop === "finally") return;
        const fullPath = [...path, prop];
        let current = routes;
        for (const segment of fullPath) if (current && typeof current === "object" && segment in current) current = current[segment];
        else {
          current = void 0;
          break;
        }
        if (typeof current === "function") return current;
        if (isAtom(current)) return current;
        return createProxy(fullPath);
      },
      apply: async (_, __, args) => {
        const routePath = "/" + path.map((segment) => segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join("/");
        const arg = args[0] || {};
        const fetchOptions = args[1] || {};
        const { query, fetchOptions: argFetchOptions, ...body } = arg;
        const options = {
          ...fetchOptions,
          ...argFetchOptions
        };
        const method = getMethod(routePath, knownPathMethods, arg);
        return await client(routePath, {
          ...options,
          body: method === "GET" ? void 0 : {
            ...body,
            ...options?.body || {}
          },
          query: query || options?.query,
          method,
          async onSuccess(context) {
            await options?.onSuccess?.(context);
            if (!atomListeners || options.disableSignal) return;
            const matches = atomListeners.filter((s) => s.matcher(routePath));
            if (!matches.length) return;
            const visited = /* @__PURE__ */ new Set();
            for (const match of matches) {
              const signal = atoms[match.signal];
              if (!signal) return;
              if (visited.has(match.signal)) continue;
              visited.add(match.signal);
              const val = signal.get();
              setTimeout(() => {
                signal.set(!val);
              }, 10);
              match.callback?.(routePath);
            }
          }
        });
      }
    });
  }
  return createProxy();
}
function useStore(store, options = {}) {
  const snapshotRef = reactExports.useRef(store.get());
  const { keys, deps = [store, keys] } = options;
  const subscribe = reactExports.useCallback((onChange) => {
    const emitChange = (value) => {
      if (snapshotRef.current === value) return;
      snapshotRef.current = value;
      onChange();
    };
    emitChange(store.value);
    if (keys?.length) return listenKeys(store, keys, emitChange);
    return store.listen(emitChange);
  }, deps);
  const get = () => snapshotRef.current;
  return reactExports.useSyncExternalStore(subscribe, get, get);
}
function getAtomKey(str) {
  return `use${capitalizeFirstLetter(str)}`;
}
function createAuthClient(options) {
  const { pluginPathMethods, pluginsActions, pluginsAtoms, $fetch, $store, atomListeners } = getClientConfig(options);
  const resolvedHooks = {};
  for (const [key, value] of Object.entries(pluginsAtoms)) resolvedHooks[getAtomKey(key)] = () => useStore(value);
  return createDynamicPathProxy({
    ...pluginsActions,
    ...resolvedHooks,
    $fetch,
    $store
  }, $fetch, pluginPathMethods, pluginsAtoms, atomListeners);
}
const Config = {
  baseUrl: "http://localhost:3030"
};
const auth$2 = createAuthClient({
  baseURL: `${Config.baseUrl}/v1/authentication`
});
const account$1 = { "header": { "title": "Minha Conta" }, "preferences": { "currency": "Moeda (somente leitura)", "language": "Idioma", "languagePlaceholder": "Selecione um idioma", "loadError": "Erro ao carregar as preferências", "save": "Salvar preferências", "saveSuccess": "Preferências atualizadas com sucesso", "sectionDescription": "Configure idioma, fuso horário e notificações", "sectionTitle": "Preferências", "timezone": "Fuso horário" }, "profile": { "avatar": { "remove": "Remover foto", "upload": "Enviar foto", "uploadAriaLabel": "Escolher imagem de perfil", "uploadStub": "Upload de avatar ainda não disponível" }, "company": "Empresa", "email": "E-mail", "loadError": "Erro ao carregar os dados do perfil", "name": "Nome", "save": "Salvar alterações", "saveSuccess": "Perfil atualizado com sucesso", "sectionDescription": "Atualize suas informações pessoais", "sectionTitle": "Perfil" }, "security": { "changePassword": { "button": "Alterar senha", "cancel": "Cancelar", "confirmPassword": "Confirmar nova senha", "currentPassword": "Senha atual", "description": "Atualize sua senha de acesso", "dialogDescription": "Insira sua senha atual e escolha uma nova senha", "dialogTitle": "Alterar senha", "label": "Alterar senha", "newPassword": "Nova senha", "stub": "Alteração de senha ainda não disponível (SDK pendente)", "submit": "Alterar senha" }, "deleteAccount": { "button": "Excluir conta", "confirmAction": "Excluir", "confirmCancel": "Cancelar", "confirmDescription": "Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.", "confirmTitle": "Excluir conta", "description": "Esta ação é irreversível e apagará todos os seus dados", "label": "Excluir conta", "stub": "Exclusão de conta ainda não disponível (SDK pendente)" }, "lastPasswordChange": "Última alteração de senha em {{date}}", "loadError": "Erro ao carregar as configurações de segurança", "sectionDescription": "Gerencie sua senha e acesso à conta", "sectionTitle": "Segurança", "twoFactor": { "disabled": "Autenticação de dois fatores desativada", "enabled": "Autenticação de dois fatores ativada" } } };
const auth$1 = { "resetPassword": { "backToSignIn": "Voltar para entrar", "breadcrumb": "Recuperar senha", "confirmNewPassword": "Confirme a nova senha", "email": "E-mail", "newPassword": "Nova senha", "rememberPassword": "Lembrou a senha?", "requestSubmit": "Enviar e-mail", "requestSubtitle": "Enviaremos um e-mail com instruções", "requestSuccess": "E-mail enviado", "requestSuccessDescription": "Verifique sua caixa de entrada", "requestTitle": "Recuperar senha", "resetSubmit": "Salvar nova senha", "resetSubtitle": "Escolha uma senha nova e segura", "resetSuccess": "Senha alterada", "resetSuccessDescription": "Você já pode entrar com a nova senha", "resetTitle": "Definir nova senha" }, "signIn": { "breadcrumb": "Entrar", "email": "E-mail", "forgot": "Esqueceu a senha?", "loginSuccess": "Login realizado com sucesso", "noAccount": "Não tem uma conta?", "password": "Senha", "signUpLink": "Criar conta", "submit": "Entrar", "subtitle": "Entre com suas credenciais para continuar", "title": "Bem-vindo de volta" }, "signUp": { "breadcrumb": "Cadastro", "confirmPassword": "Confirmar senha", "email": "E-mail", "hasAccount": "Já tem uma conta?", "name": "Nome", "password": "Senha", "registerSuccess": "Cadastro realizado com sucesso", "signInLink": "Entrar", "submit": "Criar conta", "subtitle": "Preencha os dados para começar", "terms": "Ao continuar você aceita os", "title": "Crie sua conta" } };
const calendar$1 = { "presets": { "lastMonth": "Último mês", "lastWeek": "Última semana", "thisMonth": "Esse mês", "thisWeek": "Essa semana", "thisYear": "Este ano", "today": "Hoje", "yesterday": "Ontem" } };
const common$1 = { "back": "Voltar", "errorTitle": "Ocorreu um erro", "help": "Ajuda", "logout": "Sair", "privacy": "Privacidade", "retry": "Tentar novamente", "terms": "Termos" };
const dataTable$1 = { "emptyDescription": "Tente ajustar os filtros de busca.", "emptyTitle": "Nenhum resultado", "itemsPerPage": "itens por página" };
const enums$1 = { "CurrencyCode": { "AED": "Dirham (AED)", "ALL": "Lek albanês (ALL)", "ARS": "Peso Argentino (ARS)", "AUD": "Dólar Australiano (AUD)", "BDT": "Taka (BDT)", "BGN": "Lev búlgaro (BGN)", "BHD": "Dinar barenita (BHD)", "BIF": "Franco burundês (BIF)", "BOB": "Boliviano (BOB)", "BRL": "Real (BRL)", "BWP": "Pula (BWP)", "CAD": "Dólar Canadense (CAD)", "CHF": "Franco Suíço (CHF)", "CLP": "Peso Chileno (CLP)", "CNY": "Yuan (CNY)", "COP": "Peso Colombiano (COP)", "CVE": "Escudo cabo-verdiano (CVE)", "CZK": "Coroa tcheca (CZK)", "DKK": "Coroa dinamarquesa (DKK)", "DOP": "Peso dominicano (DOP)", "EGP": "Libra egípcia (EGP)", "ETB": "Birr etíope (ETB)", "EUR": "Euro (EUR)", "FJD": "Dólar de Fiji (FJD)", "GBP": "Libra (GBP)", "GHS": "Cedi ganês (GHS)", "GIP": "Libra gibraltarina (GIP)", "GMD": "Dalasi gambiano (GMD)", "GNF": "Franco guineense (GNF)", "GTQ": "Quetzal guatemalteco (GTQ)", "HKD": "Dólar de Hong Kong (HKD)", "HUF": "Forint húngaro (HUF)", "IDR": "Rupia indonésia (IDR)", "INR": "Rupia indiana (INR)", "ISK": "Coroa islandesa (ISK)", "JOD": "Dinar jordaniano (JOD)", "JPY": "Iene (JPY)", "KES": "Xelim queniano (KES)", "KRW": "Won sul-coreano (KRW)", "KWD": "Dinar kuwaitiano (KWD)", "LAK": "Kip laosiano (LAK)", "LKR": "Rupia do Sri Lanka (LKR)", "MAD": "Dirham marroquino (MAD)", "MGA": "Ariary malgaxe (MGA)", "MWK": "Kwacha malauiano (MWK)", "MXN": "Peso Mexicano (MXN)", "MYR": "Ringgit malaio (MYR)", "MZN": "Metical moçambicano (MZN)", "NGN": "Naira nigeriana (NGN)", "NOK": "Coroa norueguesa (NOK)", "NPR": "Rupia nepalesa (NPR)", "NZD": "Dólar neozelandês (NZD)", "OMR": "Rial omanense (OMR)", "PEN": "Sol Peruano (PEN)", "PHP": "Peso filipino (PHP)", "PKR": "Rupia paquistanesa (PKR)", "PLN": "Zloti polonês (PLN)", "PYG": "Guarani paraguaio (PYG)", "QAR": "Riyal catariano (QAR)", "RON": "Leu romeno (RON)", "RUB": "Rublo russo (RUB)", "RWF": "Franco ruandês (RWF)", "SAR": "Riyal saudita (SAR)", "SEK": "Coroa sueca (SEK)", "SGD": "Dólar de Cingapura (SGD)", "SLE": "Leone da Serra Leoa (SLE)", "SRD": "Dólar do Suriname (SRD)", "THB": "Baht tailandês (THB)", "TND": "Dinar tunisiano (TND)", "TRY": "Lira turca (TRY)", "TWD": "Dólar taiwanês (TWD)", "TZS": "Xelim tanzaniano (TZS)", "UGX": "Xelim ugandense (UGX)", "USD": "Dólar (USD)", "VND": "Dong vietnamita (VND)", "XAF": "Franco CFA Central (XAF)", "XCD": "Dólar do Caribe Oriental (XCD)", "XOF": "Franco CFA Ocidental (XOF)", "ZAR": "Rand sul-africano (ZAR)", "ZMW": "Kwacha zambiano (ZMW)" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Resumo diário", "FEATURE_ANNOUNCEMENT": "Anúncio de novidade", "INTEGRATION_DISCONNECTED": "Integração desconectada", "INVITATION": "Convite", "ORDER_RECEIVED": "Pedido recebido", "OTHER": "Outro", "SYNC_ERROR": "Erro de sincronização" } };
const errors$1 = { "CANNOT_CONVERT_INPUT": "Não foi possível processar a requisição. Revise os dados enviados.", "CHECKOUT_SESSION_REF_REQUIRED": "A referência da sessão de checkout é obrigatória.", "COMMAND_HANDLER_NOT_FOUND": "Erro interno ao processar a operação. Tente novamente em instantes.", "COMMAND_QUEUE_NOT_FOUND": "Erro interno ao enfileirar a operação. Tente novamente em instantes.", "CREDENTIAL_DECRYPT_FAILED": "Não foi possível ler as credenciais armazenadas. Contate o suporte.", "DELIVERY_NOT_OWNED_BY_USER": "Esta notificação não pertence à sua conta.", "DISPUTE_REF_REQUIRED": "A referência da disputa é obrigatória.", "DOWNGRADE_SELECTION_INVALID": "A seleção para o downgrade é inválida. Revise os itens mantidos.", "EMAIL_ALREADY_REGISTERED": "Este email já está cadastrado.", "EMPTY_RECIPIENTS": "Nenhum destinatário para esta notificação.", "ENTITY_NOT_FOUND_WHILE_SAVING": "O registro não existe mais e não pôde ser salvo.", "FCM_TOKEN_NOT_FOUND": "Registro de notificação push não encontrado para este dispositivo.", "FORBIDDEN": "Você não tem permissão para executar esta ação.", "FREE_PLAN_NOT_SUBSCRIBABLE": "O plano gratuito não pode ser assinado diretamente.", "HANDLER_NOT_BOUND": "Erro interno ao despachar a operação. Tente novamente em instantes.", "INVALIDATED_AUTH_TOKEN": "Sua sessão foi invalidada. Entre novamente.", "INVALID_AUTH_TOKEN": "Token de autenticação inválido. Entre novamente.", "INVALID_CHARGE_TRANSITION": "Esta cobrança não pode mudar para o status solicitado.", "INVALID_CHECKOUT_SESSION_TRANSITION": "Esta sessão de checkout não pode mudar para o status solicitado.", "INVALID_CONTROLLER_EXAMPLES": "Erro interno na documentação da API. Contate o suporte.", "INVALID_DISPUTE_TRANSITION": "Esta disputa não pode mudar para o status solicitado.", "INVALID_EMAIL": "E-mail inválido.", "INVALID_EMAIL_FORMAT": "Formato de email inválido.", "INVALID_EMAIL_OR_PASSWORD": "E-mail ou senha inválidos", "INVALID_ENTITY": "Os dados enviados são inválidos.", "INVALID_ID": "Identificador inválido.", "INVALID_ID_VALUES_LENGTH": "Valores de identificador inválidos.", "INVALID_LANGUAGE": 'Idioma inválido. Use uma tag BCP-47 como "pt-BR".', "INVALID_MANDATE": "O mandato de pagamento é inválido ou expirou.", "INVALID_NAME": "Nome inválido.", "INVALID_OUTBOX_PAYLOAD": "Erro interno no processamento de eventos. Tente novamente em instantes.", "INVALID_PAYMENT_METHOD_TRANSITION": "Este método de pagamento não pode mudar para o status solicitado.", "INVALID_PHONE": "Número de telefone inválido.", "INVALID_PICTURE_URL": "URL de imagem inválida.", "INVALID_RANGE": "Intervalo inválido.", "INVALID_REQUEST": "Requisição inválida.", "INVALID_TIMEZONE": 'Fuso horário inválido. Use um nome IANA como "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "Esta fatura já foi paga.", "INVOICE_LINES_MISMATCH": "As linhas da fatura não conferem com o total esperado.", "MISSING_ENVIRONMENT_VARIABLE": "Erro de configuração do servidor. Contate o suporte.", "MISSING_LOG_CONTENT": "Erro interno de logging.", "NETWORK_ERROR": "Erro de rede", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notificação não encontrada.", "NOT_FOUND": "Recurso não encontrado.", "NOT_IMPLEMENTED": "Este recurso ainda não está disponível.", "NO_CHANNEL_ENABLED": "Nenhum canal de notificação habilitado para esta entrega.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding já concluído", "ONBOARDING_NOT_COMPLETED": "Onboarding não concluído", "OPTIMISTIC_LOCK_CONFLICT": "O registro foi alterado por outra operação. Recarregue e tente novamente.", "OWNER_ALREADY_DISABLED": "Esta conta já está desativada.", "OWNER_NOT_DISABLED": "Esta conta não está desativada.", "OWNER_NOT_FOUND": "Conta não encontrada.", "PASSWORDS_DONT_MATCH": "As senhas não coincidem.", "PASSWORD_TOO_LONG": "Senha muito longa.", "PASSWORD_TOO_SHORT": "Senha muito curta (mínimo 8 caracteres).", "PASSWORD_TOO_WEAK": "Senha muito fraca. Use letras, números e símbolos.", "PAYMENT_METHOD_IS_DEFAULT": "O método de pagamento padrão não pode ser removido. Defina outro como padrão antes.", "PAYMENT_METHOD_LAST_ACTIVE": "O último método de pagamento ativo não pode ser removido com uma assinatura ativa.", "PAYMENT_METHOD_NOT_FOUND": "Método de pagamento não encontrado.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "O identificador da conta é obrigatório para este método de pagamento.", "PAYMENT_METHOD_REQUIRED": "Adicione um método de pagamento para continuar.", "PAYMENT_METHOD_UNSUPPORTED": "Este método de pagamento não é suportado.", "PLAN_NOT_FOUND": "Plano não encontrado.", "PROVIDER_CAPABILITY_UNSUPPORTED": "O provedor de pagamento não suporta esta operação.", "PROVIDER_ERROR": "O provedor de pagamento retornou um erro. Tente novamente em instantes.", "QUOTA_LIMIT_EXCEEDED": "Limite do plano atingido. Faça upgrade para continuar.", "RATE_LIMITED": "Muitas tentativas. Aguarde um momento e tente novamente.", "RESOURCE_LOCKED_BY_PLAN": "Este recurso está bloqueado pelo seu plano atual.", "SESSION_EXPIRED": "Sessão expirada", "SUBSCRIPTION_ALREADY_EXISTS": "Já existe uma assinatura ativa.", "SUBSCRIPTION_ALREADY_FINALIZED": "Esta assinatura já foi finalizada.", "SUBSCRIPTION_NOT_FOUND": "Assinatura não encontrada.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "Esta assinatura não está agendada para cancelamento.", "SUBSCRIPTION_PENDING_CANCELLATION": "Esta assinatura está com cancelamento pendente.", "TERMS_REQUIRED": "Aceite os termos para continuar.", "UNAUTHORIZED": "Não autorizado", "UNKNOWN_ERROR": "Erro desconhecido", "USER_ALREADY_EXISTS": "Usuário já existe", "USER_NOT_FOUND": "Usuário não encontrado.", "USER_PROFILE_NOT_FOUND": "Perfil de usuário não encontrado.", "VALIDATION_ERROR": "Alguns campos são inválidos.", "WEAK_PASSWORD": "Senha muito fraca. Use letras, números e símbolos.", "WEBHOOK_SIGNATURE_INVALID": "Assinatura de webhook inválida.", "WEBHOOK_SOURCE_UNKNOWN": "Origem de webhook desconhecida." };
const nav$1 = { "account": "Minha Conta", "comingSoon": "Em breve", "home": "Início", "settings": "Configurações" };
const notifications$1 = { "allCaughtUp": "Você está em dia.", "aria": "Notificações", "title": "Notificações", "unreadCount_one": "{{count}} não lida", "unreadCount_other": "{{count}} não lidas" };
const zod$1 = { "invalidEmail": "E-mail inválido", "invalid_date": "Data inválida.", "invalid_enum_value": "Valor inválido. Opções: {{options}}", "invalid_format_datetime": "Data/hora inválida", "invalid_format_email": "E-mail inválido", "invalid_format_regex": "Formato inválido", "invalid_format_url": "URL inválida", "invalid_format_uuid": "UUID inválido", "invalid_type": "Tipo inválido (esperado {{expected}}, recebido {{received}})", "required": "Campo obrigatório", "too_big_array": "Deve ter no máximo {{maximum}} item(s)", "too_big_number": "Deve ser no máximo {{maximum}}", "too_big_string": "Deve ter no máximo {{maximum}} caractere(s)", "too_small_array": "Precisa ter pelo menos {{minimum}} item(s)", "too_small_number": "Precisa ser pelo menos {{minimum}}", "too_small_string": "Precisa ter pelo menos {{minimum}} caractere(s)" };
const ptTranslations = {
  account: account$1,
  auth: auth$1,
  calendar: calendar$1,
  common: common$1,
  dataTable: dataTable$1,
  enums: enums$1,
  errors: errors$1,
  nav: nav$1,
  notifications: notifications$1,
  zod: zod$1
};
const account = { "header": { "title": "My Account" }, "preferences": { "currency": "Currency (read-only)", "language": "Language", "languagePlaceholder": "Select a language", "loadError": "Failed to load preferences", "save": "Save preferences", "saveSuccess": "Preferences updated successfully", "sectionDescription": "Configure language, timezone and notifications", "sectionTitle": "Preferences", "timezone": "Timezone" }, "profile": { "avatar": { "remove": "Remove photo", "upload": "Upload photo", "uploadAriaLabel": "Choose profile image", "uploadStub": "Avatar upload not yet available" }, "company": "Company", "email": "Email", "loadError": "Failed to load profile data", "name": "Name", "save": "Save changes", "saveSuccess": "Profile updated successfully", "sectionDescription": "Update your personal information", "sectionTitle": "Profile" }, "security": { "changePassword": { "button": "Change password", "cancel": "Cancel", "confirmPassword": "Confirm new password", "currentPassword": "Current password", "description": "Update your login password", "dialogDescription": "Enter your current password and choose a new one", "dialogTitle": "Change password", "label": "Change password", "newPassword": "New password", "stub": "Password change not yet available (SDK pending)", "submit": "Change password" }, "deleteAccount": { "button": "Delete account", "confirmAction": "Delete", "confirmCancel": "Cancel", "confirmDescription": "Are you sure you want to delete your account? This action cannot be undone.", "confirmTitle": "Delete account", "description": "This action is irreversible and will delete all your data", "label": "Delete account", "stub": "Account deletion not yet available (SDK pending)" }, "lastPasswordChange": "Last password change on {{date}}", "loadError": "Failed to load security settings", "sectionDescription": "Manage your password and account access", "sectionTitle": "Security", "twoFactor": { "disabled": "Two-factor authentication disabled", "enabled": "Two-factor authentication enabled" } } };
const auth = { "resetPassword": { "backToSignIn": "Back to sign in", "breadcrumb": "Reset password", "confirmNewPassword": "Confirm password", "email": "Email", "newPassword": "New password", "rememberPassword": "Remembered your password?", "requestSubmit": "Send email", "requestSubtitle": "We'll send you an email with instructions", "requestSuccess": "Email sent", "requestSuccessDescription": "Check your inbox", "requestTitle": "Reset password", "resetSubmit": "Save new password", "resetSubtitle": "Choose a new, secure password", "resetSuccess": "Password updated", "resetSuccessDescription": "You can now sign in with the new password", "resetTitle": "Set a new password" }, "signIn": { "breadcrumb": "Sign in", "email": "Email", "forgot": "Forgot your password?", "loginSuccess": "Signed in", "noAccount": "Don't have an account?", "password": "Password", "signUpLink": "Sign up", "submit": "Sign in", "subtitle": "Sign in to continue", "title": "Welcome back" }, "signUp": { "breadcrumb": "Sign up", "confirmPassword": "Confirm password", "email": "Email", "hasAccount": "Already have an account?", "name": "Name", "password": "Password", "registerSuccess": "Account created", "signInLink": "Sign in", "submit": "Create account", "subtitle": "Fill in a few details to get started", "terms": "By continuing you accept the", "title": "Create your account" } };
const calendar = { "presets": { "lastMonth": "Last month", "lastWeek": "Last week", "thisMonth": "This month", "thisWeek": "This week", "thisYear": "This year", "today": "Today", "yesterday": "Yesterday" } };
const common = { "back": "Back", "errorTitle": "Something went wrong", "help": "Help", "logout": "Log out", "privacy": "Privacy", "retry": "Retry", "terms": "Terms" };
const dataTable = { "emptyDescription": "Try adjusting your search filters.", "emptyTitle": "No results", "itemsPerPage": "items per page" };
const enums = { "CurrencyCode": { "AED": "UAE Dirham (AED)", "ALL": "Albanian Lek (ALL)", "ARS": "Argentine Peso (ARS)", "AUD": "Australian Dollar (AUD)", "BDT": "Bangladeshi Taka (BDT)", "BGN": "Bulgarian Lev (BGN)", "BHD": "Bahraini Dinar (BHD)", "BIF": "Burundian Franc (BIF)", "BOB": "Bolivian Boliviano (BOB)", "BRL": "Brazilian Real (BRL)", "BWP": "Botswanan Pula (BWP)", "CAD": "Canadian Dollar (CAD)", "CHF": "Swiss Franc (CHF)", "CLP": "Chilean Peso (CLP)", "CNY": "Chinese Yuan (CNY)", "COP": "Colombian Peso (COP)", "CVE": "Cape Verdean Escudo (CVE)", "CZK": "Czech Koruna (CZK)", "DKK": "Danish Krone (DKK)", "DOP": "Dominican Peso (DOP)", "EGP": "Egyptian Pound (EGP)", "ETB": "Ethiopian Birr (ETB)", "EUR": "Euro (EUR)", "FJD": "Fijian Dollar (FJD)", "GBP": "British Pound (GBP)", "GHS": "Ghanaian Cedi (GHS)", "GIP": "Gibraltar Pound (GIP)", "GMD": "Gambian Dalasi (GMD)", "GNF": "Guinean Franc (GNF)", "GTQ": "Guatemalan Quetzal (GTQ)", "HKD": "Hong Kong Dollar (HKD)", "HUF": "Hungarian Forint (HUF)", "IDR": "Indonesian Rupiah (IDR)", "INR": "Indian Rupee (INR)", "ISK": "Icelandic Krona (ISK)", "JOD": "Jordanian Dinar (JOD)", "JPY": "Japanese Yen (JPY)", "KES": "Kenyan Shilling (KES)", "KRW": "South Korean Won (KRW)", "KWD": "Kuwaiti Dinar (KWD)", "LAK": "Laotian Kip (LAK)", "LKR": "Sri Lankan Rupee (LKR)", "MAD": "Moroccan Dirham (MAD)", "MGA": "Malagasy Ariary (MGA)", "MWK": "Malawian Kwacha (MWK)", "MXN": "Mexican Peso (MXN)", "MYR": "Malaysian Ringgit (MYR)", "MZN": "Mozambican Metical (MZN)", "NGN": "Nigerian Naira (NGN)", "NOK": "Norwegian Krone (NOK)", "NPR": "Nepalese Rupee (NPR)", "NZD": "New Zealand Dollar (NZD)", "OMR": "Omani Rial (OMR)", "PEN": "Peruvian Sol (PEN)", "PHP": "Philippine Peso (PHP)", "PKR": "Pakistani Rupee (PKR)", "PLN": "Polish Zloty (PLN)", "PYG": "Paraguayan Guarani (PYG)", "QAR": "Qatari Riyal (QAR)", "RON": "Romanian Leu (RON)", "RUB": "Russian Ruble (RUB)", "RWF": "Rwandan Franc (RWF)", "SAR": "Saudi Riyal (SAR)", "SEK": "Swedish Krona (SEK)", "SGD": "Singapore Dollar (SGD)", "SLE": "Sierra Leonean Leone (SLE)", "SRD": "Surinamese Dollar (SRD)", "THB": "Thai Baht (THB)", "TND": "Tunisian Dinar (TND)", "TRY": "Turkish Lira (TRY)", "TWD": "New Taiwan Dollar (TWD)", "TZS": "Tanzanian Shilling (TZS)", "UGX": "Ugandan Shilling (UGX)", "USD": "US Dollar (USD)", "VND": "Vietnamese Dong (VND)", "XAF": "Central African CFA Franc (XAF)", "XCD": "East Caribbean Dollar (XCD)", "XOF": "West African CFA Franc (XOF)", "ZAR": "South African Rand (ZAR)", "ZMW": "Zambian Kwacha (ZMW)" }, "Language": { "en-US": "English (US)", "pt-BR": "Português (Brasil)" }, "NotificationCategory": { "DAILY_DIGEST": "Daily digest", "FEATURE_ANNOUNCEMENT": "Feature announcement", "INTEGRATION_DISCONNECTED": "Integration disconnected", "INVITATION": "Invitation", "ORDER_RECEIVED": "Order received", "OTHER": "Other", "SYNC_ERROR": "Sync error" } };
const errors = { "CANNOT_CONVERT_INPUT": "The request could not be processed. Review the submitted data.", "CHECKOUT_SESSION_REF_REQUIRED": "The checkout session reference is required.", "COMMAND_HANDLER_NOT_FOUND": "Internal error while processing the operation. Try again shortly.", "COMMAND_QUEUE_NOT_FOUND": "Internal error while queuing the operation. Try again shortly.", "CREDENTIAL_DECRYPT_FAILED": "Stored credentials could not be read. Contact support.", "DELIVERY_NOT_OWNED_BY_USER": "This notification does not belong to your account.", "DISPUTE_REF_REQUIRED": "The dispute reference is required.", "DOWNGRADE_SELECTION_INVALID": "The selection for the downgrade is invalid. Review the kept items.", "EMAIL_ALREADY_REGISTERED": "This email is already registered.", "EMPTY_RECIPIENTS": "No recipients for this notification.", "ENTITY_NOT_FOUND_WHILE_SAVING": "The record no longer exists and could not be saved.", "FCM_TOKEN_NOT_FOUND": "Push notification registration not found for this device.", "FORBIDDEN": "You do not have permission to perform this action.", "FREE_PLAN_NOT_SUBSCRIBABLE": "The free plan cannot be subscribed to directly.", "HANDLER_NOT_BOUND": "Internal error while dispatching the operation. Try again shortly.", "INVALIDATED_AUTH_TOKEN": "Your session was invalidated. Sign in again.", "INVALID_AUTH_TOKEN": "Invalid authentication token. Sign in again.", "INVALID_CHARGE_TRANSITION": "This charge cannot change to the requested status.", "INVALID_CHECKOUT_SESSION_TRANSITION": "This checkout session cannot change to the requested status.", "INVALID_CONTROLLER_EXAMPLES": "Internal API documentation error. Contact support.", "INVALID_DISPUTE_TRANSITION": "This dispute cannot change to the requested status.", "INVALID_EMAIL": "Invalid email address.", "INVALID_EMAIL_FORMAT": "Invalid email format.", "INVALID_EMAIL_OR_PASSWORD": "Invalid email or password", "INVALID_ENTITY": "The submitted data is invalid.", "INVALID_ID": "Invalid identifier.", "INVALID_ID_VALUES_LENGTH": "Invalid identifier values.", "INVALID_LANGUAGE": 'Invalid language. Use a BCP-47 tag such as "en-US".', "INVALID_MANDATE": "The payment mandate is invalid or expired.", "INVALID_NAME": "Invalid name.", "INVALID_OUTBOX_PAYLOAD": "Internal event processing error. Try again shortly.", "INVALID_PAYMENT_METHOD_TRANSITION": "This payment method cannot change to the requested status.", "INVALID_PHONE": "Invalid phone number.", "INVALID_PICTURE_URL": "Invalid picture URL.", "INVALID_RANGE": "Invalid range.", "INVALID_REQUEST": "Invalid request.", "INVALID_TIMEZONE": 'Invalid timezone. Use an IANA name such as "America/Sao_Paulo".', "INVOICE_ALREADY_PAID": "This invoice has already been paid.", "INVOICE_LINES_MISMATCH": "The invoice lines do not match the expected total.", "MISSING_ENVIRONMENT_VARIABLE": "Server configuration error. Contact support.", "MISSING_LOG_CONTENT": "Internal logging error.", "NETWORK_ERROR": "Network error", "NOTIFICATION_DELIVERY_NOT_FOUND": "Notification not found.", "NOT_FOUND": "Resource not found.", "NOT_IMPLEMENTED": "This feature is not available yet.", "NO_CHANNEL_ENABLED": "No notification channel is enabled for this delivery.", "ONBOARDING_ALREADY_COMPLETED": "Onboarding already completed", "ONBOARDING_NOT_COMPLETED": "Onboarding not completed", "OPTIMISTIC_LOCK_CONFLICT": "The record was changed by another operation. Reload and try again.", "OWNER_ALREADY_DISABLED": "This account is already disabled.", "OWNER_NOT_DISABLED": "This account is not disabled.", "OWNER_NOT_FOUND": "Account not found.", "PASSWORDS_DONT_MATCH": "Passwords do not match.", "PASSWORD_TOO_LONG": "Password is too long.", "PASSWORD_TOO_SHORT": "Password is too short (minimum 8 characters).", "PASSWORD_TOO_WEAK": "Password too weak. Use letters, numbers and symbols.", "PAYMENT_METHOD_IS_DEFAULT": "The default payment method cannot be removed. Set another as default first.", "PAYMENT_METHOD_LAST_ACTIVE": "The last active payment method cannot be removed while a subscription is active.", "PAYMENT_METHOD_NOT_FOUND": "Payment method not found.", "PAYMENT_METHOD_OWNER_ID_REQUIRED": "Account identifier is required for this payment method.", "PAYMENT_METHOD_REQUIRED": "Add a payment method to continue.", "PAYMENT_METHOD_UNSUPPORTED": "This payment method is not supported.", "PLAN_NOT_FOUND": "Plan not found.", "PROVIDER_CAPABILITY_UNSUPPORTED": "The payment provider does not support this operation.", "PROVIDER_ERROR": "The payment provider returned an error. Try again shortly.", "QUOTA_LIMIT_EXCEEDED": "Plan limit reached. Upgrade to continue.", "RATE_LIMITED": "Too many attempts. Please wait a moment and try again.", "RESOURCE_LOCKED_BY_PLAN": "This resource is locked by your current plan.", "SESSION_EXPIRED": "Session expired", "SUBSCRIPTION_ALREADY_EXISTS": "An active subscription already exists.", "SUBSCRIPTION_ALREADY_FINALIZED": "This subscription has already been finalized.", "SUBSCRIPTION_NOT_FOUND": "Subscription not found.", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION": "This subscription is not scheduled for cancellation.", "SUBSCRIPTION_PENDING_CANCELLATION": "This subscription is pending cancellation.", "TERMS_REQUIRED": "Please accept the terms to continue.", "UNAUTHORIZED": "Unauthorized", "UNKNOWN_ERROR": "Unknown error", "USER_ALREADY_EXISTS": "User already exists", "USER_NOT_FOUND": "User not found.", "USER_PROFILE_NOT_FOUND": "User profile not found.", "VALIDATION_ERROR": "Some fields are invalid.", "WEAK_PASSWORD": "Password too weak. Use letters, numbers and symbols.", "WEBHOOK_SIGNATURE_INVALID": "Invalid webhook signature.", "WEBHOOK_SOURCE_UNKNOWN": "Unknown webhook source." };
const nav = { "account": "My Account", "comingSoon": "Coming soon", "home": "Home", "settings": "Settings" };
const notifications = { "allCaughtUp": "You're all caught up.", "aria": "Notifications", "title": "Notifications", "unreadCount_one": "{{count}} unread", "unreadCount_other": "{{count}} unread" };
const zod = { "invalidEmail": "Invalid email", "invalid_date": "Invalid date.", "invalid_enum_value": "Invalid value. Options: {{options}}", "invalid_format_datetime": "Invalid date/time", "invalid_format_email": "Invalid email", "invalid_format_regex": "Invalid format", "invalid_format_url": "Invalid URL", "invalid_format_uuid": "Invalid UUID", "invalid_type": "Invalid type (expected {{expected}}, received {{received}})", "required": "Required", "too_big_array": "Must have at most {{maximum}} item(s)", "too_big_number": "Must be at most {{maximum}}", "too_big_string": "Must be at most {{maximum}} character(s)", "too_small_array": "Must have at least {{minimum}} item(s)", "too_small_number": "Must be at least {{minimum}}", "too_small_string": "Must be at least {{minimum}} character(s)" };
const enTranslations = {
  account,
  auth,
  calendar,
  common,
  dataTable,
  enums,
  errors,
  nav,
  notifications,
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
  CHECKOUT_SESSION_REF_REQUIRED: "CHECKOUT_SESSION_REF_REQUIRED",
  COMMAND_HANDLER_NOT_FOUND: "COMMAND_HANDLER_NOT_FOUND",
  COMMAND_QUEUE_NOT_FOUND: "COMMAND_QUEUE_NOT_FOUND",
  CREDENTIAL_DECRYPT_FAILED: "CREDENTIAL_DECRYPT_FAILED",
  DELIVERY_NOT_OWNED_BY_USER: "DELIVERY_NOT_OWNED_BY_USER",
  DISPUTE_REF_REQUIRED: "DISPUTE_REF_REQUIRED",
  DOWNGRADE_SELECTION_INVALID: "DOWNGRADE_SELECTION_INVALID",
  EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
  EMPTY_RECIPIENTS: "EMPTY_RECIPIENTS",
  ENTITY_NOT_FOUND_WHILE_SAVING: "ENTITY_NOT_FOUND_WHILE_SAVING",
  FCM_TOKEN_NOT_FOUND: "FCM_TOKEN_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  FREE_PLAN_NOT_SUBSCRIBABLE: "FREE_PLAN_NOT_SUBSCRIBABLE",
  HANDLER_NOT_BOUND: "HANDLER_NOT_BOUND",
  INVALIDATED_AUTH_TOKEN: "INVALIDATED_AUTH_TOKEN",
  INVALID_AUTH_TOKEN: "INVALID_AUTH_TOKEN",
  INVALID_CHARGE_TRANSITION: "INVALID_CHARGE_TRANSITION",
  INVALID_CHECKOUT_SESSION_TRANSITION: "INVALID_CHECKOUT_SESSION_TRANSITION",
  INVALID_CONTROLLER_EXAMPLES: "INVALID_CONTROLLER_EXAMPLES",
  INVALID_DISPUTE_TRANSITION: "INVALID_DISPUTE_TRANSITION",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_EMAIL_FORMAT: "INVALID_EMAIL_FORMAT",
  INVALID_ENTITY: "INVALID_ENTITY",
  INVALID_ID: "INVALID_ID",
  INVALID_ID_VALUES_LENGTH: "INVALID_ID_VALUES_LENGTH",
  INVALID_LANGUAGE: "INVALID_LANGUAGE",
  INVALID_MANDATE: "INVALID_MANDATE",
  INVALID_OUTBOX_PAYLOAD: "INVALID_OUTBOX_PAYLOAD",
  INVALID_PAYMENT_METHOD_TRANSITION: "INVALID_PAYMENT_METHOD_TRANSITION",
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_PICTURE_URL: "INVALID_PICTURE_URL",
  INVALID_RANGE: "INVALID_RANGE",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_TIMEZONE: "INVALID_TIMEZONE",
  INVOICE_ALREADY_PAID: "INVOICE_ALREADY_PAID",
  INVOICE_LINES_MISMATCH: "INVOICE_LINES_MISMATCH",
  MISSING_ENVIRONMENT_VARIABLE: "MISSING_ENVIRONMENT_VARIABLE",
  MISSING_LOG_CONTENT: "MISSING_LOG_CONTENT",
  NOTIFICATION_DELIVERY_NOT_FOUND: "NOTIFICATION_DELIVERY_NOT_FOUND",
  NOT_FOUND: "NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  NO_CHANNEL_ENABLED: "NO_CHANNEL_ENABLED",
  OPTIMISTIC_LOCK_CONFLICT: "OPTIMISTIC_LOCK_CONFLICT",
  OWNER_ALREADY_DISABLED: "OWNER_ALREADY_DISABLED",
  OWNER_NOT_DISABLED: "OWNER_NOT_DISABLED",
  OWNER_NOT_FOUND: "OWNER_NOT_FOUND",
  PASSWORDS_DONT_MATCH: "PASSWORDS_DONT_MATCH",
  PASSWORD_TOO_WEAK: "PASSWORD_TOO_WEAK",
  PAYMENT_METHOD_IS_DEFAULT: "PAYMENT_METHOD_IS_DEFAULT",
  PAYMENT_METHOD_LAST_ACTIVE: "PAYMENT_METHOD_LAST_ACTIVE",
  PAYMENT_METHOD_NOT_FOUND: "PAYMENT_METHOD_NOT_FOUND",
  PAYMENT_METHOD_OWNER_ID_REQUIRED: "PAYMENT_METHOD_OWNER_ID_REQUIRED",
  PAYMENT_METHOD_REQUIRED: "PAYMENT_METHOD_REQUIRED",
  PAYMENT_METHOD_UNSUPPORTED: "PAYMENT_METHOD_UNSUPPORTED",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  PROVIDER_CAPABILITY_UNSUPPORTED: "PROVIDER_CAPABILITY_UNSUPPORTED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  QUOTA_LIMIT_EXCEEDED: "QUOTA_LIMIT_EXCEEDED",
  RATE_LIMITED: "RATE_LIMITED",
  RESOURCE_LOCKED_BY_PLAN: "RESOURCE_LOCKED_BY_PLAN",
  SUBSCRIPTION_ALREADY_EXISTS: "SUBSCRIPTION_ALREADY_EXISTS",
  SUBSCRIPTION_ALREADY_FINALIZED: "SUBSCRIPTION_ALREADY_FINALIZED",
  SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND",
  SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION: "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION",
  SUBSCRIPTION_PENDING_CANCELLATION: "SUBSCRIPTION_PENDING_CANCELLATION",
  UNAUTHORIZED: "UNAUTHORIZED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_PROFILE_NOT_FOUND: "USER_PROFILE_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  WEAK_PASSWORD: "WEAK_PASSWORD",
  WEBHOOK_SIGNATURE_INVALID: "WEBHOOK_SIGNATURE_INVALID",
  WEBHOOK_SOURCE_UNKNOWN: "WEBHOOK_SOURCE_UNKNOWN"
};
_enum(["CANNOT_CONVERT_INPUT", "CHECKOUT_SESSION_REF_REQUIRED", "COMMAND_HANDLER_NOT_FOUND", "COMMAND_QUEUE_NOT_FOUND", "CREDENTIAL_DECRYPT_FAILED", "DELIVERY_NOT_OWNED_BY_USER", "DISPUTE_REF_REQUIRED", "DOWNGRADE_SELECTION_INVALID", "EMAIL_ALREADY_REGISTERED", "EMPTY_RECIPIENTS", "ENTITY_NOT_FOUND_WHILE_SAVING", "FCM_TOKEN_NOT_FOUND", "FORBIDDEN", "FREE_PLAN_NOT_SUBSCRIBABLE", "HANDLER_NOT_BOUND", "INVALIDATED_AUTH_TOKEN", "INVALID_AUTH_TOKEN", "INVALID_CHARGE_TRANSITION", "INVALID_CHECKOUT_SESSION_TRANSITION", "INVALID_CONTROLLER_EXAMPLES", "INVALID_DISPUTE_TRANSITION", "INVALID_EMAIL", "INVALID_EMAIL_FORMAT", "INVALID_ENTITY", "INVALID_ID", "INVALID_ID_VALUES_LENGTH", "INVALID_LANGUAGE", "INVALID_MANDATE", "INVALID_OUTBOX_PAYLOAD", "INVALID_PAYMENT_METHOD_TRANSITION", "INVALID_PHONE", "INVALID_PICTURE_URL", "INVALID_RANGE", "INVALID_REQUEST", "INVALID_TIMEZONE", "INVOICE_ALREADY_PAID", "INVOICE_LINES_MISMATCH", "MISSING_ENVIRONMENT_VARIABLE", "MISSING_LOG_CONTENT", "NOTIFICATION_DELIVERY_NOT_FOUND", "NOT_FOUND", "NOT_IMPLEMENTED", "NO_CHANNEL_ENABLED", "OPTIMISTIC_LOCK_CONFLICT", "OWNER_ALREADY_DISABLED", "OWNER_NOT_DISABLED", "OWNER_NOT_FOUND", "PASSWORDS_DONT_MATCH", "PASSWORD_TOO_WEAK", "PAYMENT_METHOD_IS_DEFAULT", "PAYMENT_METHOD_LAST_ACTIVE", "PAYMENT_METHOD_NOT_FOUND", "PAYMENT_METHOD_OWNER_ID_REQUIRED", "PAYMENT_METHOD_REQUIRED", "PAYMENT_METHOD_UNSUPPORTED", "PLAN_NOT_FOUND", "PROVIDER_CAPABILITY_UNSUPPORTED", "PROVIDER_ERROR", "QUOTA_LIMIT_EXCEEDED", "RATE_LIMITED", "RESOURCE_LOCKED_BY_PLAN", "SUBSCRIPTION_ALREADY_EXISTS", "SUBSCRIPTION_ALREADY_FINALIZED", "SUBSCRIPTION_NOT_FOUND", "SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION", "SUBSCRIPTION_PENDING_CANCELLATION", "UNAUTHORIZED", "USER_NOT_FOUND", "USER_PROFILE_NOT_FOUND", "VALIDATION_ERROR", "WEAK_PASSWORD", "WEBHOOK_SIGNATURE_INVALID", "WEBHOOK_SOURCE_UNKNOWN"]).describe("All possible error codes");
const applyQuotaOverride200Schema = any();
object({
  "ownerId": string(),
  "meter": _enum(["EXAMPLE_KEY"]),
  "delta": int().min(-9007199254740991).max(9007199254740991),
  "idempotencyKey": string().min(1)
});
lazy(() => applyQuotaOverride200Schema);
const authGet200Schema = any();
lazy(() => authGet200Schema);
const authPost200Schema = any();
lazy(() => authPost200Schema);
const cancelScheduledDowngrade200Schema = any();
lazy(() => cancelScheduledDowngrade200Schema);
const subscriptionStatusSchema = _enum(["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "CANCELED", "INCOMPLETE_EXPIRED"]);
const cancelSubscription200Schema = object({
  get "status"() {
    return subscriptionStatusSchema;
  },
  "cancelAtPeriodEnd": boolean(),
  "canceledAt": string()
});
object({
  "immediate": optional(boolean().default(false))
});
lazy(() => cancelSubscription200Schema);
const planNameSchema = _enum(["FREE", "STARTER", "PRO"]);
const changePlan200Schema = object({
  get "planName"() {
    return planNameSchema;
  },
  get "status"() {
    return subscriptionStatusSchema;
  },
  "effectiveAtPeriodEnd": boolean()
});
object({
  get "planName"() {
    return planNameSchema;
  }
});
lazy(() => changePlan200Schema);
const checkoutIntentSchema = _enum(["SETUP", "PAYMENT"]);
const createCheckoutSetupSession200Schema = object({
  "url": string(),
  "sessionRef": string(),
  "expiresAt": optional(datetime())
});
lazy(() => createCheckoutSetupSession200Schema);
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
const createSubscription200Schema = object({
  "subscriptionId": string(),
  "engineInvoiceId": optional(string()),
  "checkoutUrl": optional(string())
});
object({
  get "planName"() {
    return planNameSchema;
  },
  "consentAccepted": boolean()
});
lazy(() => createSubscription200Schema);
const currencyCodeSchema = _enum(["AED", "ALL", "ARS", "AUD", "BDT", "BGN", "BHD", "BIF", "BOB", "BRL", "BWP", "CAD", "CHF", "CLP", "CNY", "COP", "CVE", "CZK", "DKK", "DOP", "EGP", "ETB", "EUR", "FJD", "GBP", "GHS", "GIP", "GMD", "GNF", "GTQ", "HKD", "HUF", "IDR", "INR", "ISK", "JOD", "JPY", "KES", "KRW", "KWD", "LAK", "LKR", "MAD", "MGA", "MWK", "MXN", "MYR", "MZN", "NGN", "NOK", "NPR", "NZD", "OMR", "PEN", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RUB", "RWF", "SAR", "SEK", "SGD", "SLE", "SRD", "THB", "TND", "TRY", "TWD", "TZS", "UGX", "USD", "VND", "XAF", "XCD", "XOF", "ZAR", "ZMW"]);
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
const fcmPlatformSchema = _enum(["IOS", "ANDROID", "WEB"]);
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
const getSubscription200Schema = object({
  get "planName"() {
    return planNameSchema;
  },
  get "status"() {
    return subscriptionStatusSchema;
  },
  "currentPeriodEnd": nullable(datetime()),
  "cancelAtPeriodEnd": boolean(),
  get "scheduledPlanName"() {
    return planNameSchema;
  }
});
lazy(() => getSubscription200Schema);
const getUsage200Schema = object({
  "quotas": array(object({
    "key": _enum(["EXAMPLE_KEY"]),
    "used": number(),
    "included": nullable(number())
  }))
});
lazy(() => getUsage200Schema);
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
  "source": string()
});
const handleBillingWebhook200Schema = object({
  "accepted": int().min(0).max(9007199254740991)
});
object({}).catchall(any());
lazy(() => handleBillingWebhook200Schema);
const invoiceStatusSchema = _enum(["PAID", "OVERDUE", "PENDING", "REFUNDED", "PARTIALLY_REFUNDED", "VOID"]);
const paymentMethodTypeSchema = _enum(["CARD", "APPLE_PAY", "GOOGLE_PAY", "PIX", "BOLETO"]);
const listInvoices200Schema = object({
  "invoices": array(object({
    "invoiceId": string(),
    "number": nullable(string()),
    "pdfUrl": nullable(string()),
    "amountCents": int().min(0).max(9007199254740991),
    get "currency"() {
      return currencyCodeSchema;
    },
    get "status"() {
      return invoiceStatusSchema;
    },
    "paidAt": nullable(datetime()),
    "overdue": boolean(),
    "description": nullable(string()),
    get "planName"() {
      return planNameSchema;
    },
    "dueDate": nullable(datetime()),
    get "payableMethods"() {
      return array(paymentMethodTypeSchema);
    }
  }))
});
lazy(() => listInvoices200Schema);
const notificationCategorySchema = _enum(["ORDER_RECEIVED", "SYNC_ERROR", "FEATURE_ANNOUNCEMENT", "DAILY_DIGEST", "INTEGRATION_DISCONNECTED", "INVITATION", "OTHER"]);
const notificationOriginSchema = _enum(["SYSTEM", "ADMIN", "SCHEDULER"]);
object({
  "page": number$1().int().min(1).max(9007199254740991).default(1),
  "limit": number$1().int().min(1).max(100).default(10),
  "search": optional(string()),
  "unreadOnly": optional(boolean())
});
const listNotifications200Schema = object({
  "items": array(object({
    "id": uuid(),
    "title": string(),
    "message": string(),
    get "category"() {
      return notificationCategorySchema;
    },
    get "origin"() {
      return notificationOriginSchema;
    },
    "read": boolean(),
    "createdAt": datetime()
  })),
  "total": number(),
  "totalPages": number()
});
lazy(() => listNotifications200Schema);
const paymentMethodStatusSchema = _enum(["ACTIVE", "EXPIRED", "REMOVED"]);
const listPaymentMethods200Schema = object({
  "paymentMethods": array(object({
    "id": string(),
    "brand": string(),
    "last4": string(),
    "expMonth": int().min(-9007199254740991).max(9007199254740991),
    "expYear": int().min(-9007199254740991).max(9007199254740991),
    "isDefault": boolean(),
    get "status"() {
      return paymentMethodStatusSchema;
    }
  }))
});
lazy(() => listPaymentMethods200Schema);
const moneySchema = object({
  "amountCents": int().min(0).max(9007199254740991),
  get "currency"() {
    return currencyCodeSchema;
  }
});
const listPlans200Schema = object({
  "plans": array(object({
    get "name"() {
      return planNameSchema;
    },
    get "basePrice"() {
      return moneySchema;
    },
    "quotas": object({}).catchall(object({
      "limit": nullable(int().min(0).max(9007199254740991)),
      "metered": boolean()
    }))
  }))
});
lazy(() => listPlans200Schema);
const listenEvents200Schema = object({
  "name": string(),
  "ownerId": string(),
  "payload": object({
    "ownerId": uuid()
  }).catchall(any())
});
lazy(() => listenEvents200Schema);
const markNotificationRead200Schema = any();
object({
  "notificationDeliveryIds": array(uuid()).min(1)
});
lazy(() => markNotificationRead200Schema);
object({
  "engineInvoiceId": string()
});
const payInvoice200Schema = union([object({
  "method": _enum(["CARD"]),
  "ok": boolean(),
  "gatewayTxId": optional(string()),
  "checkoutUrl": optional(string())
}), object({
  "method": _enum(["PIX"]),
  "pixId": string(),
  "qr": string(),
  "copyPaste": string(),
  "expiresAt": datetime()
})]);
union([object({
  "method": _enum(["CARD"]),
  "paymentMethodId": optional(string().min(1)),
  "newCard": optional(boolean())
}), object({
  "method": _enum(["PIX"])
})]);
lazy(() => payInvoice200Schema);
object({
  get "targetPlan"() {
    return planNameSchema;
  }
});
const previewPlanChange200Schema = object({
  "amountDueNowCents": int().min(-9007199254740991).max(9007199254740991),
  "nextCycleCents": int().min(-9007199254740991).max(9007199254740991)
});
lazy(() => previewPlanChange200Schema);
const refundBasisSchema = _enum(["CDC_WINDOW", "PRO_RATA", "NONE"]);
object({
  "engineInvoiceId": string()
});
const refundInvoice200Schema = object({
  "ok": boolean()
});
object({
  "amountCents": optional(int().max(9007199254740991))
});
lazy(() => refundInvoice200Schema);
const registerFcmToken200Schema = any();
object({
  "token": string().min(1),
  get "platform"() {
    return fcmPlatformSchema;
  }
});
lazy(() => registerFcmToken200Schema);
object({
  "paymentMethodId": string()
});
const removePaymentMethod200Schema = object({
  "ok": boolean()
});
lazy(() => removePaymentMethod200Schema);
const requestDowngrade200Schema = object({
  "effectiveAtPeriodEnd": boolean()
});
object({
  get "planName"() {
    return planNameSchema;
  },
  "keep": optional(object({}).catchall(array(string())).default({}))
});
lazy(() => requestDowngrade200Schema);
const requestPasswordReset200Schema = any();
object({
  "email": email(),
  "redirectTo": optional(url())
});
lazy(() => requestPasswordReset200Schema);
object({
  "id": string()
});
const requestRefund200Schema = object({
  "requestedAmountCents": int().min(0).max(9007199254740991),
  get "basis"() {
    return refundBasisSchema;
  }
});
lazy(() => requestRefund200Schema);
const resetPasswordBodySchema = object({
  "token": string().min(1),
  "newPassword": string().min(8).max(64),
  "confirmNewPassword": string().min(8).max(64)
});
const resetPassword200Schema = any();
lazy(() => resetPasswordBodySchema);
lazy(() => resetPassword200Schema);
const resumeSubscription200Schema = any();
lazy(() => resumeSubscription200Schema);
object({
  "sessionRef": string().min(1),
  "ownerId": string().min(1),
  get "intent"() {
    return checkoutIntentSchema;
  },
  "successUrl": string().min(1),
  "engineInvoiceId": optional(string().min(1)),
  "amountCents": optional(number$1().int().min(0).max(9007199254740991))
});
const sandboxCheckout200Schema = object({
  "redirected": boolean()
});
lazy(() => sandboxCheckout200Schema);
const sendNotification200Schema = object({
  "notificationId": uuid(),
  "deliveriesCreated": int().min(0).max(9007199254740991),
  "deliveriesSkippedDuplicate": int().min(0).max(9007199254740991)
});
object({
  "ownerId": optional(uuid()),
  "targetUserIds": optional(array(string())),
  "title": string().min(1).max(200),
  "content": string().min(1),
  get "category"() {
    return notificationCategorySchema;
  },
  "important": optional(boolean().default(false)),
  "pushEnabled": optional(boolean().default(true)),
  "emailEnabled": optional(boolean().default(false)),
  "contentType": optional(string().default("text/plain")),
  "payload": optional(object({}).catchall(any())),
  "scheduledAt": optional(union([datetime(), date()]))
});
lazy(() => sendNotification200Schema);
object({
  "ownerId": string()
});
const setActiveOwner200Schema = object({
  "ownerId": string()
});
lazy(() => setActiveOwner200Schema);
object({
  "paymentMethodId": string()
});
const setDefaultPaymentMethod200Schema = object({
  "ok": boolean()
});
lazy(() => setDefaultPaymentMethod200Schema);
const signIn200Schema = any();
object({
  "email": email(),
  "password": string().min(8).max(64)
});
lazy(() => signIn200Schema);
const signUpBodySchema = object({
  "name": string().min(2),
  "email": email(),
  "password": string().min(8).max(64),
  "confirmPassword": string().min(8).max(64)
});
const signUp200Schema = any();
lazy(() => signUpBodySchema);
lazy(() => signUp200Schema);
const unregisterFcmToken200Schema = any();
object({
  "token": string().min(1)
});
lazy(() => unregisterFcmToken200Schema);
const updateBillingProfileBodySchema = object({
  "name": optional(string().min(1)),
  "email": optional(email()),
  "document": optional(string().min(1)),
  get "language"() {
    return languageSchema.optional();
  }
});
const updateBillingProfile200Schema = object({
  "name": string(),
  "email": string(),
  "document": string(),
  get "language"() {
    return languageSchema;
  }
});
lazy(() => updateBillingProfileBodySchema);
lazy(() => updateBillingProfile200Schema);
const updateOwnerSettings200Schema = any();
object({
  "name": optional(string().min(1).max(120)),
  "pictureUrl": url().nullish(),
  "timezone": optional(string().min(1))
});
lazy(() => updateOwnerSettings200Schema);
const updateProfile200Schema = any();
const updateProfileMutationRequestSchema = object({
  "name": optional(string().min(1)),
  "pictureUrl": url().nullish(),
  "timezone": optional(string()),
  get "language"() {
    return languageSchema.optional();
  }
});
lazy(() => updateProfile200Schema);
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
function getInitials(name) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.split(" ").filter((n) => n.length > 0).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
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
const surface = "gradient-box gradient-bg-[var(--background)_0,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]";
const trigger = "gradient-box gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_11%)_-15%,color-mix(in_oklab,var(--background),var(--foreground)_3%)_125%] gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%] hover:brightness-90";
function Toaster({ theme = "system", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Toaster$1,
    {
      theme,
      className: "toaster group",
      icons: {
        success: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCircleCheck, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 12,
          columnNumber: 14
        }, this),
        info: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconInfoCircle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 13,
          columnNumber: 11
        }, this),
        warning: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertTriangle, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 14,
          columnNumber: 14
        }, this),
        error: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAlertOctagon, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
          lineNumber: 15,
          columnNumber: 12
        }, this),
        loading: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLoader, { className: "size-4 animate-spin" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/sonner.tsx",
      lineNumber: 8,
      columnNumber: 3
    },
    this
  );
}
const primaryBg = "gradient-bg-[var(--primary),var(--primary)]";
const primaryBorder = "gradient-border-[oklch(from_var(--primary-foreground)_l_c_h_/_0.2)_0%,oklch(from_var(--primary-foreground)_l_c_h_/_0.035)_86%]";
const primaryAltBg = "gradient-bg-[var(--foreground)_0%,var(--background)_200%]";
const outlineBg = "gradient-bg-[var(--background)_-20%,color-mix(in_oklab,var(--background),var(--foreground)_6%)_160%]";
const outlineBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]";
const destructiveBg = "gradient-bg-[var(--destructive),var(--destructive)]";
const destructiveBorder = "gradient-border-[oklch(from_var(--destructive-foreground)_l_c_h_/_0.3)_0%,oklch(from_var(--destructive-foreground)_l_c_h_/_0.035)_86%]";
const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 ease-in-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: `gradient-box ${primaryBg} ${primaryBorder} hover:brightness-90 text-primary-foreground font-semibold`,
        primaryAlt: `gradient-box ${primaryAltBg} hover:brightness-90 text-secondary-foreground font-semibold`,
        secondary: `${trigger}`,
        outline: `gradient-box ${outlineBg} ${outlineBorder} hover:brightness-90`,
        ghost: "border border-transparent hover:bg-hover hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive: `gradient-box ${destructiveBg} ${destructiveBorder} hover:brightness-90 text-destructive-foreground font-semibold`,
        warning: "bg-warning/10 hover:bg-warning/20 active:bg-warning/25 focus-visible:ring-warning/20 dark:bg-warning/15 text-warning border border-warning/30 hover:border-warning/50 focus-visible:border-warning/40 disabled:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80"
      },
      size: {
        default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-lg px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-lg px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-lg in-data-[slot=button-group]:rounded-lg",
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
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/button.tsx",
    lineNumber: 63,
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
      lineNumber: 7,
      columnNumber: 3
    },
    this
  );
}
function EmptyHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-header", className: cn("gap-2 flex max-w-sm flex-col items-center", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
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
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
    lineNumber: 35,
    columnNumber: 9
  }, this);
}
function EmptyTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "empty-title", className: cn("text-sm font-medium tracking-tight", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/empty.tsx",
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
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 23,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 22,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: resolvedTitle }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: resolvedDescription }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
        lineNumber: 26,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 21,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyContent, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", size: "sm", onClick: () => router2.history.back(), children: t("common.back") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 29,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/RouteError/index.tsx",
    lineNumber: 20,
    columnNumber: 3
  }, this);
}
const Route$7 = createRootRouteWithContext()({
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 28,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("body", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { id: "root", children }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
        lineNumber: 31,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Scripts, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 30,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
function RootComponent() {
  const { queryClient } = Route$7.useRouteContext();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(QueryClientProvider, { client: queryClient, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 42,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Toaster, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 43,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TanStackRouterDevtools, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 44,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ReactQueryDevtools2, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
      lineNumber: 45,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/__root.tsx",
    lineNumber: 41,
    columnNumber: 3
  }, this);
}
const $$splitComponentImporter$5 = () => import("./route-DsBymUT0.mjs");
const Route$6 = createFileRoute("/(app)")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const Route$5 = createFileRoute("/")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ to: "/sign-in" });
  }
});
const $$splitErrorComponentImporter$2 = () => import("./index-BPjqQDWm.mjs");
const $$splitComponentImporter$4 = () => import("./index-B2oyK21B.mjs");
const searchSchema$1 = object({
  callback: string().optional(),
  email: email().optional()
});
const Route$4 = createFileRoute("/sign-up/")({
  ssr: true,
  staticData: {
    breadcrumb: instance.t("auth.signUp.breadcrumb")
  },
  validateSearch: (search) => searchSchema$1.parse(search ?? {}),
  component: lazyRouteComponent($$splitComponentImporter$4, "component"),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter$2, "errorComponent")
});
const $$splitErrorComponentImporter$1 = () => import("./index-CAELMJ9q.mjs");
const $$splitComponentImporter$3 = () => import("./index-CKp2Qy_T.mjs");
const searchSchema = object({
  callback: string().optional(),
  email: email().optional()
});
const Route$3 = createFileRoute("/sign-in/")({
  ssr: true,
  staticData: {
    breadcrumb: instance.t("auth.signIn.breadcrumb")
  },
  validateSearch: (search) => searchSchema.parse(search ?? {}),
  component: lazyRouteComponent($$splitComponentImporter$3, "component"),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter$1, "errorComponent")
});
const $$splitErrorComponentImporter = () => import("./index-B5tsGaEm.mjs");
const $$splitComponentImporter$2 = () => import("./index-BsDdoxAX.mjs");
const resetPasswordSearchSchema = object({
  token: string().optional()
});
const Route$2 = createFileRoute("/reset-password/")({
  ssr: true,
  staticData: {
    breadcrumb: instance.t("auth.resetPassword.breadcrumb")
  },
  validateSearch: (search) => resetPasswordSearchSchema.parse(search),
  component: lazyRouteComponent($$splitComponentImporter$2, "component"),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent")
});
const $$splitComponentImporter$1 = () => import("./index-CgPzdrGh.mjs");
const Route$1 = createFileRoute("/(app)/dashboard/")({
  validateSearch: () => ({}),
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./index-BjC07XxN.mjs");
const Route = createFileRoute("/(app)/settings/account/")({
  staticData: {
    breadcrumb: "Minha Conta"
  },
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const appRouteRoute = Route$6.update({
  id: "/(app)",
  getParentRoute: () => Route$7
});
const IndexRoute = Route$5.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$7
});
const SignUpIndexRoute = Route$4.update({
  id: "/sign-up/",
  path: "/sign-up/",
  getParentRoute: () => Route$7
});
const SignInIndexRoute = Route$3.update({
  id: "/sign-in/",
  path: "/sign-in/",
  getParentRoute: () => Route$7
});
const ResetPasswordIndexRoute = Route$2.update({
  id: "/reset-password/",
  path: "/reset-password/",
  getParentRoute: () => Route$7
});
const appDashboardIndexRoute = Route$1.update({
  id: "/dashboard/",
  path: "/dashboard/",
  getParentRoute: () => appRouteRoute
});
const appSettingsAccountIndexRoute = Route.update({
  id: "/settings/account/",
  path: "/settings/account/",
  getParentRoute: () => appRouteRoute
});
const appRouteRouteChildren = {
  appDashboardIndexRoute,
  appSettingsAccountIndexRoute
};
const appRouteRouteWithChildren = appRouteRoute._addFileChildren(
  appRouteRouteChildren
);
const rootRouteChildren = {
  IndexRoute,
  appRouteRoute: appRouteRouteWithChildren,
  ResetPasswordIndexRoute,
  SignInIndexRoute,
  SignUpIndexRoute
};
const routeTree = Route$7._addFileChildren(rootRouteChildren)._addFileTypes();
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
  RouteError as R,
  auth$2 as a,
  EmptyDescription as b,
  cn as c,
  Route$4 as d,
  Route$3 as e,
  Route$2 as f,
  getInitials as g,
  handleApiError as h,
  createClient as i,
  trigger as j,
  translateError as k,
  router as r,
  surface as s,
  tryCatch as t,
  updateProfileMutationRequestSchema as u
};
