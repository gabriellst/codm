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
    "mtime": "2026-07-22T19:49:42.052Z",
    "size": 9120,
    "path": "../public/mockServiceWorker.js"
  },
  "/assets/useGetHomeDashboard-BgDJQIoV.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"211-ZvJkJd1SvxfT71o8xNbtQXG/Jdw"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 529,
    "path": "../public/assets/useGetHomeDashboard-BgDJQIoV.js"
  },
  "/assets/index-Woz7_dXN.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"3800-NAMO1By2vrIT8DwdxB5Q23M4NDM"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 14336,
    "path": "../public/assets/index-Woz7_dXN.js"
  },
  "/assets/index-DYN6EzBL.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"6217-KMvaJ3tmb5NOMx3w1iQUKfUxsJY"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 25111,
    "path": "../public/assets/index-DYN6EzBL.js"
  },
  "/assets/mutationOptions-BmquNgF2.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8c1-AuVJzmn17NsHbR9P5tKyE2b8UnI"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 2241,
    "path": "../public/assets/mutationOptions-BmquNgF2.js"
  },
  "/assets/index-B6qz3gmu.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1780-AQyQWPEjWO0Jr9q4okUBzEMLWBM"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 6016,
    "path": "../public/assets/index-B6qz3gmu.js"
  },
  "/assets/useGetSessionIssues-DMf215_s.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"25b-HSZ45yTTqIWE2WaNUL8kqvpMJ6Q"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 603,
    "path": "../public/assets/useGetSessionIssues-DMf215_s.js"
  },
  "/assets/index-DSGzZNGq.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"73be-AwcT9Cq9WVzgIRQbh61jmtFWeNk"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 29630,
    "path": "../public/assets/index-DSGzZNGq.js"
  },
  "/assets/StatusDot-CQUJ1cLy.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2b5-TXZhJcMjDBcSUTZ6FscKKkAf8no"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 693,
    "path": "../public/assets/StatusDot-CQUJ1cLy.js"
  },
  "/assets/useServerEvents-YqVErWXP.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"cb0-1ErZM/6cKiBaMScOuVwk0Q4Kjos"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 3248,
    "path": "../public/assets/useServerEvents-YqVErWXP.js"
  },
  "/assets/useGetIssuesOverview-Dzy8DB2l.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"228-Hu75ncMoknysmtCCih5hefX+FjQ"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 552,
    "path": "../public/assets/useGetIssuesOverview-Dzy8DB2l.js"
  },
  "/assets/IconSparkles-RRAu7e-s.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14b-ftEwC9aVxhJO2cKfpSp9lb9Yh0M"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 331,
    "path": "../public/assets/IconSparkles-RRAu7e-s.js"
  },
  "/assets/useForm-BABn6Zi5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"fc32-smMqR04Qs8E/s/yjsOAyGOIyWeg"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 64562,
    "path": "../public/assets/useForm-BABn6Zi5.js"
  },
  "/assets/IssueRow-D08kAWTX.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"e2c-PlM7yZSRaBSnNZSvF7kInrMo/n8"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 3628,
    "path": "../public/assets/IssueRow-D08kAWTX.js"
  },
  "/assets/index-Cy_9g4jL.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"15d7-3uXRqtpvcqDyFJl+nqfWXVlWbJI"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 5591,
    "path": "../public/assets/index-Cy_9g4jL.js"
  },
  "/assets/useDialogStore-DV8NFyIF.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"9ff-Lw4yTYQTDj1Nq/vBHDZTy1qfyFs"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 2559,
    "path": "../public/assets/useDialogStore-DV8NFyIF.js"
  },
  "/assets/separator-2dtVrlSl.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2fe-603YHiduaIpvRByYUGgGmGu+t5M"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 766,
    "path": "../public/assets/separator-2dtVrlSl.js"
  },
  "/assets/IconArrowRight-CNsc_Xcl.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"e0-x9FW5RgqWIIjwLyQ+DZEnEQ0poQ"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 224,
    "path": "../public/assets/IconArrowRight-CNsc_Xcl.js"
  },
  "/assets/IconPlus-BECq7zzS.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"ad-DobmtsZtpFh++MkrDQzcNuCwpl0"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 173,
    "path": "../public/assets/IconPlus-BECq7zzS.js"
  },
  "/assets/glyphs-iC0-jgBR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"6d6-XlMzFNHR5tR0Q0S73O1PI00Pkl4"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 1750,
    "path": "../public/assets/glyphs-iC0-jgBR.js"
  },
  "/assets/owner-CLm9LNTs.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"25a-r/rEPL38WhSdBIOzXu1W0YFkrw4"',
    "mtime": "2026-07-22T19:49:40.990Z",
    "size": 602,
    "path": "../public/assets/owner-CLm9LNTs.js"
  },
  "/assets/IconChevronLeft-C0f3AlxU.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"9a-9/gpqUJghP9wwtqEF0F0r8eCQAM"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 154,
    "path": "../public/assets/IconChevronLeft-C0f3AlxU.js"
  },
  "/assets/useGetSessionChat-D2P8o0Er.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"257-seMp6RszJVpOxtyiAXmRAz+E27M"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 599,
    "path": "../public/assets/useGetSessionChat-D2P8o0Er.js"
  },
  "/assets/ThreadAvatar-Zc_4lfPH.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"62d-tDXtSwkT5F/qiOVTe9lrMuOykzc"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 1581,
    "path": "../public/assets/ThreadAvatar-Zc_4lfPH.js"
  },
  "/assets/index-_mLdEjN-.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"386fa-nyUFQTL4Q4u+k9/QHxDW1AYXYdg"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 231162,
    "path": "../public/assets/index-_mLdEjN-.js"
  },
  "/assets/IconFolder-DnQN0cEZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2e1-a6r2WGwwsE2M8VwsR997jW5BvdI"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 737,
    "path": "../public/assets/IconFolder-DnQN0cEZ.js"
  },
  "/assets/i18nextBrowserLanguageDetector-DcLSmZF9.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1ae8-7HVyVfGKkNJgPj9m5mVv5jMIXUI"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 6888,
    "path": "../public/assets/i18nextBrowserLanguageDetector-DcLSmZF9.js"
  },
  "/assets/IconChevronRight-CWjPKAOv.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"9b-sn1cxYCCJJwRdUIak+4bWQg6C58"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 155,
    "path": "../public/assets/IconChevronRight-CWjPKAOv.js"
  },
  "/assets/route-C4ojq5Rn.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2caa-Xig1mSK03/bKa96VemR2r8QAAnY"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 11434,
    "path": "../public/assets/route-C4ojq5Rn.js"
  },
  "/assets/index-wc63cEoo.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"113a0-KkkB1UItrTTBgmgJcpjS4BkN6ps"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 70560,
    "path": "../public/assets/index-wc63cEoo.js"
  },
  "/assets/useTimeout-CDZfzR5r.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1d5-kSSYQ6djzzhYvuzGcg5+dpMlRr4"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 469,
    "path": "../public/assets/useTimeout-CDZfzR5r.js"
  },
  "/assets/useBaseUiId-BlUUdxDL.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"32b-8CoQBiVFqbXNhtjyz4HdOi2TjJs"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 811,
    "path": "../public/assets/useBaseUiId-BlUUdxDL.js"
  },
  "/assets/FloatingTanStackRouterDevtools-CnpwH7La-CulmKexM.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"ef53-MCc1sICOuABQe3DJ7AhFWFfz6Bs"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 61267,
    "path": "../public/assets/FloatingTanStackRouterDevtools-CnpwH7La-CulmKexM.js"
  },
  "/assets/Logo-Vnip3O7o.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"27e-PbSCwX0ip1nZfYVblrMUcUWFnME"',
    "mtime": "2026-07-22T19:49:40.991Z",
    "size": 638,
    "path": "../public/assets/Logo-Vnip3O7o.js"
  },
  "/assets/PageHeader-uu2oiNbg.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"841-RwuVPImYfSv9pj9Xqb9JyhhP7TY"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 2113,
    "path": "../public/assets/PageHeader-uu2oiNbg.js"
  },
  "/assets/IconCheck-S6avV7fo.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8a-kc+G2uNOK0p1elybHN388x5VhcQ"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 138,
    "path": "../public/assets/IconCheck-S6avV7fo.js"
  },
  "/assets/SO26Z5QU-Ds72T6jJ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"3770a-jggQ5jYOiBXkl5WvBDCgyw7reqo"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 227082,
    "path": "../public/assets/SO26Z5QU-Ds72T6jJ.js"
  },
  "/assets/index-COqe-3fP.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"110d-OOJZ8J4HUnrPlCEaIiIPYtKD36E"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 4365,
    "path": "../public/assets/index-COqe-3fP.js"
  },
  "/assets/spinner-Cuz9e3YZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1f3-wfJRPf770tncC855TAVovuiFTPc"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 499,
    "path": "../public/assets/spinner-Cuz9e3YZ.js"
  },
  "/assets/skeleton-DublCryv.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"15c-iG8Ye7asKsvhsSkqm4AM+dk6+eI"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 348,
    "path": "../public/assets/skeleton-DublCryv.js"
  },
  "/assets/react-Cxy0m2o-.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"28c-3e9bT/9yUGzJBKfh0WhB9A6CCdg"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 652,
    "path": "../public/assets/react-Cxy0m2o-.js"
  },
  "/assets/badge-D5df9vZy.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"69d-MwWqiE26kYXdqXb7Y7ojRSpRufQ"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 1693,
    "path": "../public/assets/badge-D5df9vZy.js"
  },
  "/assets/visuallyHidden-COI6QeQH.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"cf-oZd2b8JO0FuNKhtpE4+p1nnDTEU"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 207,
    "path": "../public/assets/visuallyHidden-COI6QeQH.js"
  },
  "/assets/useRegisterFieldControl-C3cVjvAV.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"f90-lV4NueHOhLy1Qxo9c93P5jMzgbY"',
    "mtime": "2026-07-22T19:49:40.991Z",
    "size": 3984,
    "path": "../public/assets/useRegisterFieldControl-C3cVjvAV.js"
  },
  "/assets/input-DT75r0j7.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"96c-JTJuzakDzjqMQLzne4NjcERy/zI"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 2412,
    "path": "../public/assets/input-DT75r0j7.js"
  },
  "/assets/textarea-CPlyUlZz.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"33e-5PYrWjz0nXGUdXeu9bzWkERvsus"',
    "mtime": "2026-07-22T19:49:40.996Z",
    "size": 830,
    "path": "../public/assets/textarea-CPlyUlZz.js"
  },
  "/assets/index-BO3g0mcg.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"e1242-DczyBl70VH2ZHIjV+8Jb637ULNA"',
    "mtime": "2026-07-22T19:49:40.991Z",
    "size": 922178,
    "path": "../public/assets/index-BO3g0mcg.js"
  },
  "/assets/label-CmSs1OwT.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"20a-Op3BDanBpFjMUbvuVBlUnhHCkVA"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 522,
    "path": "../public/assets/label-CmSs1OwT.js"
  },
  "/assets/route-DDMIpzdL.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"5c2f-YZghUoBwwd7LwSbIKKrrqFpsP3o"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 23599,
    "path": "../public/assets/route-DDMIpzdL.js"
  },
  "/assets/index-KOdbFOwM.css": {
    "type": "text/css; charset=utf-8",
    "etag": '"1e2f5-GjLuAlBtPnMHVnEKQNReLJ0tlw0"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 123637,
    "path": "../public/assets/index-KOdbFOwM.css"
  },
  "/assets/switch-D3tzoY2T.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14e5-Ac/vGfFwiAf3Zg0o8tels5P2gno"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 5349,
    "path": "../public/assets/switch-D3tzoY2T.js"
  },
  "/assets/index-OvRaBgKO.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"18d2-WEoM+ilnMdN3G/mG/s3epxQnrjg"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 6354,
    "path": "../public/assets/index-OvRaBgKO.js"
  },
  "/assets/enums-ycuiud_b.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"92-p9xIybItmr5DxFi2yMFeSUBoRyQ"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 146,
    "path": "../public/assets/enums-ycuiud_b.js"
  },
  "/assets/index-Da5XmJQJ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2e80-ROsiOcktHvOGg4Q5QaoHJxswtbc"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 11904,
    "path": "../public/assets/index-Da5XmJQJ.js"
  },
  "/assets/index-DuKStyFo.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2b5b-S2ybSD+ZmLqXAHSEW+PldzX3yls"',
    "mtime": "2026-07-22T19:49:40.994Z",
    "size": 11099,
    "path": "../public/assets/index-DuKStyFo.js"
  },
  "/assets/_http-CCIYyNA4.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2554-GTqIJFINaNUiB08PmpW19yF8LD4"',
    "mtime": "2026-07-22T19:49:40.993Z",
    "size": 9556,
    "path": "../public/assets/_http-CCIYyNA4.js"
  },
  "/assets/index-CneV9oSB.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2ad5-3K6kDxxyZNSdt/AuavKX+NycOMM"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 10965,
    "path": "../public/assets/index-CneV9oSB.js"
  },
  "/assets/dialog-B3gjknup.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"e551-zE+dRFYX9noiueRvLMx0jc4IN0E"',
    "mtime": "2026-07-22T19:49:40.991Z",
    "size": 58705,
    "path": "../public/assets/dialog-B3gjknup.js"
  },
  "/assets/card-CkTvx9JY.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"9d9-VVaRcjuNNEjRm5CiSlexs6JHqu8"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 2521,
    "path": "../public/assets/card-CkTvx9JY.js"
  },
  "/assets/index-BbHzeYtu.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"3665-UDNd3OpwqxJuniLn8auz2rdzJZg"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 13925,
    "path": "../public/assets/index-BbHzeYtu.js"
  },
  "/assets/index-h9LCHI8q.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"28a6-8guSngl/ow+ARQTEPaE0yPngc4c"',
    "mtime": "2026-07-22T19:49:40.992Z",
    "size": 10406,
    "path": "../public/assets/index-h9LCHI8q.js"
  },
  "/assets/avatar-CfY2apRW.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"ab5-a1KRl3UZ7CVNEyTyRs32nSV7Peo"',
    "mtime": "2026-07-22T19:49:40.995Z",
    "size": 2741,
    "path": "../public/assets/avatar-CfY2apRW.js"
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
const _tYiCgF = defineHandler((event) => {
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
const _lazy_ACoWuq = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
const findRoute = /* @__PURE__ */ (() => {
  const data = { route: "/**", handler: _lazy_ACoWuq };
  return ((_m, p) => {
    return { data, params: { "_": p.slice(1) } };
  });
})();
const globalMiddleware = [
  toEventHandler(_tYiCgF)
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
