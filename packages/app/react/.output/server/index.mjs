globalThis.__nitro_main__ = import.meta.url;
import { N as NodeResponse, s as serve } from "./_libs/srvx.mjs";
import { H as HTTPError, d as defineHandler, t as toEventHandler, a as defineLazyEventHandler, b as H3Core } from "./_libs/h3.mjs";
import { d as decodePath, w as withLeadingSlash, a as withoutTrailingSlash, j as joinURL } from "./_libs/ufo.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "node:http";
import "node:stream";
import "node:stream/promises";
import "node:https";
import "node:http2";
import "./_libs/rou3.mjs";
function lazyService(loader) {
  let promise, mod;
  return {
    fetch(req) {
      if (mod) {
        return mod.fetch(req);
      }
      if (!promise) {
        promise = loader().then((_mod) => mod = _mod.default || _mod);
      }
      return promise.then((mod2) => mod2.fetch(req));
    }
  };
}
const services = {
  ["ssr"]: lazyService(() => import("./_ssr/index.mjs"))
};
globalThis.__nitro_vite_envs__ = services;
const errorHandler$1 = (error, event) => {
  const res = defaultHandler(error, event);
  return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
  const unhandled = error.unhandled ?? !HTTPError.isError(error);
  const { status = 500, statusText = "" } = unhandled ? {} : error;
  if (status === 404) {
    const url = event.url || new URL(event.req.url);
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      return {
        status: 302,
        headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
      };
    }
  }
  const headers2 = new Headers(unhandled ? {} : error.headers);
  headers2.set("content-type", "application/json; charset=utf-8");
  const jsonBody = unhandled ? {
    status,
    unhandled: true
  } : typeof error.toJSON === "function" ? error.toJSON() : {
    status,
    statusText,
    message: error.message
  };
  return {
    status,
    statusText,
    headers: headers2,
    body: {
      error: true,
      ...jsonBody
    }
  };
}
const errorHandlers = [errorHandler$1];
async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      const response = await handler(error, event, { defaultHandler });
      if (response) {
        return response;
      }
    } catch (error2) {
      console.error(error2);
    }
  }
}
const headers = ((m) => function headersRouteRule(event) {
  for (const [key2, value] of Object.entries(m.options || {})) {
    event.res.headers.set(key2, value);
  }
});
const assets = {
  "/mockServiceWorker.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"23a0-gBiOCnx74oBoe7HAPP7qmIhjqSw"',
    "mtime": "2026-07-21T22:26:09.614Z",
    "size": 9120,
    "path": "../public/mockServiceWorker.js"
  },
  "/assets/route-D7jgf_UA.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2b597-MNrLy4fo+I0ZXUp+WbTznZkBsdk"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 177559,
    "path": "../public/assets/route-D7jgf_UA.js"
  },
  "/assets/nunito-latin-300-normal-C3ZIKvzv.woff": {
    "type": "font/woff",
    "etag": '"4e6c-FH9KabnpuGdbMxWYfuYnHsffLlc"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 20076,
    "path": "../public/assets/nunito-latin-300-normal-C3ZIKvzv.woff"
  },
  "/assets/nunito-latin-700-normal-OcDqTBcA.woff": {
    "type": "font/woff",
    "etag": '"4e14-j9Tb827vGb8TjL/bDsF4OQjUnoY"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 19988,
    "path": "../public/assets/nunito-latin-700-normal-OcDqTBcA.woff"
  },
  "/assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2": {
    "type": "font/woff2",
    "etag": '"1834-csjFFS3CInvCo0Be+/0zw80lUew"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 6196,
    "path": "../public/assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2"
  },
  "/assets/nunito-cyrillic-ext-600-normal-CWPPjBOD.woff2": {
    "type": "font/woff2",
    "etag": '"2bc4-8PniLaQkTmtWaI9bK08BkWXSfJs"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 11204,
    "path": "../public/assets/nunito-cyrillic-ext-600-normal-CWPPjBOD.woff2"
  },
  "/assets/nunito-cyrillic-ext-700-normal-BuR0mlCG.woff2": {
    "type": "font/woff2",
    "etag": '"2aec-wqnM8uowF42zBMFDm7YFjPvFiPc"',
    "mtime": "2026-07-21T22:26:09.021Z",
    "size": 10988,
    "path": "../public/assets/nunito-cyrillic-ext-700-normal-BuR0mlCG.woff2"
  },
  "/assets/nunito-latin-ext-900-normal-CTBZd6bf.woff": {
    "type": "font/woff",
    "etag": '"53a8-bRkU2ezDKKBaiI0qAfn1e+9nQ/4"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 21416,
    "path": "../public/assets/nunito-latin-ext-900-normal-CTBZd6bf.woff"
  },
  "/assets/nunito-cyrillic-800-normal-DymMgApb.woff": {
    "type": "font/woff",
    "etag": '"28e0-ih2u8CVMK7JfTqOWnNSWJLn2ns8"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 10464,
    "path": "../public/assets/nunito-cyrillic-800-normal-DymMgApb.woff"
  },
  "/assets/nunito-cyrillic-700-normal-DfHRUDv-.woff": {
    "type": "font/woff",
    "etag": '"28a0-E0a6Dk19Dnrh7aPh+nqOrL5GqkE"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 10400,
    "path": "../public/assets/nunito-cyrillic-700-normal-DfHRUDv-.woff"
  },
  "/assets/nunito-latin-ext-500-normal-CVNQN0KE.woff": {
    "type": "font/woff",
    "etag": '"52e8-UvMYY+UlU2cfSLqZ0XEDYhfOnGk"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 21224,
    "path": "../public/assets/nunito-latin-ext-500-normal-CVNQN0KE.woff"
  },
  "/assets/nunito-latin-400-normal-r8SDr6Up.woff2": {
    "type": "font/woff2",
    "etag": '"3fbc-GQZOgrNzOEArgK/EBR6967Fkplw"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 16316,
    "path": "../public/assets/nunito-latin-400-normal-r8SDr6Up.woff2"
  },
  "/assets/nunito-vietnamese-400-normal-BHkVbP3T.woff2": {
    "type": "font/woff2",
    "etag": '"17e8-wUwz+bbCfCB1/SRYFEEzIng1/co"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 6120,
    "path": "../public/assets/nunito-vietnamese-400-normal-BHkVbP3T.woff2"
  },
  "/assets/nunito-vietnamese-900-normal-WV2-fBew.woff": {
    "type": "font/woff",
    "etag": '"2094-fN0hAJSLelFwF6m0eyFw8a1sLb4"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 8340,
    "path": "../public/assets/nunito-vietnamese-900-normal-WV2-fBew.woff"
  },
  "/assets/nunito-latin-ext-400-normal-CjMJVfGn.woff": {
    "type": "font/woff",
    "etag": '"5328-A4RwD5JYj6ilgH0vxxayWZBp3HU"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 21288,
    "path": "../public/assets/nunito-latin-ext-400-normal-CjMJVfGn.woff"
  },
  "/assets/nunito-cyrillic-ext-400-normal-xaE7D4Sw.woff": {
    "type": "font/woff",
    "etag": '"371c-6sFgqSu0aG/njEWVt8dwR+2CqXg"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 14108,
    "path": "../public/assets/nunito-cyrillic-ext-400-normal-xaE7D4Sw.woff"
  },
  "/assets/index-z1XOCx5n.css": {
    "type": "text/css; charset=utf-8",
    "etag": '"22014-K9cjneDTFQ87D7rGXRvpiRoEyLc"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 139284,
    "path": "../public/assets/index-z1XOCx5n.css"
  },
  "/assets/nunito-latin-ext-700-normal-BWeMsAzO.woff2": {
    "type": "font/woff2",
    "etag": '"3dcc-p+cDWB1N1wp7kMdyHMGx8ah9Qgo"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 15820,
    "path": "../public/assets/nunito-latin-ext-700-normal-BWeMsAzO.woff2"
  },
  "/assets/nunito-latin-ext-600-normal-BKUpuB78.woff": {
    "type": "font/woff",
    "etag": '"5338-bRmXJAELV1+ltxxFTTFIHXTJMU4"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 21304,
    "path": "../public/assets/nunito-latin-ext-600-normal-BKUpuB78.woff"
  },
  "/assets/nunito-latin-700-normal-Dort48En.woff2": {
    "type": "font/woff2",
    "etag": '"3f64-/Q7Io0WYw04Py00vW5wG0xjplNw"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 16228,
    "path": "../public/assets/nunito-latin-700-normal-Dort48En.woff2"
  },
  "/assets/nunito-cyrillic-500-normal-C7KGZCzc.woff2": {
    "type": "font/woff2",
    "etag": '"20d4-Jquk2zd/BRWZpohlxchTA7YLN0g"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 8404,
    "path": "../public/assets/nunito-cyrillic-500-normal-C7KGZCzc.woff2"
  },
  "/assets/index-BNKtGrI1.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1bbf9-4dLz/sI74lu6WZdNHZ5adFse3D8"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 113657,
    "path": "../public/assets/index-BNKtGrI1.js"
  },
  "/assets/nunito-latin-ext-800-normal-CDcxIxx8.woff": {
    "type": "font/woff",
    "etag": '"53b0-cLFbrq6CXWsU1gNoV6XhvoH24WM"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 21424,
    "path": "../public/assets/nunito-latin-ext-800-normal-CDcxIxx8.woff"
  },
  "/assets/nunito-vietnamese-300-normal-mLneKULB.woff2": {
    "type": "font/woff2",
    "etag": '"1774-T8nZaO8ZKbeg8hVdOzQDvZDxH0A"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 6004,
    "path": "../public/assets/nunito-vietnamese-300-normal-mLneKULB.woff2"
  },
  "/assets/nunito-cyrillic-400-normal-D1j0u8EH.woff": {
    "type": "font/woff",
    "etag": '"28dc-zUsAFobeTdy/LimzPPGdkKt7Q8o"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 10460,
    "path": "../public/assets/nunito-cyrillic-400-normal-D1j0u8EH.woff"
  },
  "/assets/nunito-cyrillic-ext-300-normal-ChMQLIrm.woff2": {
    "type": "font/woff2",
    "etag": '"2aac-Wb/GOkI4oSeGY5+JGVMtBrTVkNo"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 10924,
    "path": "../public/assets/nunito-cyrillic-ext-300-normal-ChMQLIrm.woff2"
  },
  "/assets/nunito-latin-600-normal-Br8yIETf.woff2": {
    "type": "font/woff2",
    "etag": '"40ac-zmYdAJnI//cNDfRG5mj/s0wP9hg"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 16556,
    "path": "../public/assets/nunito-latin-600-normal-Br8yIETf.woff2"
  },
  "/assets/nunito-latin-ext-300-normal-D1SyVuPt.woff2": {
    "type": "font/woff2",
    "etag": '"3d40-PgQrQBrnm+V+ezvm9KOEuljMAME"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 15680,
    "path": "../public/assets/nunito-latin-ext-300-normal-D1SyVuPt.woff2"
  },
  "/assets/nunito-cyrillic-300-normal-BPQV259B.woff2": {
    "type": "font/woff2",
    "etag": '"212c-hYkGtHyPY5LLIRciv+y8TLN68tA"',
    "mtime": "2026-07-21T22:26:09.021Z",
    "size": 8492,
    "path": "../public/assets/nunito-cyrillic-300-normal-BPQV259B.woff2"
  },
  "/assets/nunito-vietnamese-300-normal-DATld5Vw.woff": {
    "type": "font/woff",
    "etag": '"1fb8-UpoxmFhfKk14H8JQDLtM6Jycd1o"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 8120,
    "path": "../public/assets/nunito-vietnamese-300-normal-DATld5Vw.woff"
  },
  "/assets/nunito-cyrillic-900-normal-Dr1fjxoU.woff": {
    "type": "font/woff",
    "etag": '"28ec-qSX6rM5nK1FVA4cHud98dmQ8Nog"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 10476,
    "path": "../public/assets/nunito-cyrillic-900-normal-Dr1fjxoU.woff"
  },
  "/assets/nunito-cyrillic-ext-300-normal-BDHtqmCR.woff": {
    "type": "font/woff",
    "etag": '"3670-SNDGN8+isFhOQTDPBlXItyK1iSY"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 13936,
    "path": "../public/assets/nunito-cyrillic-ext-300-normal-BDHtqmCR.woff"
  },
  "/assets/nunito-vietnamese-600-normal-DO1RqFw5.woff": {
    "type": "font/woff",
    "etag": '"2050-txtJH2U6YV6i64gYBdBEwagWox8"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 8272,
    "path": "../public/assets/nunito-vietnamese-600-normal-DO1RqFw5.woff"
  },
  "/assets/nunito-cyrillic-ext-700-normal-DfoqN4Gs.woff": {
    "type": "font/woff",
    "etag": '"3630-+gsWHGUMLwP81zpzj/CU3q/wglg"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 13872,
    "path": "../public/assets/nunito-cyrillic-ext-700-normal-DfoqN4Gs.woff"
  },
  "/assets/index-BryMD6hx.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"495-hpiCFXAfUFw33xZtUAC57/LdBaE"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 1173,
    "path": "../public/assets/index-BryMD6hx.js"
  },
  "/assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2": {
    "type": "font/woff2",
    "etag": '"1850-VG8acoDkzu7TzOdf173HIYB1kH0"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 6224,
    "path": "../public/assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2"
  },
  "/assets/index-D9aBhbqu.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"dedfe-M6TnKM70emlcAQXFJoo5jHhMKV0"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 912894,
    "path": "../public/assets/index-D9aBhbqu.js"
  },
  "/assets/nunito-latin-500-normal-EugFkASW.woff2": {
    "type": "font/woff2",
    "etag": '"402c-eWjxTQvk1Kg/L9wfrhXunGRsOII"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 16428,
    "path": "../public/assets/nunito-latin-500-normal-EugFkASW.woff2"
  },
  "/assets/nunito-cyrillic-ext-900-normal-DKFql_-q.woff": {
    "type": "font/woff",
    "etag": '"36a0-TUuGb3/SAt+OCRNAuYT1KLviqcs"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 13984,
    "path": "../public/assets/nunito-cyrillic-ext-900-normal-DKFql_-q.woff"
  },
  "/assets/nunito-cyrillic-ext-500-normal-ryWF3qTI.woff": {
    "type": "font/woff",
    "etag": '"371c-SVZ+YyprVMheKeCFoJWOS/QHDws"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 14108,
    "path": "../public/assets/nunito-cyrillic-ext-500-normal-ryWF3qTI.woff"
  },
  "/assets/nunito-cyrillic-ext-900-normal-BLeVovcl.woff2": {
    "type": "font/woff2",
    "etag": '"2bf4-VCKZrkxh0TWt+OQw4xDfv8wYjho"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 11252,
    "path": "../public/assets/nunito-cyrillic-ext-900-normal-BLeVovcl.woff2"
  },
  "/assets/i18nextBrowserLanguageDetector-DcLSmZF9.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1ae8-7HVyVfGKkNJgPj9m5mVv5jMIXUI"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 6888,
    "path": "../public/assets/i18nextBrowserLanguageDetector-DcLSmZF9.js"
  },
  "/assets/nunito-latin-400-normal-DKg4f3fz.woff": {
    "type": "font/woff",
    "etag": '"4f6c-gX/LmfY7kDs/hUxJm46j3P5WAog"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 20332,
    "path": "../public/assets/nunito-latin-400-normal-DKg4f3fz.woff"
  },
  "/assets/nunito-latin-600-normal-Cd0eNu1l.woff": {
    "type": "font/woff",
    "etag": '"500c-iVNS//p+6DEv8vsqyaJpd25UqqM"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 20492,
    "path": "../public/assets/nunito-latin-600-normal-Cd0eNu1l.woff"
  },
  "/assets/nunito-vietnamese-400-normal-DtOtW02z.woff": {
    "type": "font/woff",
    "etag": '"2038-uHk/25ZC5e8MLU5m5UW3i6tjPBk"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 8248,
    "path": "../public/assets/nunito-vietnamese-400-normal-DtOtW02z.woff"
  },
  "/assets/index-B8GzNK_A.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4f-C/AMdJOwyOedELAhAaK5FGw+FHY"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 79,
    "path": "../public/assets/index-B8GzNK_A.js"
  },
  "/assets/nunito-vietnamese-700-normal-Ch8EUCfz.woff2": {
    "type": "font/woff2",
    "etag": '"1748-ErSgZlfNEo09kmfKM2ckbLRW3s8"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 5960,
    "path": "../public/assets/nunito-vietnamese-700-normal-Ch8EUCfz.woff2"
  },
  "/assets/nunito-cyrillic-600-normal-DJGQ2h05.woff2": {
    "type": "font/woff2",
    "etag": '"2158-gUAU+L3xMtvz95BdmDJlBvJgJXA"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 8536,
    "path": "../public/assets/nunito-cyrillic-600-normal-DJGQ2h05.woff2"
  },
  "/assets/nunito-latin-ext-500-normal-DpF2BH_v.woff2": {
    "type": "font/woff2",
    "etag": '"3e68-H0309f/ems02i4RpPJSJkpPEQ58"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 15976,
    "path": "../public/assets/nunito-latin-ext-500-normal-DpF2BH_v.woff2"
  },
  "/assets/B5PP2USH-mzV47pB_.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"37181-jSyxKu8hv3HMhIzd1NUrwZVxZRs"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 225665,
    "path": "../public/assets/B5PP2USH-mzV47pB_.js"
  },
  "/assets/nunito-cyrillic-900-normal-CWPcV0_V.woff2": {
    "type": "font/woff2",
    "etag": '"2194-HIOyL3pmCjWk4U9qq2HVd5qV1XQ"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 8596,
    "path": "../public/assets/nunito-cyrillic-900-normal-CWPcV0_V.woff2"
  },
  "/assets/nunito-vietnamese-700-normal-C9SQsXvj.woff": {
    "type": "font/woff",
    "etag": '"1f88-PvirWKSE9fHptvqN7gmfzNPFW18"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 8072,
    "path": "../public/assets/nunito-vietnamese-700-normal-C9SQsXvj.woff"
  },
  "/assets/nunito-vietnamese-900-normal-D6LWQAy_.woff2": {
    "type": "font/woff2",
    "etag": '"18b8-JJ4/N+H03dp+tX6m8UDNft22zCY"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 6328,
    "path": "../public/assets/nunito-vietnamese-900-normal-D6LWQAy_.woff2"
  },
  "/assets/nunito-latin-800-normal-Dz8SOQK_.woff2": {
    "type": "font/woff2",
    "etag": '"4088-vOZOhYAv7IPGOsa28zP7NgnpxGk"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 16520,
    "path": "../public/assets/nunito-latin-800-normal-Dz8SOQK_.woff2"
  },
  "/assets/nunito-latin-ext-900-normal-Dllsvgjo.woff2": {
    "type": "font/woff2",
    "etag": '"3f8c-I7ZS9Die+Ll//9YgbqcxGJUNLhk"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 16268,
    "path": "../public/assets/nunito-latin-ext-900-normal-Dllsvgjo.woff2"
  },
  "/assets/nunito-latin-500-normal-B5klmw3Q.woff": {
    "type": "font/woff",
    "etag": '"4f94-Bq3OXQzd9f2jAKgJz0R7Sj0qqvU"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 20372,
    "path": "../public/assets/nunito-latin-500-normal-B5klmw3Q.woff"
  },
  "/assets/index-tOt2U2ZT.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4f-C/AMdJOwyOedELAhAaK5FGw+FHY"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 79,
    "path": "../public/assets/index-tOt2U2ZT.js"
  },
  "/assets/nunito-vietnamese-500-normal-9ShSsgIA.woff": {
    "type": "font/woff",
    "etag": '"204c-1jsW4AOW4rGo22xnLkC+RcmMhMM"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 8268,
    "path": "../public/assets/nunito-vietnamese-500-normal-9ShSsgIA.woff"
  },
  "/assets/nunito-cyrillic-800-normal-D3igD7Kl.woff2": {
    "type": "font/woff2",
    "etag": '"2130-j7obiPmECwPIazPdxvBG6RSHELA"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 8496,
    "path": "../public/assets/nunito-cyrillic-800-normal-D3igD7Kl.woff2"
  },
  "/assets/useDialogStore-D8lL1JMZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4c614-ATKLtMJ7IHX+Nr1ySHMqqazZ75w"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 312852,
    "path": "../public/assets/useDialogStore-D8lL1JMZ.js"
  },
  "/assets/nunito-latin-800-normal-D-J0wlBY.woff": {
    "type": "font/woff",
    "etag": '"4f88-Lu9BX3FvC4h5faVZ1gxHHs4TFfU"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 20360,
    "path": "../public/assets/nunito-latin-800-normal-D-J0wlBY.woff"
  },
  "/assets/nunito-latin-300-normal-COoPE5VN.woff2": {
    "type": "font/woff2",
    "etag": '"3ed4-OALE0Zz/ZwZhn6BApdcuamnswSU"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 16084,
    "path": "../public/assets/nunito-latin-300-normal-COoPE5VN.woff2"
  },
  "/assets/nunito-cyrillic-300-normal-g5qSsvc0.woff": {
    "type": "font/woff",
    "etag": '"28dc-zwJDwr4hO6q+t1pMCjiHnow71O8"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 10460,
    "path": "../public/assets/nunito-cyrillic-300-normal-g5qSsvc0.woff"
  },
  "/assets/nunito-cyrillic-600-normal-BUjmtIuu.woff": {
    "type": "font/woff",
    "etag": '"2930-4JaPf7PGwqHcfQTUjeYMETfv/0s"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 10544,
    "path": "../public/assets/nunito-cyrillic-600-normal-BUjmtIuu.woff"
  },
  "/assets/nunito-cyrillic-ext-800-normal-pjRatrRO.woff": {
    "type": "font/woff",
    "etag": '"36ec-DOGeDB7W8K89lLicozwfRODzM60"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 14060,
    "path": "../public/assets/nunito-cyrillic-ext-800-normal-pjRatrRO.woff"
  },
  "/assets/nunito-latin-900-normal-CVn49sIn.woff": {
    "type": "font/woff",
    "etag": '"4ff4-kZPuqDY35xJYGmxMnyvbGROdKp8"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 20468,
    "path": "../public/assets/nunito-latin-900-normal-CVn49sIn.woff"
  },
  "/assets/newsreader-latin-ext-wght-normal-C-3rgBeH.woff2": {
    "type": "font/woff2",
    "etag": '"8d94-0w74hUQcDUJf0Ms9zXyqHw9gn0A"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 36244,
    "path": "../public/assets/newsreader-latin-ext-wght-normal-C-3rgBeH.woff2"
  },
  "/assets/nunito-cyrillic-ext-600-normal-vnfu4DTE.woff": {
    "type": "font/woff",
    "etag": '"3710-dHKPtrNVCrq80k1gbSzHeBp38RU"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 14096,
    "path": "../public/assets/nunito-cyrillic-ext-600-normal-vnfu4DTE.woff"
  },
  "/assets/newsreader-vietnamese-wght-normal-Czsa-EzN.woff2": {
    "type": "font/woff2",
    "etag": '"2e9c-m5Z1IrxaKhoZBTmZnQZNGvzS3Bc"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 11932,
    "path": "../public/assets/newsreader-vietnamese-wght-normal-Czsa-EzN.woff2"
  },
  "/assets/nunito-latin-ext-800-normal-CtU8tJOV.woff2": {
    "type": "font/woff2",
    "etag": '"3f9c-VFNy1YHkzvJMNTlNqSCrGH5rNTY"',
    "mtime": "2026-07-21T22:26:09.025Z",
    "size": 16284,
    "path": "../public/assets/nunito-latin-ext-800-normal-CtU8tJOV.woff2"
  },
  "/assets/FloatingTanStackRouterDevtools-B7vy70jP-BTDj3-fO.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"df3e-PjM5iOOx9a6qDd7j3yAxNV6wyEo"',
    "mtime": "2026-07-21T22:26:09.024Z",
    "size": 57150,
    "path": "../public/assets/FloatingTanStackRouterDevtools-B7vy70jP-BTDj3-fO.js"
  },
  "/assets/nunito-vietnamese-500-normal-BpqpEYcO.woff2": {
    "type": "font/woff2",
    "etag": '"1804-sbv7ywqHEC/NlMANkZ98Tp4y57U"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 6148,
    "path": "../public/assets/nunito-vietnamese-500-normal-BpqpEYcO.woff2"
  },
  "/assets/nunito-vietnamese-800-normal-Dz0hZPb5.woff": {
    "type": "font/woff",
    "etag": '"206c-WOHdF5Vd6sqTA/vrsARe/INoj9o"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 8300,
    "path": "../public/assets/nunito-vietnamese-800-normal-Dz0hZPb5.woff"
  },
  "/assets/nunito-latin-ext-400-normal-i-8OOpdj.woff2": {
    "type": "font/woff2",
    "etag": '"3e10-ZefKxSweAnWd56rYrukCdbeTcXE"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 15888,
    "path": "../public/assets/nunito-latin-ext-400-normal-i-8OOpdj.woff2"
  },
  "/assets/nunito-latin-ext-300-normal-DfqbmdMl.woff": {
    "type": "font/woff",
    "etag": '"5228-Nd4M9GOVzYot/kC4kK1aCmid5fA"',
    "mtime": "2026-07-21T22:26:09.027Z",
    "size": 21032,
    "path": "../public/assets/nunito-latin-ext-300-normal-DfqbmdMl.woff"
  },
  "/assets/nunito-cyrillic-700-normal-DP36NgGt.woff2": {
    "type": "font/woff2",
    "etag": '"2144-vfwTVMupqFnSFELN+1n/P/gdnUY"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 8516,
    "path": "../public/assets/nunito-cyrillic-700-normal-DP36NgGt.woff2"
  },
  "/assets/index-CLpTOns-.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"403b-TAM/UqKRhGC/pMxhTJ4e//4utHI"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 16443,
    "path": "../public/assets/index-CLpTOns-.js"
  },
  "/assets/newsreader-latin-wght-normal-CCVVNp6i.woff2": {
    "type": "font/woff2",
    "etag": '"e2e4-5ZnOtHjEamyr7UtyhM9SW9PM2lY"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 58084,
    "path": "../public/assets/newsreader-latin-wght-normal-CCVVNp6i.woff2"
  },
  "/assets/nunito-latin-ext-600-normal-Dd9Zuxh1.woff2": {
    "type": "font/woff2",
    "etag": '"3ed8-nxvVoLNAYCTCcRcOLiOP0aCJvhg"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 16088,
    "path": "../public/assets/nunito-latin-ext-600-normal-Dd9Zuxh1.woff2"
  },
  "/assets/index-BYLIDJgN.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"839-xmY5Ggk0/JUTshiOYDp7d5irxag"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 2105,
    "path": "../public/assets/index-BYLIDJgN.js"
  },
  "/assets/nunito-latin-ext-700-normal-D4woHhbd.woff": {
    "type": "font/woff",
    "etag": '"5210-IfgKbblbrghHknxWEEW1btept1A"',
    "mtime": "2026-07-21T22:26:09.032Z",
    "size": 21008,
    "path": "../public/assets/nunito-latin-ext-700-normal-D4woHhbd.woff"
  },
  "/assets/index-C2e0vvfB.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"573d-G+xhqq4cgKVwkFOUDZUbuW22Tho"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 22333,
    "path": "../public/assets/index-C2e0vvfB.js"
  },
  "/assets/nunito-cyrillic-ext-800-normal-B-cvGohL.woff2": {
    "type": "font/woff2",
    "etag": '"2bfc-0F0hNSbmTy7Hp8jYH/MWzWi7eqU"',
    "mtime": "2026-07-21T22:26:09.028Z",
    "size": 11260,
    "path": "../public/assets/nunito-cyrillic-ext-800-normal-B-cvGohL.woff2"
  },
  "/assets/index-Dx_EX-Rc.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4f-C/AMdJOwyOedELAhAaK5FGw+FHY"',
    "mtime": "2026-07-21T22:26:09.022Z",
    "size": 79,
    "path": "../public/assets/index-Dx_EX-Rc.js"
  },
  "/assets/nunito-latin-900-normal-BVB1fGs6.woff2": {
    "type": "font/woff2",
    "etag": '"4124-r4yEH+E+c1JWFnm1mD0jtUtjt/4"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 16676,
    "path": "../public/assets/nunito-latin-900-normal-BVB1fGs6.woff2"
  },
  "/assets/nunito-cyrillic-500-normal-CsSUaxYY.woff": {
    "type": "font/woff",
    "etag": '"28e8-LMIdm9cGclosN3xNqGHxGHyyauo"',
    "mtime": "2026-07-21T22:26:09.030Z",
    "size": 10472,
    "path": "../public/assets/nunito-cyrillic-500-normal-CsSUaxYY.woff"
  },
  "/assets/useValueChanged-CZq49dca.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"11a-PYulAxFNpOlESBZG1PuyAII5UpQ"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 282,
    "path": "../public/assets/useValueChanged-CZq49dca.js"
  },
  "/assets/spinner-vMiwY3hj.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"50e-I8I/d3mgqKjBKgt1r9AMVLL9pQM"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 1294,
    "path": "../public/assets/spinner-vMiwY3hj.js"
  },
  "/assets/nunito-cyrillic-400-normal-xAOo5cBP.woff2": {
    "type": "font/woff2",
    "etag": '"2114-Vgn+I5kCYmRjNHojMHfTRX3+4fQ"',
    "mtime": "2026-07-21T22:26:09.029Z",
    "size": 8468,
    "path": "../public/assets/nunito-cyrillic-400-normal-xAOo5cBP.woff2"
  },
  "/assets/nunito-cyrillic-ext-500-normal-BooqzoBf.woff2": {
    "type": "font/woff2",
    "etag": '"2b80-N1793GPsj+EJAYeWv9kfYojGqC0"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 11136,
    "path": "../public/assets/nunito-cyrillic-ext-500-normal-BooqzoBf.woff2"
  },
  "/assets/useOpenChangeComplete-Bvh5_Uia.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"c49-aONbS4RC82zFqjEJgLdmevL/B+A"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 3145,
    "path": "../public/assets/useOpenChangeComplete-Bvh5_Uia.js"
  },
  "/assets/index-Dx2_593g.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"26c8-ZkiV2x1oSeD09IdM26b3/dG+SNA"',
    "mtime": "2026-07-21T22:26:09.023Z",
    "size": 9928,
    "path": "../public/assets/index-Dx2_593g.js"
  },
  "/assets/input-CkgvpxKi.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"c83a-y+sYAyxVxH60bWYJMdj8ifStIRA"',
    "mtime": "2026-07-21T22:26:09.031Z",
    "size": 51258,
    "path": "../public/assets/input-CkgvpxKi.js"
  },
  "/assets/nunito-cyrillic-ext-400-normal-CuPM9foi.woff2": {
    "type": "font/woff2",
    "etag": '"2b9c-Kktw3iysGnRncOIQLvsx8AR/lDA"',
    "mtime": "2026-07-21T22:26:09.033Z",
    "size": 11164,
    "path": "../public/assets/nunito-cyrillic-ext-400-normal-CuPM9foi.woff2"
  }
};
function readAsset(id) {
  const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
  return promises.readFile(resolve(serverDir, assets[id].path));
}
const publicAssetBases = {};
function isPublicAssetURL(id = "") {
  if (assets[id]) {
    return true;
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) {
      return true;
    }
  }
  return false;
}
function getAsset(id) {
  return assets[id];
}
const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = {
  gzip: ".gz",
  br: ".br",
  zstd: ".zst"
};
const _m3ZCYo = defineHandler((event) => {
  if (event.req.method && !METHODS.has(event.req.method)) {
    return;
  }
  let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
  let asset;
  const encodingHeader = event.req.headers.get("accept-encoding") || "";
  const encodings = [...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      event.res.headers.delete("Cache-Control");
      throw new HTTPError({ status: 404 });
    }
    return;
  }
  if (encodings.length > 1) {
    event.res.headers.append("Vary", "Accept-Encoding");
  }
  const ifNotMatch = event.req.headers.get("if-none-match") === asset.etag;
  if (ifNotMatch) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  const ifModifiedSinceH = event.req.headers.get("if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  if (asset.type) {
    event.res.headers.set("Content-Type", asset.type);
  }
  if (asset.etag && !event.res.headers.has("ETag")) {
    event.res.headers.set("ETag", asset.etag);
  }
  if (asset.mtime && !event.res.headers.has("Last-Modified")) {
    event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !event.res.headers.has("Content-Encoding")) {
    event.res.headers.set("Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !event.res.headers.has("Content-Length")) {
    event.res.headers.set("Content-Length", asset.size.toString());
  }
  return readAsset(id);
});
const findRouteRules = /* @__PURE__ */ (() => {
  const $0 = [{ name: "headers", route: "/assets/**", handler: headers, options: { "cache-control": "public, max-age=31536000, immutable" } }];
  return (m, p) => {
    let r = [];
    if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
    let s = p.split("/"), l = s.length;
    if (l > 1) {
      if (s[1] === "assets") {
        r.unshift({ data: $0, params: { "_": s.slice(2).join("/") } });
      }
    }
    return r;
  };
})();
const _lazy_igJcdL = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
const findRoute = /* @__PURE__ */ (() => {
  const data = { route: "/**", handler: _lazy_igJcdL };
  return ((_m, p) => {
    return { data, params: { "_": p.slice(1) } };
  });
})();
const globalMiddleware = [
  toEventHandler(_m3ZCYo)
].filter(Boolean);
const APP_ID = "default";
function useNitroApp() {
  let instance = useNitroApp._instance;
  if (instance) {
    return instance;
  }
  instance = useNitroApp._instance = createNitroApp();
  globalThis.__nitro__ = globalThis.__nitro__ || {};
  globalThis.__nitro__[APP_ID] = instance;
  return instance;
}
function createNitroApp() {
  const hooks = void 0;
  const captureError = (error, errorCtx) => {
    if (errorCtx?.event) {
      const errors = errorCtx.event.req.context?.nitro?.errors;
      if (errors) {
        errors.push({
          error,
          context: errorCtx
        });
      }
    }
  };
  const h3App = createH3App({ onError(error, event) {
    return errorHandler(error, event);
  } });
  let appHandler = (req) => {
    req.context ||= {};
    req.context.nitro = req.context.nitro || { errors: [] };
    return h3App.fetch(req);
  };
  const app = {
    fetch: appHandler,
    h3: h3App,
    hooks,
    captureError
  };
  return app;
}
function createH3App(config) {
  const h3App = new H3Core(config);
  h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
  h3App["~middleware"].push(...globalMiddleware);
  {
    h3App["~getMiddleware"] = (event, route) => {
      const pathname = event.url.pathname;
      const method = event.req.method;
      const middleware = [];
      {
        const routeRules = getRouteRules(method, pathname);
        event.context.routeRules = routeRules?.routeRules;
        if (routeRules?.routeRuleMiddleware.length) {
          middleware.push(...routeRules.routeRuleMiddleware);
        }
      }
      middleware.push(...h3App["~middleware"]);
      if (route?.data?.middleware?.length) {
        middleware.push(...route.data.middleware);
      }
      return middleware;
    };
  }
  return h3App;
}
function getRouteRules(method, pathname) {
  const m = findRouteRules(method, pathname);
  if (!m?.length) {
    return { routeRuleMiddleware: [] };
  }
  const routeRules = {};
  for (const layer of m) {
    for (const rule of layer.data) {
      const currentRule = routeRules[rule.name];
      if (currentRule) {
        if (rule.options === false) {
          delete routeRules[rule.name];
          continue;
        }
        if (typeof currentRule.options === "object" && typeof rule.options === "object") {
          currentRule.options = {
            ...currentRule.options,
            ...rule.options
          };
        } else {
          currentRule.options = rule.options;
        }
        currentRule.route = rule.route;
        currentRule.params = {
          ...currentRule.params,
          ...layer.params
        };
      } else if (rule.options !== false) {
        routeRules[rule.name] = {
          ...rule,
          params: layer.params
        };
      }
    }
  }
  const middleware = [];
  const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
  for (const rule of orderedRules) {
    if (rule.options === false || !rule.handler) {
      continue;
    }
    middleware.push(rule.handler(rule));
  }
  return {
    routeRules,
    routeRuleMiddleware: middleware
  };
}
function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
  process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
  process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
const tracingSrvxPlugins = [];
const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
const port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
const host = process.env.NITRO_HOST || process.env.HOST;
const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const nitroApp = useNitroApp();
serve({
  port,
  hostname: host,
  tls: cert && key ? {
    cert,
    key
  } : void 0,
  fetch: nitroApp.fetch,
  plugins: [...tracingSrvxPlugins]
});
trapUnhandledErrors();
const nodeServer = {};
export {
  nodeServer as default
};
