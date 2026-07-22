import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { L as Link, g as getRouteApi } from "../_libs/tanstack__react-router.mjs";
import { B as Button, E as Empty, b as EmptyTitle, d as EmptyDescription } from "./router-NNnLbzcz.mjs";
import { u as useGetIssuesOverview } from "./useGetIssuesOverview-DppPbMnY.mjs";
import { P as PageHeader } from "./PageHeader-D0tGWiN4.mjs";
import { I as IssueRow } from "./IssueRow-DPlRO14k.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import "./avatar-CUy_TWwL.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
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
import "../_libs/tanstack__react-query.mjs";
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
const routeApi = getRouteApi("/(app)/issues/");
const STATUS_ORDER = ["NEEDS_INPUT", "WORKING", "COMPLETED"];
function IssuesOverviewSection() {
  const { t } = useTranslation();
  const { archived } = routeApi.useSearch();
  const { data, isLoading } = useGetIssuesOverview({ includeArchived: archived });
  const stats = data?.statsLine;
  const subtitle = stats ? t("issues.statsLine", {
    awaitingInput: stats.awaitingInput,
    working: stats.working,
    completed: stats.completed,
    archived: stats.archived
  }) : void 0;
  const orderedGroups = STATUS_ORDER.map((status) => data?.groups.find((g) => g.status === status)).filter(
    (g) => !!g && g.items.length > 0
  );
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PageHeader,
      {
        title: t("issues.title"),
        subtitle: subtitle ?? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-64" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 40,
          columnNumber: 27
        }, this),
        action: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: archived ? "secondary" : "outline", size: "sm", render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/issues", search: { archived: !archived } }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 42,
          columnNumber: 77
        }, this), children: archived ? t("issues.hideArchived") : t("issues.showArchived") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 42,
          columnNumber: 6
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 38,
        columnNumber: 4
      },
      this
    ),
    isLoading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 50,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 51,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-16 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 52,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
      lineNumber: 49,
      columnNumber: 5
    }, this) : orderedGroups.length === 0 && (!data || data.archived.length === 0) ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: t("issues.emptyTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 56,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("issues.emptyDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 57,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
      lineNumber: 55,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-8", children: [
      orderedGroups.map((group) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-2 pb-1", children: enumLabel("IssueStatus", group.status) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 63,
          columnNumber: 8
        }, this),
        group.items.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueRow, { item }, item.issueId, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 65,
          columnNumber: 9
        }, this))
      ] }, group.status, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 62,
        columnNumber: 7
      }, this)),
      archived && data && data.archived.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow px-2 pb-1", children: t("issues.archived") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 72,
          columnNumber: 8
        }, this),
        data.archived.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssueRow, { item }, item.issueId, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
          lineNumber: 74,
          columnNumber: 9
        }, this))
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
        lineNumber: 71,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
      lineNumber: 60,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/-components/IssuesOverviewSection/index.tsx",
    lineNumber: 37,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IssuesOverviewSection, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/issues/index.tsx?tsr-split=component",
    lineNumber: 6,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
