import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { D as Dot } from "./StatusDot-CDKvP_k7.mjs";
import { T as ThreadAvatar } from "./ThreadAvatar-DOwlc1eN.mjs";
import { i as issueStatusDot } from "./glyphs-D8fG7IZJ.mjs";
import { M as IconAsterisk, j as IconChevronRight } from "../_libs/tabler__icons-react.mjs";
function IssueRow({ item }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Link,
    {
      to: "/threads/$threadId/issues/$issueId",
      params: { threadId: item.threadId, issueId: item.issueId },
      className: "flex items-center gap-4 rounded-2xl px-2 py-3 transition-colors hover:bg-muted",
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex w-5 shrink-0 justify-center text-muted-foreground", children: item.status === "NEEDS_INPUT" ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconAsterisk, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 32,
          columnNumber: 38
        }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: issueStatusDot[item.status] }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 32,
          columnNumber: 76
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 31,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: cn("truncate font-semibold text-foreground", item.status === "COMPLETED" && "text-muted-foreground"), children: item.title }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
            lineNumber: 35,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate font-mono text-xs text-muted-foreground", children: item.key }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
            lineNumber: 38,
            columnNumber: 5
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 34,
          columnNumber: 4
        }, this),
        item.threadDisplayName && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "hidden items-center gap-2 rounded-full border border-border px-2.5 py-1 sm:inline-flex", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadAvatar, { name: item.threadDisplayName, size: "sm" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
            lineNumber: 42,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "max-w-32 truncate text-sm text-foreground", children: item.threadDisplayName }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
            lineNumber: 43,
            columnNumber: 6
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 41,
          columnNumber: 5
        }, this),
        item.meta && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "hidden shrink-0 font-mono text-xs text-muted-foreground md:inline", children: item.meta }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 46,
          columnNumber: 18
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronRight, { className: "size-4 shrink-0 text-muted-foreground" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
          lineNumber: 47,
          columnNumber: 4
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/IssueRow.tsx",
      lineNumber: 26,
      columnNumber: 3
    },
    this
  );
}
export {
  IssueRow as I
};
