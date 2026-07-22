import { r as reactExports, c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { u as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { c as cn, B as Button } from "./router-NNnLbzcz.mjs";
import { L as Logo } from "./Logo-yUfi7q_5.mjs";
import { C as CHANNEL_KINDS, b as channelGlyph, a as providerGlyph } from "./glyphs-D8fG7IZJ.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { i as IconArrowRight } from "../_libs/tabler__icons-react.mjs";
import { c as create } from "../_libs/zustand.mjs";
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
import "../_libs/zod.mjs";
const initialState = {
  currentSlide: 0,
  direction: 1
};
const useOnboardingStore = create()((set) => ({
  ...initialState,
  setCurrentSlide: (currentSlide) => set({ currentSlide }),
  setDirection: (direction) => set({ direction }),
  reset: () => set(initialState)
}));
const PROVIDER_KINDS = ["CLAUDE_CODE", "CODEX", "OPENCODE"];
function ValueSlide() {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
      CHANNEL_KINDS.map((kind) => {
        const Glyph = channelGlyph[kind];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
          lineNumber: 18,
          columnNumber: 8
        }, this) }, kind, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
          lineNumber: 17,
          columnNumber: 7
        }, this);
      }),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, { className: "size-6 text-foreground" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
        lineNumber: 22,
        columnNumber: 5
      }, this),
      PROVIDER_KINDS.map((kind) => {
        const Glyph = providerGlyph[kind];
        return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-12 items-center justify-center rounded-full border border-border text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
          lineNumber: 27,
          columnNumber: 8
        }, this) }, kind, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
          lineNumber: 26,
          columnNumber: 7
        }, this);
      })
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
      lineNumber: 13,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-4xl text-foreground md:text-5xl", children: t("onboarding.slide1Title") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
      lineNumber: 32,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-muted-foreground", children: t("onboarding.slide1Body") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
      lineNumber: 33,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx",
    lineNumber: 12,
    columnNumber: 3
  }, this);
}
const STEPS = [
  { n: 1, titleKey: "onboarding.stepChannelTitle", descKey: "onboarding.stepChannelDesc" },
  { n: 2, titleKey: "onboarding.stepWorkspaceTitle", descKey: "onboarding.stepWorkspaceDesc" },
  { n: 3, titleKey: "onboarding.stepThreadTitle", descKey: "onboarding.stepThreadDesc" }
];
function HowItWorksSlide() {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex w-full flex-col items-center gap-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-4xl text-foreground md:text-5xl", children: t("onboarding.slide2Title") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
      lineNumber: 15,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex w-full flex-col gap-5 text-left", children: STEPS.map((step) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground", children: step.n }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
        lineNumber: 19,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-semibold text-foreground", children: t(step.titleKey) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
          lineNumber: 23,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: t(step.descKey) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
          lineNumber: 24,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
        lineNumber: 22,
        columnNumber: 7
      }, this)
    ] }, step.n, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
      lineNumber: 18,
      columnNumber: 6
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
      lineNumber: 16,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/HowItWorksSlide/index.tsx",
    lineNumber: 14,
    columnNumber: 3
  }, this);
}
function ControlSlide() {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-6", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-4xl text-foreground md:text-5xl", children: t("onboarding.slide3Title") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ControlSlide/index.tsx",
      lineNumber: 8,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-muted-foreground", children: t("onboarding.slide3Body") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ControlSlide/index.tsx",
      lineNumber: 9,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/ControlSlide/index.tsx",
    lineNumber: 7,
    columnNumber: 3
  }, this);
}
const SLIDES = ["VALUE", "HOW", "CONTROL"];
const SLIDE_COMPONENTS = {
  VALUE: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ValueSlide, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
    lineNumber: 18,
    columnNumber: 9
  }, void 0),
  HOW: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HowItWorksSlide, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
    lineNumber: 19,
    columnNumber: 7
  }, void 0),
  CONTROL: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ControlSlide, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
    lineNumber: 20,
    columnNumber: 11
  }, void 0)
};
function OnboardingFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentSlide, direction, setCurrentSlide, setDirection, reset } = useOnboardingStore();
  reactExports.useEffect(() => reset(), [reset]);
  const lastIndex = SLIDES.length - 1;
  const slideId = SLIDES[currentSlide] ?? SLIDES[0];
  const done = () => navigate({ to: "/dashboard" });
  const goTo = (index) => {
    setDirection(index < currentSlide ? -1 : 1);
    setCurrentSlide(Math.min(lastIndex, Math.max(0, index)));
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-h-dvh flex-col bg-route-background text-foreground", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("header", { className: "flex items-center justify-between px-6 py-6 md:px-10", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Logo, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
        lineNumber: 44,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/dashboard", className: "text-sm font-medium text-foreground underline-offset-4 hover:underline", children: t("onboarding.skip") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
        lineNumber: 45,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
      lineNumber: 43,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "flex flex-1 flex-col items-center justify-center px-6 pb-16", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex w-full max-w-xl flex-col items-center gap-8 text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "div",
        {
          className: cn(
            "flex w-full flex-col items-center gap-8 text-center",
            "animate-in fade-in duration-300 ease-out",
            direction === 1 ? "slide-in-from-right-10" : "slide-in-from-left-10"
          ),
          children: SLIDE_COMPONENTS[slideId]
        },
        slideId,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
          lineNumber: 52,
          columnNumber: 6
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2", children: SLIDES.map((id, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "span",
        {
          className: cn("h-2 rounded-full transition-all duration-300", i === currentSlide ? "w-6 bg-primary" : "w-2 bg-border")
        },
        id,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
          lineNumber: 65,
          columnNumber: 8
        },
        this
      )) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
        lineNumber: 63,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        currentSlide > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", onClick: () => goTo(currentSlide - 1), children: t("onboarding.back") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
          lineNumber: 74,
          columnNumber: 8
        }, this),
        currentSlide < lastIndex ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { onClick: () => goTo(currentSlide + 1), children: [
          t("onboarding.next"),
          " ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, { "data-icon": "inline-end" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
            lineNumber: 80,
            columnNumber: 32
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
          lineNumber: 79,
          columnNumber: 8
        }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { onClick: done, children: [
          t("onboarding.getStarted"),
          " ",
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconArrowRight, { "data-icon": "inline-end" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
            lineNumber: 84,
            columnNumber: 38
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
          lineNumber: 83,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
        lineNumber: 72,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
      lineNumber: 51,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
      lineNumber: 50,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.tsx",
    lineNumber: 42,
    columnNumber: 3
  }, this);
}
const SplitComponent = OnboardingFlow;
export {
  SplitComponent as component
};
