import nodeHTTP from "node:http";
import { Readable, PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import nodeHTTPS from "node:https";
import nodeHTTP2 from "node:http2";
function lazyInherit(target, source, sourceKey) {
  for (const key of [...Object.getOwnPropertyNames(source), ...Object.getOwnPropertySymbols(source)]) {
    if (key === "constructor") continue;
    const targetDesc = Object.getOwnPropertyDescriptor(target, key);
    const desc = Object.getOwnPropertyDescriptor(source, key);
    let modified = false;
    if (desc.get) {
      modified = true;
      desc.get = targetDesc?.get || function() {
        return this[sourceKey][key];
      };
    }
    if (desc.set) {
      modified = true;
      desc.set = targetDesc?.set || function(value) {
        this[sourceKey][key] = value;
      };
    }
    if (!targetDesc?.value && typeof desc.value === "function") {
      modified = true;
      desc.value = function(...args) {
        return this[sourceKey][key](...args);
      };
    }
    if (modified) Object.defineProperty(target, key, desc);
  }
}
const _needsNormRE = /(?:(?:^|\/)(?:\.|\.\.|%2e|%2e\.|\.%2e|%2e%2e)(?:\/|$))|[\\^#"<>{}`\x80-\uffff]/i;
const _searchNeedsNormRE = /[#"'<>]/;
const FastURL = /* @__PURE__ */ (() => {
  const NativeURL = globalThis.URL;
  const FastURL2 = class URL {
    #url;
    #href;
    #protocol;
    #host;
    #pathname;
    #search;
    #searchParams;
    #pos;
    constructor(url) {
      if (typeof url === "string") {
        const isOriginForm = url[0] === "/";
        if (isOriginForm && !_searchNeedsNormRE.test(url)) this.#href = url;
        else this.#url = new NativeURL(isOriginForm ? `http://localhost${url}` : url);
      } else if (_needsNormRE.test(url.pathname) || url.search && _searchNeedsNormRE.test(url.search)) this.#url = new NativeURL(`${url.protocol || "http:"}//${url.host || "localhost"}${url.pathname}${url.search || ""}`);
      else {
        this.#protocol = url.protocol;
        this.#host = url.host;
        this.#pathname = url.pathname;
        this.#search = url.search;
      }
    }
    static [Symbol.hasInstance](val) {
      return val instanceof NativeURL;
    }
    get _url() {
      if (this.#url) return this.#url;
      this.#url = new NativeURL(this.href);
      this.#href = void 0;
      this.#protocol = void 0;
      this.#host = void 0;
      this.#pathname = void 0;
      this.#search = void 0;
      this.#searchParams = void 0;
      this.#pos = void 0;
      return this.#url;
    }
    get href() {
      if (this.#url) return this.#url.href;
      if (!this.#href) this.#href = `${this.#protocol || "http:"}//${this.#host || "localhost"}${this.#pathname || "/"}${this.#search || ""}`;
      return this.#href;
    }
    #getPos() {
      if (!this.#pos) {
        const url = this.href;
        const protoIndex = url.indexOf("://");
        const pathnameIndex = protoIndex === -1 ? -1 : url.indexOf("/", protoIndex + 4);
        const qIndex = pathnameIndex === -1 ? -1 : url.indexOf("?", pathnameIndex);
        this.#pos = [
          protoIndex,
          pathnameIndex,
          qIndex
        ];
      }
      return this.#pos;
    }
    get pathname() {
      if (this.#url) return this.#url.pathname;
      if (this.#pathname === void 0) {
        const [, pathnameIndex, queryIndex] = this.#getPos();
        if (pathnameIndex === -1) return this._url.pathname;
        this.#pathname = this.href.slice(pathnameIndex, queryIndex === -1 ? void 0 : queryIndex);
      }
      return this.#pathname;
    }
    get search() {
      if (this.#url) return this.#url.search;
      if (this.#search === void 0) {
        const [, pathnameIndex, queryIndex] = this.#getPos();
        if (pathnameIndex === -1) return this._url.search;
        const url = this.href;
        this.#search = queryIndex === -1 || queryIndex === url.length - 1 ? "" : url.slice(queryIndex);
      }
      return this.#search;
    }
    get searchParams() {
      if (this.#url) return this.#url.searchParams;
      if (!this.#searchParams) this.#searchParams = new URLSearchParams(this.search);
      return this.#searchParams;
    }
    get protocol() {
      if (this.#url) return this.#url.protocol;
      if (this.#protocol === void 0) {
        const [protocolIndex] = this.#getPos();
        if (protocolIndex === -1) return this._url.protocol;
        const url = this.href;
        this.#protocol = url.slice(0, protocolIndex + 1);
      }
      return this.#protocol;
    }
    toString() {
      return this.href;
    }
    toJSON() {
      return this.href;
    }
  };
  lazyInherit(FastURL2.prototype, NativeURL.prototype, "_url");
  Object.setPrototypeOf(FastURL2.prototype, NativeURL.prototype);
  Object.setPrototypeOf(FastURL2, NativeURL);
  return FastURL2;
})();
function resolvePortAndHost(opts) {
  const _port = opts.port ?? globalThis.process?.env.PORT ?? 3e3;
  const port = typeof _port === "number" ? _port : Number.parseInt(_port, 10);
  if (port < 0 || port > 65535) throw new RangeError(`Port must be between 0 and 65535 (got "${port}").`);
  return {
    port,
    hostname: opts.hostname ?? globalThis.process?.env.HOST
  };
}
function fmtURL(host, port, secure) {
  if (!host || !port) return;
  if (host.includes(":")) host = `[${host}]`;
  return `http${secure ? "s" : ""}://${host}:${port}/`;
}
function printListening(opts, url) {
  if (!url || (opts.silent ?? globalThis.process?.env?.TEST)) return;
  let additionalInfo = "";
  try {
    const _url = new URL(url);
    if (_url.hostname === "[::]" || _url.hostname === "0.0.0.0") {
      _url.hostname = "localhost";
      url = _url.href;
      additionalInfo = " (all interfaces)";
    }
  } catch {
  }
  let listeningOn = `➜ Listening on:`;
  if (globalThis.process.stdout?.isTTY) {
    listeningOn = `\x1B[32m${listeningOn}\x1B[0m`;
    url = `\x1B[36m${url}\x1B[0m`;
    additionalInfo = `\x1B[2m${additionalInfo}\x1B[0m`;
  }
  console.log(`${listeningOn} ${url}${additionalInfo}`);
}
function resolveTLSOptions(opts) {
  if (!opts.tls || opts.protocol === "http") return;
  const cert = resolveCertOrKey(opts.tls.cert);
  const key = resolveCertOrKey(opts.tls.key);
  if (!cert && !key) {
    if (opts.protocol === "https") throw new TypeError("TLS `cert` and `key` must be provided for `https` protocol.");
    return;
  }
  if (!cert || !key) throw new TypeError("TLS `cert` and `key` must be provided together.");
  return {
    cert,
    key,
    passphrase: opts.tls.passphrase
  };
}
function resolveCertOrKey(value) {
  if (!value) return;
  if (typeof value !== "string") throw new TypeError("TLS certificate and key must be strings in PEM format or file paths.");
  if (value.startsWith("-----BEGIN ")) return value;
  const { readFileSync } = process.getBuiltinModule("node:fs");
  return readFileSync(value, "utf8");
}
function createWaitUntil() {
  const promises = /* @__PURE__ */ new Set();
  return {
    waitUntil: (promise) => {
      if (typeof promise?.then !== "function") return;
      promises.add(Promise.resolve(promise).catch(console.error).finally(() => {
        promises.delete(promise);
      }));
    },
    wait: () => {
      return Promise.all(promises);
    }
  };
}
const noColor = /* @__PURE__ */ (() => {
  const env = globalThis.process?.env ?? {};
  return env.NO_COLOR === "1" || env.TERM === "dumb";
})();
const _c = (c, r = 39) => (t) => noColor ? t : `\x1B[${c}m${t}\x1B[${r}m`;
const bold = /* @__PURE__ */ _c(1, 22);
const red = /* @__PURE__ */ _c(31);
const green = /* @__PURE__ */ _c(32);
const gray = /* @__PURE__ */ _c(90);
function wrapFetch(server) {
  const fetchHandler = server.options.fetch;
  const middleware = server.options.middleware || [];
  return middleware.length === 0 ? fetchHandler : (request) => callMiddleware(request, fetchHandler, middleware, 0);
}
function callMiddleware(request, fetchHandler, middleware, index) {
  if (index === middleware.length) return fetchHandler(request);
  return middleware[index](request, () => callMiddleware(request, fetchHandler, middleware, index + 1));
}
const errorPlugin = (server) => {
  const errorHandler = server.options.error;
  if (!errorHandler) return;
  server.options.middleware.unshift((_req, next) => {
    try {
      const res = next();
      return res instanceof Promise ? res.catch((error) => errorHandler(error)) : res;
    } catch (error) {
      return errorHandler(error);
    }
  });
};
const gracefulShutdownPlugin = (server) => {
  const config = server.options?.gracefulShutdown;
  if (!globalThis.process?.on || config === false || config === void 0 && (process.env.CI || process.env.TEST)) return;
  const gracefulTimeout = config === true || !config?.gracefulTimeout ? Number.parseInt(process.env.SERVER_SHUTDOWN_TIMEOUT || "") || 5 : config.gracefulTimeout;
  let isClosing = false;
  let isClosed = false;
  const w = server.options.silent ? () => {
  } : process.stderr.write.bind(process.stderr);
  const forceClose = async () => {
    if (isClosed) return;
    w(red("\x1B[2K\rForcibly closing connections...\n"));
    isClosed = true;
    await server.close(true);
  };
  const shutdown = async () => {
    if (isClosing || isClosed) return;
    setTimeout(() => {
      globalThis.process.once("SIGINT", forceClose);
    }, 100);
    isClosing = true;
    const closePromise = server.close();
    for (let remaining = gracefulTimeout; remaining > 0; remaining--) {
      w(gray(`\rStopping server gracefully (${remaining}s)... Press ${bold("Ctrl+C")} again to force close.`));
      if (await Promise.race([closePromise.then(() => true), new Promise((r) => setTimeout(() => r(false), 1e3))])) {
        w("\x1B[2K\r" + green("Server closed successfully.\n"));
        isClosed = true;
        return;
      }
    }
    w("\x1B[2K\rGraceful shutdown timed out.\n");
    await forceClose();
  };
  for (const sig of ["SIGINT", "SIGTERM"]) globalThis.process.on(sig, shutdown);
};
function isTrustedProxy(trustProxy, remoteAddress) {
  if (trustProxy === void 0 || trustProxy === false) return false;
  if (trustProxy === true) return true;
  if (trustProxy === "loopback") return isLoopbackAddress(remoteAddress);
  if (remoteAddress === void 0) return false;
  if (trustProxy.includes(remoteAddress)) return true;
  const mapped = ipv4FromMapped(remoteAddress);
  return mapped !== void 0 && trustProxy.includes(mapped);
}
function ipv4FromMapped(address) {
  return address.startsWith("::ffff:") && address.includes(".") ? address.slice(7) : void 0;
}
function isLoopbackAddress(address) {
  return !!address && (address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127."));
}
const HOST_RE = /^(\[(?:[A-Fa-f0-9:.]+)\]|(?:[A-Za-z0-9_-]+\.)*[A-Za-z0-9_-]+|(?:\d{1,3}\.){3}\d{1,3})(:\d{1,5})?$/;
function firstForwardedValue(value) {
  if (!value) return;
  return (Array.isArray(value) ? value[0] : value).split(",")[0].trim() || void 0;
}
function createBodyTooLargeError(maxRequestBodySize) {
  return Object.assign(/* @__PURE__ */ new Error(`Request body exceeds the maximum allowed size of ${maxRequestBodySize} bytes.`), {
    code: "ERR_BODY_TOO_LARGE",
    statusCode: 413,
    status: 413
  });
}
function limitBodyStream(stream, maxRequestBodySize) {
  const reader = stream.getReader();
  let size = 0;
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      size += value.byteLength;
      if (size > maxRequestBodySize) {
        const error = createBodyTooLargeError(maxRequestBodySize);
        reader.cancel(error).catch(() => {
        });
        controller.error(error);
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}
function sendNodeResponseDetached(nodeRes, webRes) {
  try {
    return _sendNodeResponse(nodeRes, webRes, true);
  } catch (error) {
    handleSendError(nodeRes);
  }
}
function handleSendError(nodeRes, _error) {
  if (nodeRes.headersSent) nodeRes.destroy();
  else {
    nodeRes.statusCode = 500;
    nodeRes.end();
  }
}
function _sendNodeResponse(nodeRes, webRes, detached) {
  if (!webRes) {
    nodeRes.statusCode = 500;
    return endNodeResponse(nodeRes, detached);
  }
  if (webRes._toNodeResponse) {
    const res = webRes._toNodeResponse();
    if (res.body) {
      if (res.body instanceof ReadableStream) {
        writeHead(nodeRes, res.status, res.statusText, res.headers);
        return streamBody(res.body, nodeRes);
      } else if (typeof res.body?.pipe === "function") return pipeBody(res.body, nodeRes, res.status, res.statusText, res.headers);
      writeHead(nodeRes, res.status, res.statusText, res.headers);
      nodeRes.write(res.body);
    } else writeHead(nodeRes, res.status, res.statusText, res.headers);
    return endNodeResponse(nodeRes, detached);
  }
  const rawHeaders = [];
  for (const [key, value] of webRes.headers) rawHeaders.push(key, value);
  writeHead(nodeRes, webRes.status, webRes.statusText, rawHeaders);
  return webRes.body ? streamBody(webRes.body, nodeRes) : endNodeResponse(nodeRes, detached);
}
function writeHead(nodeRes, status, statusText, rawHeaders) {
  if (!nodeRes.headersSent) if (nodeRes.req?.httpVersion === "2.0") nodeRes.writeHead(status, rawHeaders);
  else nodeRes.writeHead(status, statusText, rawHeaders);
}
function endNodeResponse(nodeRes, detached) {
  if (detached) {
    nodeRes.end();
    return;
  }
  return new Promise((resolve) => nodeRes.end(resolve));
}
function pipeBody(stream, nodeRes, status, statusText, headers) {
  if (nodeRes.destroyed) {
    stream.destroy?.();
    return;
  }
  if (typeof stream.on !== "function" || typeof stream.destroy !== "function") {
    writeHead(nodeRes, status, statusText, headers);
    stream.pipe(nodeRes);
    return new Promise((resolve) => nodeRes.on("close", resolve));
  }
  if (stream.destroyed) {
    writeHead(nodeRes, 500, "Internal Server Error", []);
    return endNodeResponse(nodeRes);
  }
  return new Promise((resolve) => {
    function onEarlyError() {
      stream.off("readable", onReadable);
      stream.destroy();
      writeHead(nodeRes, 500, "Internal Server Error", []);
      endNodeResponse(nodeRes).then(resolve);
    }
    function onReadable() {
      stream.off("error", onEarlyError);
      if (nodeRes.destroyed) {
        stream.destroy();
        return resolve();
      }
      writeHead(nodeRes, status, statusText, headers);
      pipeline(stream, nodeRes).catch(() => {
      }).then(() => resolve());
    }
    stream.once("error", onEarlyError);
    stream.once("readable", onReadable);
  });
}
function streamBody(stream, nodeRes) {
  if (nodeRes.destroyed) {
    stream.cancel();
    return;
  }
  const reader = stream.getReader();
  function streamCancel(error) {
    reader.cancel(error).catch(() => {
    });
    if (error) nodeRes.destroy(error);
  }
  function streamHandle({ done, value }) {
    try {
      if (done) nodeRes.end();
      else if (nodeRes.write(value)) reader.read().then(streamHandle, streamCancel);
      else nodeRes.once("drain", () => reader.read().then(streamHandle, streamCancel));
    } catch (error) {
      streamCancel(error instanceof Error ? error : void 0);
    }
  }
  nodeRes.on("close", streamCancel);
  nodeRes.on("error", streamCancel);
  reader.read().then(streamHandle, streamCancel);
  return reader.closed.catch(streamCancel).finally(() => {
    nodeRes.off("close", streamCancel);
    nodeRes.off("error", streamCancel);
  });
}
var NodeRequestURL = class extends FastURL {
  constructor({ req, trusted = false }) {
    const path = req.url || "/";
    const forwardedHost = trusted ? firstForwardedValue(req.headers["x-forwarded-host"]) : void 0;
    let host = (forwardedHost && HOST_RE.test(forwardedHost) ? forwardedHost : void 0) || req.headers.host || req.headers[":authority"];
    if (host && !HOST_RE.test(host)) host = "_invalid_";
    else if (!host) if (req.socket) host = `${req.socket.localFamily === "IPv6" ? "[" + req.socket.localAddress + "]" : req.socket.localAddress}:${req.socket?.localPort || "80"}`;
    else host = "localhost";
    const forwardedProto = trusted ? firstForwardedValue(req.headers["x-forwarded-proto"]) : void 0;
    const protocol = req.socket?.encrypted || forwardedProto === "https" || trusted && req.headers[":scheme"] === "https" ? "https:" : "http:";
    if (path[0] === "/") {
      const qIndex = path.indexOf("?");
      super({
        protocol,
        host,
        pathname: qIndex === -1 ? path : path.slice(0, qIndex) || "/",
        search: qIndex === -1 ? "" : path.slice(qIndex) || ""
      });
    } else if (path === "*") super({
      protocol,
      host,
      pathname: "/*",
      search: ""
    });
    else super(path);
  }
};
const _nonJoinedHeaders = /* @__PURE__ */ new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);
const _validHeaderNameRE = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
function _isRepeated(rawHeaders, lowerName) {
  let seen = false;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i];
    if (key.length === lowerName.length && key.toLowerCase() === lowerName) {
      if (seen) return true;
      seen = true;
    }
  }
  return false;
}
const NodeRequestHeaders = /* @__PURE__ */ (() => {
  const NativeHeaders = globalThis.Headers;
  class Headers2 {
    #req;
    #headers;
    constructor(req) {
      this.#req = req;
    }
    static [Symbol.hasInstance](val) {
      return val instanceof NativeHeaders;
    }
    get _headers() {
      if (!this.#headers) {
        const headers = new NativeHeaders();
        const rawHeaders = this.#req.rawHeaders;
        const len = rawHeaders.length;
        for (let i = 0; i < len; i += 2) {
          const key = rawHeaders[i];
          if (key.charCodeAt(0) === 58) continue;
          const value = rawHeaders[i + 1];
          headers.append(key, value);
        }
        this.#headers = headers;
      }
      return this.#headers;
    }
    get(name) {
      if (this.#headers) return this.#headers.get(name);
      const lower = name.toLowerCase();
      if (lower.charCodeAt(0) === 58) return this._headers.get(name);
      const value = this.#req.headers[lower];
      if (typeof value === "string") return _nonJoinedHeaders.has(lower) && _isRepeated(this.#req.rawHeaders, lower) ? this._headers.get(name) : value;
      if (Array.isArray(value)) return value.join(", ");
      return lower !== "__proto__" && _validHeaderNameRE.test(name) ? null : this._headers.get(name);
    }
    has(name) {
      if (this.#headers) return this.#headers.has(name);
      const lower = name.toLowerCase();
      if (lower.charCodeAt(0) === 58) return this._headers.has(name);
      if (Object.hasOwn(this.#req.headers, lower)) return true;
      return lower !== "__proto__" && _validHeaderNameRE.test(name) ? false : this._headers.has(name);
    }
    getSetCookie() {
      if (this.#headers) return this.#headers.getSetCookie();
      const value = this.#req.headers["set-cookie"];
      return Array.isArray(value) ? value.slice() : value ? [value] : [];
    }
    entries() {
      return this._headers.entries();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  }
  lazyInherit(Headers2.prototype, NativeHeaders.prototype, "_headers");
  Object.setPrototypeOf(Headers2, NativeHeaders);
  Object.setPrototypeOf(Headers2.prototype, NativeHeaders.prototype);
  return Headers2;
})();
const kNativeRequest = /* @__PURE__ */ Symbol.for("srvx.nativeRequest");
const NodeRequest = /* @__PURE__ */ (() => {
  const NativeRequest = getNativeRequest();
  class Request {
    runtime;
    waitUntil;
    #req;
    #url;
    #bodyStream;
    #request;
    #headers;
    #abortController;
    #maxRequestBodySize;
    #trustProxy;
    #ip;
    #ipResolved = false;
    #remoteAddress;
    #trusted;
    constructor(ctx) {
      this.#req = ctx.req;
      this.#maxRequestBodySize = ctx.maxRequestBodySize;
      this.#trustProxy = ctx.trustProxy;
      this.runtime = {
        name: "node",
        node: ctx
      };
    }
    static [Symbol.hasInstance](val) {
      return val instanceof NativeRequest;
    }
    #resolveTrusted() {
      if (this.#trusted === void 0) {
        this.#remoteAddress = this.#req.socket?.remoteAddress;
        this.#trusted = isTrustedProxy(this.#trustProxy, this.#remoteAddress);
      }
      return this.#trusted;
    }
    get ip() {
      if (this.#ipResolved) return this.#ip;
      this.#ipResolved = true;
      if (this.#resolveTrusted()) {
        const forwarded = firstForwardedValue(this.#req.headers["x-forwarded-for"]);
        if (forwarded) return this.#ip = forwarded;
      }
      return this.#ip = this.#remoteAddress;
    }
    get method() {
      if (this.#request) return this.#request.method;
      return this.#req.method || "GET";
    }
    get _url() {
      return this.#url ||= new NodeRequestURL({
        req: this.#req,
        trusted: this.#resolveTrusted()
      });
    }
    set _url(url) {
      this.#url = url;
    }
    get url() {
      if (this.#request) return this.#request.url;
      return this._url.href;
    }
    get headers() {
      if (this.#request) return this.#request.headers;
      return this.#headers ||= new NodeRequestHeaders(this.#req);
    }
    get _abortController() {
      if (!this.#abortController) {
        this.#abortController = new AbortController();
        const { req, res } = this.runtime.node;
        const abortController = this.#abortController;
        const abort = (err) => abortController.abort?.(err);
        if (res) res.once("close", () => {
          const reqError = req.errored;
          if (reqError) abort(reqError);
          else if (!res.writableEnded) abort();
        });
        else req.once("close", () => {
          if (!req.complete) abort();
        });
      }
      return this.#abortController;
    }
    get signal() {
      return this.#request ? this.#request.signal : this._abortController.signal;
    }
    get body() {
      if (this.#request) return this.#request.body;
      if (this.#bodyStream === void 0) {
        const method = this.method;
        let stream = !(method === "GET" || method === "HEAD") ? Readable.toWeb(this.#req) : null;
        if (stream && this.#maxRequestBodySize !== void 0) stream = limitBodyStream(stream, this.#maxRequestBodySize);
        this.#bodyStream = stream;
      }
      return this.#bodyStream;
    }
    #readBuffered() {
      return readBody(this.#req, this.#maxRequestBodySize);
    }
    text() {
      if (this.#request) return this.#request.text();
      if (this.#bodyStream !== void 0) return this.#bodyStream ? new Response(this.#bodyStream).text() : Promise.resolve("");
      return this.#readBuffered().then((buf) => buf.toString());
    }
    json() {
      if (this.#request) return this.#request.json();
      if (this.#bodyStream !== void 0) return this.text().then((text) => JSON.parse(text));
      return this.#readBuffered().then((buf) => JSON.parse(buf.toString()));
    }
    get _request() {
      if (!this.#request) {
        const body = this.body;
        this.#request = new NativeRequest(this.url, {
          method: this.method,
          headers: this.headers,
          signal: this._abortController.signal,
          body,
          duplex: body ? "half" : void 0
        });
        this.#headers = void 0;
        this.#bodyStream = void 0;
      }
      return this.#request;
    }
  }
  lazyInherit(Request.prototype, NativeRequest.prototype, "_request");
  Object.setPrototypeOf(Request.prototype, NativeRequest.prototype);
  return Request;
})();
function readBody(req, maxRequestBodySize) {
  if ("rawBody" in req && Buffer.isBuffer(req.rawBody)) {
    if (maxRequestBodySize !== void 0 && req.rawBody.length > maxRequestBodySize) return Promise.reject(createBodyTooLargeError(maxRequestBodySize));
    return Promise.resolve(req.rawBody);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (chunk) => {
      if (maxRequestBodySize !== void 0) {
        size += chunk.length;
        if (size > maxRequestBodySize) {
          cleanup();
          req.pause?.();
          reject(createBodyTooLargeError(maxRequestBodySize));
          return;
        }
      }
      chunks.push(chunk);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      cleanup();
      resolve(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks));
    };
    req.on("data", onData).once("end", onEnd).once("error", onError);
  });
}
function getNativeRequest() {
  let R = globalThis[kNativeRequest] || globalThis.Request;
  while (R?._srvx) R = Object.getPrototypeOf(R);
  return globalThis[kNativeRequest] ??= R;
}
const NodeResponse = /* @__PURE__ */ (() => {
  const NativeResponse = globalThis.Response;
  const STATUS_CODES = globalThis.process?.getBuiltinModule?.("node:http")?.STATUS_CODES || {};
  class NodeResponse2 {
    #body;
    #init;
    #headers;
    #response;
    constructor(body, init) {
      this.#body = body;
      this.#init = init;
    }
    static [Symbol.hasInstance](val) {
      return val instanceof NativeResponse;
    }
    get status() {
      return this.#response?.status || this.#init?.status || 200;
    }
    get statusText() {
      return this.#response?.statusText || this.#init?.statusText || STATUS_CODES[this.status] || "";
    }
    get headers() {
      if (this.#response) return this.#response.headers;
      if (this.#headers) return this.#headers;
      const initHeaders = this.#init?.headers;
      return this.#headers = initHeaders instanceof Headers ? initHeaders : new Headers(initHeaders);
    }
    get ok() {
      if (this.#response) return this.#response.ok;
      const status = this.status;
      return status >= 200 && status < 300;
    }
    get _response() {
      if (this.#response) return this.#response;
      let body = this.#body;
      if (body && typeof body.pipe === "function" && !(body instanceof Readable)) {
        const stream = new PassThrough();
        body.pipe(stream);
        const abort = body.abort;
        if (abort) stream.once("close", () => abort());
        body = stream;
      }
      this.#response = new NativeResponse(body, this.#headers ? {
        ...this.#init,
        headers: this.#headers
      } : this.#init);
      this.#init = void 0;
      this.#headers = void 0;
      this.#body = void 0;
      return this.#response;
    }
    _toNodeResponse() {
      const status = this.status;
      const statusText = this.statusText;
      let body;
      let contentType;
      let contentLength;
      if (this.#response) body = this.#response.body;
      else if (this.#body) if (this.#body instanceof ReadableStream) body = this.#body;
      else if (typeof this.#body === "string") {
        body = this.#body;
        contentType = "text/plain; charset=UTF-8";
        contentLength = Buffer.byteLength(this.#body);
      } else if (this.#body instanceof ArrayBuffer) {
        body = Buffer.from(this.#body);
        contentLength = this.#body.byteLength;
      } else if (this.#body instanceof Uint8Array) {
        body = this.#body;
        contentLength = this.#body.byteLength;
      } else if (this.#body instanceof DataView) {
        body = Buffer.from(this.#body.buffer);
        contentLength = this.#body.byteLength;
      } else if (this.#body instanceof Blob) {
        body = this.#body.stream();
        contentType = this.#body.type;
        contentLength = this.#body.size;
      } else if (typeof this.#body.pipe === "function") body = this.#body;
      else body = this._response.body;
      const headers = [];
      const initHeaders = this.#init?.headers;
      const headerEntries = this.#response?.headers || this.#headers || (initHeaders ? Array.isArray(initHeaders) ? initHeaders : initHeaders?.entries ? initHeaders.entries() : Object.entries(initHeaders) : void 0);
      let hasContentTypeHeader;
      let hasContentLength;
      if (headerEntries) for (const [key, value] of headerEntries) {
        const lowerKey = typeof key === "string" ? key.toLowerCase() : String(key);
        if (Array.isArray(value)) for (const v of value) headers.push(lowerKey, v);
        else headers.push(lowerKey, value);
        if (lowerKey === "content-type") hasContentTypeHeader = true;
        else if (lowerKey === "content-length") hasContentLength = true;
      }
      if (contentType && !hasContentTypeHeader) headers.push("content-type", contentType);
      if (contentLength && !hasContentLength) headers.push("content-length", String(contentLength));
      this.#init = void 0;
      this.#headers = void 0;
      this.#response = void 0;
      this.#body = void 0;
      return {
        status,
        statusText,
        headers,
        body
      };
    }
  }
  lazyInherit(NodeResponse2.prototype, NativeResponse.prototype, "_response");
  Object.setPrototypeOf(NodeResponse2, NativeResponse);
  Object.setPrototypeOf(NodeResponse2.prototype, NativeResponse.prototype);
  return NodeResponse2;
})();
function serve(options) {
  return new NodeServer(options);
}
var NodeServer = class {
  runtime = "node";
  options;
  node;
  serveOptions;
  fetch;
  waitUntil;
  #isSecure;
  #listeningPromise;
  #listenError;
  #wait;
  constructor(options) {
    this.options = {
      ...options,
      middleware: [...options.middleware || []]
    };
    for (const plugin of options.plugins || []) plugin(this);
    errorPlugin(this);
    const fetchHandler = this.fetch = wrapFetch(this);
    const handler = (nodeReq, nodeRes) => {
      const reqUrl = nodeReq.url;
      if (reqUrl && reqUrl[0] !== "/" && reqUrl !== "*" && !URL.canParse(reqUrl)) {
        nodeRes.statusCode = 400;
        nodeRes.end();
        return;
      }
      const request = new NodeRequest({
        req: nodeReq,
        res: nodeRes,
        maxRequestBodySize: this.options.maxRequestBodySize,
        trustProxy: this.options.trustProxy
      });
      request.waitUntil = this.#wait?.waitUntil;
      const res = fetchHandler(request);
      return res instanceof Promise ? res.then((resolvedRes) => sendNodeResponseDetached(nodeRes, resolvedRes)) : sendNodeResponseDetached(nodeRes, res);
    };
    this.node = {
      handler,
      server: void 0
    };
    const loader = globalThis.__srvxLoader__;
    if (loader) {
      loader({ server: this });
      return;
    }
    gracefulShutdownPlugin(this);
    this.#wait = createWaitUntil();
    this.waitUntil = this.#wait.waitUntil;
    const tls = resolveTLSOptions(this.options);
    const { port, hostname: host } = resolvePortAndHost(this.options);
    this.serveOptions = {
      port,
      host,
      exclusive: !this.options.reusePort,
      ...tls,
      ...this.options.node
    };
    let server;
    this.#isSecure = !!this.serveOptions.cert && this.options.protocol !== "http";
    if (this.options.node?.http2 ?? this.#isSecure) if (this.#isSecure) server = nodeHTTP2.createSecureServer({
      allowHTTP1: true,
      ...this.serveOptions
    }, handler);
    else throw new Error("node.http2 option requires tls certificate!");
    else if (this.#isSecure) server = nodeHTTPS.createServer(this.serveOptions, handler);
    else server = nodeHTTP.createServer(this.serveOptions, handler);
    this.node.server = server;
    if (!options.manual) this.serve().catch(() => {
    });
  }
  serve() {
    if (this.#listeningPromise) return this.#listeningPromise.then(() => this);
    const server = this.node?.server;
    if (!server) return Promise.reject(/* @__PURE__ */ new Error("Server not initialized"));
    this.#listenError = void 0;
    this.#listeningPromise = new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        this.#listenError = error;
        this.#listeningPromise = void 0;
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        printListening(this.options, this.url);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.serveOptions);
    });
    return this.#listeningPromise.then(() => this);
  }
  get url() {
    const addr = this.node?.server?.address();
    if (!addr) return;
    return typeof addr === "string" ? addr : fmtURL(addr.address, addr.port, this.#isSecure);
  }
  ready() {
    if (this.#listenError) return Promise.reject(this.#listenError);
    return Promise.resolve(this.#listeningPromise).then(() => this);
  }
  async close(closeAll) {
    await Promise.all([this.#wait?.wait(), new Promise((resolve, reject) => {
      const server = this.node?.server;
      if (server && closeAll && "closeAllConnections" in server) server.closeAllConnections();
      if (!server || !server.listening) return resolve();
      server.close((error) => error ? reject(error) : resolve());
    })]);
  }
};
export {
  FastURL as F,
  NodeResponse as N,
  serve as s
};
