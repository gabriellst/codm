import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { u as useQueryClient, a as useQuery, b as useMutation, q as queryOptions, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { u as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { i as Route, B as Button } from "./router-NNnLbzcz.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { g as getSessionIssuesQueryKey } from "./useGetSessionIssues-bLpw0c21.mjs";
import { B as Badge } from "./badge-CKHT7bhp.mjs";
import { T as Textarea } from "./textarea-864XhA0n.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { T as TranscriptBubble } from "./index-Dt7arRrI.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { p as IconChevronLeft, w as IconArrowUp } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__query-core.mjs";
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
import "./glyphs-D8fG7IZJ.mjs";
import "./StatusDot-CDKvP_k7.mjs";
function getArchiveIssueUrl(issueId) {
  const res = { method: "POST", url: `/v1/issues/${issueId}/archive` };
  return res;
}
async function archiveIssue(issueId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "POST", url: getArchiveIssueUrl(issueId).url.toString(), ...requestConfig });
  return res.data;
}
function getGetIssueDetailUrl(issueId) {
  const res = { method: "GET", url: `/v1/issues/${issueId}` };
  return res;
}
async function getIssueDetail(issueId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetIssueDetailUrl(issueId).url.toString(), ...requestConfig });
  return res.data;
}
function getSteerIssueUrl(issueId) {
  const res = { method: "POST", url: `/v1/issues/${issueId}/steer` };
  return res;
}
async function steerIssue(issueId, data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "POST", url: getSteerIssueUrl(issueId).url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const archiveIssueMutationKey = () => [{ url: "/v1/issues/:issueId/archive" }];
function archiveIssueMutationOptions(config = {}) {
  const mutationKey = archiveIssueMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ issueId }) => {
      return archiveIssue(issueId, config);
    }
  });
}
function useArchiveIssue(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? archiveIssueMutationKey();
  const baseOptions = archiveIssueMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const getIssueDetailQueryKey = (issueId) => [{ url: "/v1/issues/:issueId", params: { issueId } }];
function getIssueDetailQueryOptions(issueId, config = {}) {
  const queryKey = getIssueDetailQueryKey(issueId);
  return queryOptions({
    enabled: !!issueId,
    queryKey,
    queryFn: async ({ signal }) => {
      return getIssueDetail(issueId, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetIssueDetail(issueId, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getIssueDetailQueryKey(issueId);
  const query = useQuery({
    ...getIssueDetailQueryOptions(issueId, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const steerIssueMutationKey = () => [{ url: "/v1/issues/:issueId/steer" }];
function steerIssueMutationOptions(config = {}) {
  const mutationKey = steerIssueMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ issueId, data }) => {
      return steerIssue(issueId, data, config);
    }
  });
}
function useSteerIssue(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? steerIssueMutationKey();
  const baseOptions = steerIssueMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
function IssueDetailSection({ threadId, issueId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useGetIssueDetail(issueId);
  const archive = useArchiveIssue();
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-8 w-64" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 34,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-48 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 35,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 33,
      columnNumber: 4
    }, this);
  }
  const onArchive = () => {
    archive.mutate(
      { issueId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) });
          queryClient.invalidateQueries({ queryKey: getSessionIssuesQueryKey(threadId) });
          navigate({ to: "/threads/$threadId/issues", params: { threadId } });
        }
      }
    );
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-6 py-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Link,
      {
        to: "/threads/$threadId/issues",
        params: { threadId },
        className: "inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronLeft, { className: "size-4" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
            lineNumber: 60,
            columnNumber: 5
          }, this),
          " ",
          t("session.allIssues")
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 55,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-2xl text-foreground", children: data.issue.title }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
            lineNumber: 66,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: "outline", children: enumLabel("IssueStatus", data.issue.status) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
            lineNumber: 67,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
          lineNumber: 65,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "font-mono text-sm text-muted-foreground", children: [
          data.issue.key,
          data.issue.meta ? ` · ${data.issue.meta}` : ""
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
          lineNumber: 69,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 64,
        columnNumber: 5
      }, this),
      !data.issue.archived && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", size: "sm", disabled: archive.isPending, onClick: onArchive, children: t("session.archive") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 75,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 63,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TerminalPanel, { lines: data.terminalLog }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 81,
      columnNumber: 4
    }, this),
    data.routedMessages.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("session.messagesRoutedHere") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 85,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: data.routedMessages.map((entry) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TranscriptBubble, { entry, threadId }, entry.entryId, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 88,
        columnNumber: 8
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 86,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 84,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueSteerComposer, { issueId }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 94,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
    lineNumber: 54,
    columnNumber: 3
  }, this);
}
function TerminalPanel({ lines }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("session.terminalSession") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 104,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "overflow-x-auto rounded-2xl bg-[oklch(0.16_0_0)] p-4 font-mono text-sm leading-relaxed text-[oklch(0.9_0_0)]", children: lines.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-[oklch(0.6_0_0)]", children: t("session.waitingTerminal") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 107,
      columnNumber: 6
    }, this) : lines.map((line, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: terminal log is append-only — index is a stable identity
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex gap-2 whitespace-pre", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "select-none text-[oklch(0.55_0_0)]", children: "›" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
          lineNumber: 112,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: line.line }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
          lineNumber: 113,
          columnNumber: 8
        }, this)
      ] }, `${line.at}-${i}`, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 111,
        columnNumber: 7
      }, this)
    )) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 105,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
    lineNumber: 103,
    columnNumber: 3
  }, this);
}
function IssueSteerComposer({ issueId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = reactExports.useState("");
  const steer = useSteerIssue();
  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || steer.isPending) return;
    steer.mutate(
      { issueId, data: { text: trimmed } },
      {
        onSuccess: () => {
          setText("");
          queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) });
        }
      }
    );
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
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
          placeholder: t("session.steerPlaceholder"),
          className: "min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
          lineNumber: 145,
          columnNumber: 5
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "icon", "aria-label": t("session.steer"), disabled: !text.trim() || steer.isPending, onClick: send, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowUp, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 158,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
        lineNumber: 157,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 144,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "px-1 text-xs text-muted-foreground", children: t("session.steerHint") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
      lineNumber: 161,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx",
    lineNumber: 143,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    threadId,
    issueId
  } = Route.useParams();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueDetailSection, { threadId, issueId }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/issues/$issueId/index.tsx?tsr-split=component",
    lineNumber: 8,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
