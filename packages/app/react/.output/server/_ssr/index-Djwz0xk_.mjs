import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { h as Route$1, E as Empty, b as EmptyTitle, d as EmptyDescription } from "./router-NNnLbzcz.mjs";
import { u as useGetSessionIssues } from "./useGetSessionIssues-bLpw0c21.mjs";
import { I as IssueRow } from "./IssueRow-DPlRO14k.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import "./avatar-CUy_TWwL.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
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
import "../_libs/tabler__icons-react.mjs";
import "../_libs/zod.mjs";
import "../_http-B7Tvv7R3.mjs";
import "./StatusDot-CDKvP_k7.mjs";
import "./ThreadAvatar-DOwlc1eN.mjs";
import "./glyphs-D8fG7IZJ.mjs";
const STATUS_ORDER = ["NEEDS_INPUT", "WORKING", "COMPLETED"];
function SessionIssuesSection({ threadId }) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetSessionIssues(threadId);
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-56" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 19,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 20,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 21,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
      lineNumber: 18,
      columnNumber: 4
    }, this);
  }
  const stats = data.statsLine;
  const orderedGroups = STATUS_ORDER.map((status) => data.groups.find((g) => g.status === status)).filter(
    (g) => !!g && g.items.length > 0
  );
  const empty = orderedGroups.length === 0 && data.archived.length === 0;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-6 py-2", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("session.issuesStats", { awaiting: stats.awaitingInput, working: stats.working, completed: stats.completed }) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
      lineNumber: 34,
      columnNumber: 4
    }, this),
    empty ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: t("session.issuesEmptyTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 40,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("session.issuesEmptyDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 41,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
      lineNumber: 39,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-8", children: [
      orderedGroups.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-2 pb-1", children: enumLabel("IssueStatus", group.status) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
          lineNumber: 47,
          columnNumber: 8
        }, this),
        group.items.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueRow, { item: { ...item, threadId } }, item.issueId, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
          lineNumber: 49,
          columnNumber: 9
        }, this))
      ] }, group.status, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 46,
        columnNumber: 7
      }, this)),
      data.archived.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-2 pb-1", children: t("session.archived") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
          lineNumber: 56,
          columnNumber: 8
        }, this),
        data.archived.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueRow, { item: { ...item, threadId } }, item.issueId, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
          lineNumber: 58,
          columnNumber: 9
        }, this))
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
        lineNumber: 55,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
      lineNumber: 44,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-muted-foreground", children: data.autoArchiveNote }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
      lineNumber: 65,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionIssuesSection/index.tsx",
    lineNumber: 33,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    threadId
  } = Route$1.useParams();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SessionIssuesSection, { threadId }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/issues/index.tsx?tsr-split=component",
    lineNumber: 7,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
