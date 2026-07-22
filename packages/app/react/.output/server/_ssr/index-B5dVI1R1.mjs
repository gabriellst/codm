import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { u as useQueryClient, a as useQuery, b as useMutation, q as queryOptions, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { e as Route$3, E as Empty, b as EmptyTitle, d as EmptyDescription, c as cn, B as Button } from "./router-NNnLbzcz.mjs";
import { u as useGetSessionChat, g as getSessionChatQueryKey } from "./useGetSessionChat-2IZfXUwv.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { a as useServerEvents } from "./useServerEvents-Dhc918lv.mjs";
import { g as getHomeDashboardQueryKey } from "./useGetHomeDashboard-DiPbV2MB.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { B as Badge } from "./badge-CKHT7bhp.mjs";
import { C as Card } from "./card-f5vvoeSM.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { r as resolutionIsPrimary } from "./glyphs-D8fG7IZJ.mjs";
import { T as TranscriptBubble } from "./index-Dt7arRrI.mjs";
import { T as Textarea } from "./textarea-864XhA0n.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { w as IconArrowUp } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/zod.mjs";
import "../_libs/microsoft__fetch-event-source.mjs";
import "./StatusDot-CDKvP_k7.mjs";
function getGetNeedsYouPanelUrl(threadId) {
  const res = { method: "GET", url: `/v1/threads/${threadId}/needs-you` };
  return res;
}
async function getNeedsYouPanel(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetNeedsYouPanelUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
function getResolveStopUrl(stopId) {
  const res = { method: "POST", url: `/v1/stops/${stopId}/resolve` };
  return res;
}
async function resolveStop(stopId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "POST", url: getResolveStopUrl(stopId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
function getSendDirectMessageUrl(threadId) {
  const res = { method: "POST", url: `/v1/threads/${threadId}/direct` };
  return res;
}
async function sendDirectMessage(threadId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "POST", url: getSendDirectMessageUrl(threadId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
function getSteerThreadUrl(threadId) {
  const res = { method: "POST", url: `/v1/threads/${threadId}/steer` };
  return res;
}
async function steerThread(threadId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "POST", url: getSteerThreadUrl(threadId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const getNeedsYouPanelQueryKey = (threadId) => [{ url: "/v1/threads/:threadId/needs-you", params: { threadId } }];
function getNeedsYouPanelQueryOptions(threadId, config = {}) {
  const queryKey = getNeedsYouPanelQueryKey(threadId);
  return queryOptions({
    enabled: !!threadId,
    queryKey,
    queryFn: async ({ signal }) => {
      return getNeedsYouPanel(threadId, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetNeedsYouPanel(threadId, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getNeedsYouPanelQueryKey(threadId);
  const query = useQuery({
    ...getNeedsYouPanelQueryOptions(threadId, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const resolveStopMutationKey = () => [{ url: "/v1/stops/:stopId/resolve" }];
function resolveStopMutationOptions(config = {}) {
  const mutationKey = resolveStopMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ stopId, data }) => {
      return resolveStop(stopId, data, config);
    }
  });
}
function useResolveStop(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? resolveStopMutationKey();
  const baseOptions = resolveStopMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const sendDirectMessageMutationKey = () => [{ url: "/v1/threads/:threadId/direct" }];
function sendDirectMessageMutationOptions(config = {}) {
  const mutationKey = sendDirectMessageMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId, data }) => {
      return sendDirectMessage(threadId, data, config);
    }
  });
}
function useSendDirectMessage(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? sendDirectMessageMutationKey();
  const baseOptions = sendDirectMessageMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const steerThreadMutationKey = () => [{ url: "/v1/threads/:threadId/steer" }];
function steerThreadMutationOptions(config = {}) {
  const mutationKey = steerThreadMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId, data }) => {
      return steerThread(threadId, data, config);
    }
  });
}
function useSteerThread(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? steerThreadMutationKey();
  const baseOptions = steerThreadMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
function NeedsYouPanel({ threadId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useGetNeedsYouPanel(threadId);
  useServerEvents("browser.stop_raised", (event) => {
    if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) });
  });
  const stops = data?.stops ?? [];
  if (stops.length === 0) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: "mb-4 border-warning/50", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between border-b border-border px-5 py-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 font-semibold text-foreground", children: [
        t("session.needsYou"),
        " ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-normal text-muted-foreground", children: stops.length }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
          lineNumber: 37,
          columnNumber: 30
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
        lineNumber: 36,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: t("session.agentStopped") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
        lineNumber: 39,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 35,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border", children: stops.map((stop) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StopRow, { threadId, stop }, stop.stopId, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 43,
      columnNumber: 6
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 41,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
    lineNumber: 34,
    columnNumber: 3
  }, this);
}
function StopRow({ threadId, stop }) {
  const queryClient = useQueryClient();
  const resolve = useResolveStop();
  const onResolve = (resolution) => {
    resolve.mutate(
      { stopId: stop.stopId, data: { resolution } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) });
          queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) });
          queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() });
        }
      }
    );
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-3 px-5 py-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "outline", className: "shrink-0", children: enumLabel("StopKind", stop.kind) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 69,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium text-foreground", children: stop.title }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
        lineNumber: 73,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate text-sm text-muted-foreground", children: stop.detail }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
        lineNumber: 74,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 72,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "shrink-0 text-xs text-muted-foreground", children: stop.raisedAt }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 76,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex shrink-0 gap-2", children: stop.availableResolutions.map((resolution) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Button,
      {
        size: "sm",
        variant: resolutionIsPrimary[resolution] ? "default" : "outline",
        disabled: resolve.isPending,
        onClick: () => onResolve(resolution),
        children: enumLabel("StopResolution", resolution)
      },
      resolution,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
        lineNumber: 79,
        columnNumber: 6
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
      lineNumber: 77,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/NeedsYouPanel/index.tsx",
    lineNumber: 68,
    columnNumber: 3
  }, this);
}
const MODES = [
  { value: "STEER", labelKey: "session.modeWhisper" },
  { value: "DIRECT", labelKey: "session.modeDirect" }
];
function Composer({ threadId, composerMode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = reactExports.useState(composerMode);
  const [text, setText] = reactExports.useState("");
  const steer = useSteerThread();
  const direct = useSendDirectMessage();
  const pending = steer.isPending || direct.isPending;
  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const onSuccess = () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) });
    };
    if (mode === "STEER") steer.mutate({ threadId, data: { text: trimmed } }, { onSuccess });
    else direct.mutate({ threadId, data: { text: trimmed } }, { onSuccess });
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "sticky bottom-0 z-10 flex flex-col gap-2 bg-route-background pb-2 pt-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "inline-flex w-fit items-center gap-1 rounded-full bg-secondary p-1", children: MODES.map((m) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "button",
      {
        type: "button",
        onClick: () => setMode(m.value),
        className: cn(
          "rounded-full px-3 py-1 text-sm font-medium transition-colors",
          mode === m.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        ),
        children: t(m.labelKey)
      },
      m.value,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
        lineNumber: 46,
        columnNumber: 6
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
      lineNumber: 44,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-end gap-2 rounded-2xl border border-border bg-card p-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Textarea,
        {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          },
          placeholder: mode === "STEER" ? t("session.composerPlaceholderSteer") : t("session.composerPlaceholderDirect"),
          className: "min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
          lineNumber: 60,
          columnNumber: 5
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "icon", "aria-label": t("session.send"), disabled: !text.trim() || pending, onClick: send, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowUp, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
        lineNumber: 73,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
        lineNumber: 72,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
      lineNumber: 59,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "px-1 text-xs text-muted-foreground", children: mode === "STEER" ? t("session.composerSteerHint") : t("session.composerDirectHint") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
      lineNumber: 76,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx",
    lineNumber: 43,
    columnNumber: 3
  }, this);
}
function SessionChatSection({ threadId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetSessionChat(threadId);
  useServerEvents("browser.thread_status_changed", (event) => {
    if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) });
  });
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 w-2/3 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
        lineNumber: 24,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "ml-auto h-16 w-2/3 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 w-1/2 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
        lineNumber: 26,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 23,
      columnNumber: 4
    }, this);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NeedsYouPanel, { threadId }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 33,
      columnNumber: 4
    }, this),
    data.transcript.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { className: "py-16", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: t("session.chatEmptyTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
        lineNumber: 37,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("session.chatEmptyDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
        lineNumber: 38,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 36,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4 py-2", children: data.transcript.map((entry) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TranscriptBubble, { entry, threadId }, entry.entryId, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 43,
      columnNumber: 7
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 41,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Composer, { threadId, composerMode: data.composerMode }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
      lineNumber: 48,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.tsx",
    lineNumber: 32,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    threadId
  } = Route$3.useParams();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SessionChatSection, { threadId }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/index.tsx?tsr-split=component",
    lineNumber: 7,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
