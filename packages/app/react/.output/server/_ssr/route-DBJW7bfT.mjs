import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { O as Outlet, a as useRouter, b as useRouterState, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useQueryClient, b as useMutation, m as mutationOptions, a as useQuery, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
import { R as Route$6, B as Button, c as cn } from "./router-NNnLbzcz.mjs";
import { g as getHomeDashboardQueryKey } from "./useGetHomeDashboard-DiPbV2MB.mjs";
import { u as useGetSessionChat, g as getSessionChatQueryKey } from "./useGetSessionChat-2IZfXUwv.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { a as useServerEvents } from "./useServerEvents-Dhc918lv.mjs";
import { T as ThreadAvatar } from "./ThreadAvatar-DOwlc1eN.mjs";
import { D as Dot } from "./StatusDot-CDKvP_k7.mjs";
import { c as channelLabel, p as providerLabel, a as providerGlyph } from "./glyphs-D8fG7IZJ.mjs";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription } from "./dialog-CDhCxi7G.mjs";
import { I as Input } from "./input-D11kk7yl.mjs";
import { S as Switch } from "./switch-BiZsBu9O.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import "./avatar-CUy_TWwL.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { p as IconChevronLeft, q as IconPlayerPlay, r as IconPlayerPause, s as IconSettings2 } from "../_libs/tabler__icons-react.mjs";
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
import "../_libs/tanstack__query-core.mjs";
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
function getConfigureContextBufferUrl(threadId) {
  const res = { method: "PUT", url: `/v1/threads/${threadId}/buffer` };
  return res;
}
async function configureContextBuffer(threadId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "PUT", url: getConfigureContextBufferUrl(threadId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
function getConfigureMentionGateUrl(threadId) {
  const res = { method: "PUT", url: `/v1/threads/${threadId}/mention-gate` };
  return res;
}
async function configureMentionGate(threadId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "PUT", url: getConfigureMentionGateUrl(threadId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
function getGetThreadSettingsUrl(threadId) {
  const res = { method: "GET", url: `/v1/threads/${threadId}/settings` };
  return res;
}
async function getThreadSettings(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetThreadSettingsUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
function getPauseThreadUrl(threadId) {
  const res = { method: "POST", url: `/v1/threads/${threadId}/pause` };
  return res;
}
async function pauseThread(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "POST", url: getPauseThreadUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
function getResumeThreadUrl(threadId) {
  const res = { method: "POST", url: `/v1/threads/${threadId}/resume` };
  return res;
}
async function resumeThread(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "POST", url: getResumeThreadUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
function getSetParticipantInvocationUrl(threadId, participantId) {
  const res = { method: "PUT", url: `/v1/threads/${threadId}/participants/${participantId}` };
  return res;
}
async function setParticipantInvocation(threadId, participantId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "PUT", url: getSetParticipantInvocationUrl(threadId, participantId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const configureContextBufferMutationKey = () => [{ url: "/v1/threads/:threadId/buffer" }];
function configureContextBufferMutationOptions(config = {}) {
  const mutationKey = configureContextBufferMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId, data }) => {
      return configureContextBuffer(threadId, data, config);
    }
  });
}
function useConfigureContextBuffer(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? configureContextBufferMutationKey();
  const baseOptions = configureContextBufferMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const configureMentionGateMutationKey = () => [{ url: "/v1/threads/:threadId/mention-gate" }];
function configureMentionGateMutationOptions(config = {}) {
  const mutationKey = configureMentionGateMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId, data }) => {
      return configureMentionGate(threadId, data, config);
    }
  });
}
function useConfigureMentionGate(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? configureMentionGateMutationKey();
  const baseOptions = configureMentionGateMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const getThreadSettingsQueryKey = (threadId) => [{ url: "/v1/threads/:threadId/settings", params: { threadId } }];
function getThreadSettingsQueryOptions(threadId, config = {}) {
  const queryKey = getThreadSettingsQueryKey(threadId);
  return queryOptions({
    enabled: !!threadId,
    queryKey,
    queryFn: async ({ signal }) => {
      return getThreadSettings(threadId, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetThreadSettings(threadId, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getThreadSettingsQueryKey(threadId);
  const query = useQuery({
    ...getThreadSettingsQueryOptions(threadId, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const pauseThreadMutationKey = () => [{ url: "/v1/threads/:threadId/pause" }];
function pauseThreadMutationOptions(config = {}) {
  const mutationKey = pauseThreadMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId }) => {
      return pauseThread(threadId, config);
    }
  });
}
function usePauseThread(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? pauseThreadMutationKey();
  const baseOptions = pauseThreadMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const resumeThreadMutationKey = () => [{ url: "/v1/threads/:threadId/resume" }];
function resumeThreadMutationOptions(config = {}) {
  const mutationKey = resumeThreadMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId }) => {
      return resumeThread(threadId, config);
    }
  });
}
function useResumeThread(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? resumeThreadMutationKey();
  const baseOptions = resumeThreadMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const setParticipantInvocationMutationKey = () => [{ url: "/v1/threads/:threadId/participants/:participantId" }];
function setParticipantInvocationMutationOptions(config = {}) {
  const mutationKey = setParticipantInvocationMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ threadId, participantId, data }) => {
      return setParticipantInvocation(threadId, participantId, data, config);
    }
  });
}
function useSetParticipantInvocation(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? setParticipantInvocationMutationKey();
  const baseOptions = setParticipantInvocationMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const BUFFER_SIZES = ["25", "50", "100", "200"];
function ThreadSettingsDialog({ threadId, trigger }) {
  const { t } = useTranslation();
  const [open, setOpen] = reactExports.useState(false);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTrigger, { render: trigger }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { className: "max-w-lg", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: t("session.settingsTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 30,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: t("session.settingsDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 31,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 29,
        columnNumber: 5
      }, this),
      open && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadSettingsBody, { threadId }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 33,
        columnNumber: 14
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
function ThreadSettingsBody({ threadId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetThreadSettings(threadId);
  const configureMentionGate2 = useConfigureMentionGate();
  const configureBuffer = useConfigureContextBuffer();
  const setInvocation = useSetParticipantInvocation();
  const [gateEnabled, setGateEnabled] = reactExports.useState(false);
  const [tag, setTag] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (!data) return;
    setGateEnabled(data.mentionGate.enabled);
    setTag(data.mentionGate.enabled ? data.mentionGate.tag : "");
  }, [data]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) });
  const saveGate = (enabled, nextTag) => {
    const mentionGate = enabled ? { enabled: true, tag: nextTag } : { enabled: false };
    configureMentionGate2.mutate({ threadId, data: { mentionGate } }, { onSuccess: invalidate });
  };
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-14 rounded-xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 66,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-24 rounded-xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 67,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 65,
      columnNumber: 4
    }, this);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "label-eyebrow", children: t("session.respondTrigger") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 75,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-foreground", children: t("session.onlyWhenMentioned") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 78,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: t("session.onlyWhenMentionedHint") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 79,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 77,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Switch,
          {
            checked: gateEnabled,
            onCheckedChange: (value) => {
              setGateEnabled(value);
              saveGate(value, tag);
            }
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 81,
            columnNumber: 6
          },
          this
        )
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 76,
        columnNumber: 5
      }, this),
      gateEnabled && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Input,
        {
          "aria-label": t("session.mentionTag"),
          placeholder: t("session.mentionTagPlaceholder"),
          value: tag,
          onChange: (e) => setTag(e.target.value),
          onBlur: () => saveGate(true, tag)
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 90,
          columnNumber: 6
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 74,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "label-eyebrow", children: t("session.participants") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 102,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: t("session.canInvoke", { count: data.invokerCount }) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 103,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 101,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border", children: data.participants.map((participant) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex items-center gap-4 p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-foreground", children: participant.name }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 109,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: participant.source }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 110,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 108,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Switch,
          {
            checked: participant.canInvoke,
            onCheckedChange: (value) => setInvocation.mutate(
              { threadId, participantId: participant.participantId, data: { canInvoke: value } },
              { onSuccess: invalidate }
            )
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
            lineNumber: 112,
            columnNumber: 8
          },
          this
        )
      ] }, participant.participantId, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 107,
        columnNumber: 7
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 105,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 100,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h3", { className: "label-eyebrow", children: t("session.contextBuffer") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 127,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "inline-flex items-center gap-1 rounded-full bg-secondary p-1", children: BUFFER_SIZES.map((size) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "button",
        {
          type: "button",
          onClick: () => configureBuffer.mutate({ threadId, data: { bufferSize: size } }, { onSuccess: invalidate }),
          className: cn(
            "rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
            data.bufferSize === size ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          ),
          children: String(size)
        },
        size,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
          lineNumber: 130,
          columnNumber: 7
        },
        this
      )) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 128,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("session.contextBufferHint") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
        lineNumber: 143,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
      lineNumber: 126,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx",
    lineNumber: 73,
    columnNumber: 3
  }, this);
}
const TABS = [
  { labelKey: "session.tabChat", to: "/threads/$threadId" },
  { labelKey: "session.tabIssues", to: "/threads/$threadId/issues" },
  { labelKey: "session.tabArtifacts", to: "/threads/$threadId/artifacts" }
];
function SessionHeader({ threadId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data, isLoading } = useGetSessionChat(threadId);
  const pause = usePauseThread();
  const resume = useResumeThread();
  useServerEvents("browser.thread_status_changed", (event) => {
    if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) });
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) });
    queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() });
  };
  const activeTab = pathname.endsWith("/artifacts") ? "/threads/$threadId/artifacts" : pathname.includes("/issues") ? "/threads/$threadId/issues" : "/threads/$threadId";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex shrink-0 flex-col gap-4 pb-4", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", size: "icon", "aria-label": t("session.back"), className: "rounded-full", onClick: () => router.history.back(), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronLeft, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
      lineNumber: 56,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
      lineNumber: 55,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      isLoading || !data ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-12 w-64" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
        lineNumber: 61,
        columnNumber: 6
      }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadAvatar, { name: data.thread.displayName, channelKind: data.thread.channelKind, size: "lg" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 64,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-2xl text-foreground md:text-3xl", children: data.thread.displayName }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
            lineNumber: 66,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-mono text-sm text-muted-foreground", children: [
            channelLabel[data.thread.channelKind],
            " · ",
            data.thread.workspacePath
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
            lineNumber: 67,
            columnNumber: 8
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 65,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
        lineNumber: 63,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "inline-flex items-center gap-1 rounded-full bg-secondary p-1", children: TABS.map((tab) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Link,
        {
          to: tab.to,
          params: { threadId },
          className: cn(
            "rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
            activeTab === tab.to ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          ),
          children: t(tab.labelKey)
        },
        tab.to,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 76,
          columnNumber: 7
        },
        this
      )) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
        lineNumber: 74,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
      lineNumber: 59,
      columnNumber: 4
    }, this),
    data && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-wrap items-center gap-2", children: [
      data.thread.providers.map((provider) => {
        const Glyph = providerGlyph[provider];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "span",
          {
            className: "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-foreground",
            children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-4" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
                lineNumber: 100,
                columnNumber: 9
              }, this),
              " ",
              providerLabel[provider]
            ]
          },
          provider,
          true,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
            lineNumber: 96,
            columnNumber: 8
          },
          this
        );
      }),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
            data.thread.status === "RUNNING" ? "bg-primary text-primary-foreground" : "border border-border text-foreground"
          ),
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
              Dot,
              {
                className: data.thread.status === "RUNNING" ? "bg-success" : data.thread.status === "NEEDS_ATTENTION" ? "bg-warning" : "bg-muted-foreground/40"
              },
              void 0,
              false,
              {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
                lineNumber: 111,
                columnNumber: 7
              },
              this
            ),
            enumLabel("ThreadStatus", data.thread.status)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 105,
          columnNumber: 6
        },
        this
      ),
      data.paused ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Button,
        {
          variant: "outline",
          size: "sm",
          disabled: resume.isPending,
          onClick: () => resume.mutate({ threadId }, { onSuccess: invalidate }),
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlayerPlay, { "data-icon": "inline-start" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
              lineNumber: 130,
              columnNumber: 8
            }, this),
            " ",
            t("session.resume")
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 124,
          columnNumber: 7
        },
        this
      ) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Button,
        {
          variant: "outline",
          size: "sm",
          disabled: pause.isPending,
          onClick: () => pause.mutate({ threadId }, { onSuccess: invalidate }),
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlayerPause, { "data-icon": "inline-start" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
              lineNumber: 139,
              columnNumber: 8
            }, this),
            " ",
            t("session.pause")
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 133,
          columnNumber: 7
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ThreadSettingsDialog,
        {
          threadId,
          trigger: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", size: "sm", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconSettings2, { "data-icon": "inline-start" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
              lineNumber: 147,
              columnNumber: 9
            }, this),
            " ",
            t("session.threadSettings")
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
            lineNumber: 146,
            columnNumber: 8
          }, this)
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
          lineNumber: 143,
          columnNumber: 6
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
      lineNumber: 92,
      columnNumber: 5
    }, this),
    data && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: data.autonomyCaption }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
      lineNumber: 154,
      columnNumber: 13
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionHeader/index.tsx",
    lineNumber: 54,
    columnNumber: 3
  }, this);
}
function SessionLayout() {
  const {
    threadId
  } = Route$6.useParams();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col px-6 pb-8 pt-20", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SessionHeader, { threadId }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/route.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/route.tsx?tsr-split=component",
      lineNumber: 10,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/route.tsx?tsr-split=component",
    lineNumber: 8,
    columnNumber: 10
  }, this);
}
export {
  SessionLayout as component
};
