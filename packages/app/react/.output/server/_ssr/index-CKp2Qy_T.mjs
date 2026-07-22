import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { e as Route$3, B as Button, c as cn, a as auth$2, h as handleApiError } from "./router-GQ4JltwW.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { b as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { F as FieldGroup, a as Field, b as FieldLabel, I as Input, c as FieldError } from "./input-rdFGzFZO.mjs";
import { S as Spinner } from "./spinner-C0Bce5in.mjs";
import { A as AuthFooter } from "./index-Bit3HRpz.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { c as IconMail, d as IconLock } from "../_libs/tabler__icons-react.mjs";
import { o as object, s as string, e as email } from "../_libs/zod.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/better-auth__core.mjs";
import "../_libs/defu.mjs";
import "../_libs/better-fetch__fetch.mjs";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
import "../_libs/nanostores.mjs";
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/isbot.mjs";
const signInSchema = object({
  email: email({ message: "INVALID_EMAIL" }),
  password: string().min(8, { message: "PASSWORD_TOO_SHORT" })
});
function SignInForm({ className, callback, email: email2, ...props }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { email: email2 ?? "", password: "" },
    validators: { onChange: signInSchema },
    onSubmit: async (form2) => {
      const result = signInSchema.safeParse(form2.value);
      if (!result.success) return;
      const { error } = await auth$2.signIn.email({
        email: result.data.email,
        password: result.data.password
      });
      if (error) {
        handleApiError(error);
        return;
      }
      toast.success(t("auth.signIn.loginSuccess"));
      const redirectTo = callback?.startsWith("/") && !callback.startsWith("//") ? callback : "/dashboard";
      await navigate({ to: redirectTo });
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col w-full", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 mb-8 text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-3xl font-semibold text-foreground", children: t("auth.signIn.title") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
        lineNumber: 56,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("auth.signIn.subtitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
        lineNumber: 57,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
      lineNumber: 55,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        className: "w-full",
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "email", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signIn.email") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 73,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconMail, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
                lineNumber: 75,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "email",
                  autoComplete: "email",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value),
                  className: "pl-9"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
                  lineNumber: 76,
                  columnNumber: 10
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 74,
              columnNumber: 9
            }, this),
            field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 86,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 72,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 70,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "password", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signIn.password") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 94,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLock, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
                lineNumber: 96,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "current-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value),
                  className: "pl-9"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
                  lineNumber: 97,
                  columnNumber: 10
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 95,
              columnNumber: 9
            }, this),
            field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
              lineNumber: 107,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 93,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 91,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: !canSubmit, className: "w-full mt-2", children: isSubmitting ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, {}, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 115,
            columnNumber: 25
          }, this) : t("auth.signIn.submit") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 114,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
            lineNumber: 112,
            columnNumber: 6
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
          lineNumber: 69,
          columnNumber: 5
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
        lineNumber: 60,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col items-center gap-2 mt-6 text-sm text-muted-foreground", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/reset-password", className: "hover:text-foreground", children: t("auth.signIn.forgot") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
        lineNumber: 123,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { children: [
        t("auth.signIn.noAccount"),
        " ",
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/sign-up", className: "text-primary font-medium hover:underline", children: t("auth.signIn.signUpLink") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
          lineNumber: 128,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
        lineNumber: 126,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
      lineNumber: 122,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AuthFooter, { className: "mt-8" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
      lineNumber: 134,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInForm/index.tsx",
    lineNumber: 54,
    columnNumber: 3
  }, this);
}
function SignInSidebar({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("aside", { className: cn("hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-8 lg:p-12", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/-components/SignInSidebar/index.tsx",
    lineNumber: 6,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    callback,
    email: email2
  } = Route$3.useSearch();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "w-full h-full flex min-h-screen", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex-1 flex flex-col items-center justify-center py-8 px-8 lg:px-16 xl:px-24 2xl:px-36 bg-background overflow-y-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full max-w-md", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SignInForm, { callback, email: email2 }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/index.tsx?tsr-split=component",
      lineNumber: 11,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/index.tsx?tsr-split=component",
      lineNumber: 10,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SignInSidebar, { className: "w-full lg:w-13/24" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/index.tsx?tsr-split=component",
      lineNumber: 14,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-in/index.tsx?tsr-split=component",
    lineNumber: 8,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
