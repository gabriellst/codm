import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { A as Avatar, a as AvatarFallback } from "./avatar-CUy_TWwL.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { b as channelGlyph } from "./glyphs-D8fG7IZJ.mjs";
function initials(name) {
  const cleaned = name.replace(/^@/, "").trim();
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}
function ThreadAvatar({
  name,
  channelKind,
  size = "default",
  className
}) {
  const Glyph = channelKind ? channelGlyph[channelKind] : void 0;
  const badgeSize = size === "lg" ? "size-4" : "size-3.5";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("relative shrink-0", className), children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { size, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { children: initials(name) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/ThreadAvatar.tsx",
      lineNumber: 36,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/ThreadAvatar.tsx",
      lineNumber: 35,
      columnNumber: 4
    }, this),
    Glyph && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "span",
      {
        className: cn(
          "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background",
          badgeSize
        ),
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-2.5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/ThreadAvatar.tsx",
          lineNumber: 45,
          columnNumber: 6
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/ThreadAvatar.tsx",
        lineNumber: 39,
        columnNumber: 5
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/ThreadAvatar.tsx",
    lineNumber: 34,
    columnNumber: 3
  }, this);
}
export {
  ThreadAvatar as T
};
