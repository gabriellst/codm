import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { p as providerLabel } from "./glyphs-D8fG7IZJ.mjs";
import { D as Dot } from "./StatusDot-CDKvP_k7.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
function TranscriptBubble({ entry, threadId }) {
  const { t } = useTranslation();
  if (entry.kind === "ACTION") {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-2 py-1 text-sm text-muted-foreground", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "mt-1.5 bg-muted-foreground/50" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 20,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1", children: entry.text }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 21,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
      lineNumber: 19,
      columnNumber: 4
    }, this);
  }
  if (entry.kind === "CONTACT") {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-start gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "max-w-[85%] rounded-2xl rounded-tl-md bg-secondary px-4 py-2.5 text-foreground", children: entry.text }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 29,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-1 text-xs text-muted-foreground", children: entry.at }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 30,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this);
  }
  const isWhisper = entry.kind === "WHISPER";
  const caption = entry.kind === "AGENT" ? entry.provider ? providerLabel[entry.provider] : "Agent" : isWhisper ? "Whisper" : "You";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-end gap-1", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 px-1 text-xs text-muted-foreground", children: [
      entry.issueId && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Link,
        {
          to: "/threads/$threadId/issues/$issueId",
          params: { threadId, issueId: entry.issueId },
          className: "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono hover:bg-muted",
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "bg-info" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
              lineNumber: 47,
              columnNumber: 7
            }, this),
            " ",
            t("session.transcriptIssue")
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
          lineNumber: 42,
          columnNumber: 6
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { children: caption }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 50,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
      lineNumber: 40,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md px-4 py-2.5",
          isWhisper ? "border border-dashed border-border bg-muted italic text-muted-foreground" : "bg-primary text-primary-foreground"
        ),
        children: entry.text
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
        lineNumber: 52,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "px-1 text-xs text-muted-foreground", children: entry.at }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
      lineNumber: 60,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/TranscriptBubble/index.tsx",
    lineNumber: 39,
    columnNumber: 3
  }, this);
}
export {
  TranscriptBubble as T
};
