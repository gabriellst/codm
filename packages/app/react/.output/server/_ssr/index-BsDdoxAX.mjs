import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { f as Route$2, B as Button, c as cn, a as auth$2, h as handleApiError } from "./router-GQ4JltwW.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { b as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { F as FieldGroup, a as Field, b as FieldLabel, I as Input, c as FieldError } from "./input-rdFGzFZO.mjs";
import { S as Spinner } from "./spinner-C0Bce5in.mjs";
import { A as AuthFooter } from "./index-Bit3HRpz.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { d as IconLock, c as IconMail } from "../_libs/tabler__icons-react.mjs";
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
const resetSchema = object({
  newPassword: string().min(8, { message: "PASSWORD_TOO_SHORT" }).max(64),
  confirmNewPassword: string().min(8).max(64)
}).refine((d) => d.newPassword === d.confirmNewPassword, { message: "PASSWORDS_DONT_MATCH", path: ["confirmNewPassword"] });
function ResetPasswordForm({ className, token, ...props }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: { newPassword: "", confirmNewPassword: "" },
    validators: { onChange: resetSchema },
    onSubmit: async (form2) => {
      const result = resetSchema.safeParse(form2.value);
      if (!result.success) return;
      const { error } = await auth$2.resetPassword({ token, newPassword: result.data.newPassword });
      if (error) {
        handleApiError(error);
        return;
      }
      toast.success(t("auth.resetPassword.resetSuccess"), {
        description: t("auth.resetPassword.resetSuccessDescription")
      });
      navigate({ to: "/sign-in" });
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col w-full", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 mb-8 text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-3xl font-semibold text-foreground", children: t("auth.resetPassword.resetTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
        lineNumber: 54,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("auth.resetPassword.resetSubtitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
        lineNumber: 55,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
      lineNumber: 53,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        className: "w-full",
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          form.handleSubmit();
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "newPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.resetPassword.newPassword") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 70,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLock, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
                lineNumber: 72,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  value: field.state.value ?? "",
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value),
                  autoComplete: "new-password",
                  className: "pl-9"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
                  lineNumber: 73,
                  columnNumber: 10
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 71,
              columnNumber: 9
            }, this),
            field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 83,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 69,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 67,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "confirmNewPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.resetPassword.confirmNewPassword") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 91,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLock, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
                lineNumber: 93,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  value: field.state.value ?? "",
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value),
                  autoComplete: "new-password",
                  className: "pl-9"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
                  lineNumber: 94,
                  columnNumber: 10
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 92,
              columnNumber: 9
            }, this),
            field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 104,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 90,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 88,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { disabled: !canSubmit, type: "submit", className: "w-full mt-2", size: "lg", children: [
            isSubmitting && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
              lineNumber: 112,
              columnNumber: 26
            }, this),
            t("auth.resetPassword.resetSubmit")
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 111,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
            lineNumber: 109,
            columnNumber: 6
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
          lineNumber: 66,
          columnNumber: 5
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
        lineNumber: 58,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-6 text-center text-sm text-muted-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/sign-in", className: "text-primary hover:underline font-medium", children: t("auth.resetPassword.backToSignIn") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
      lineNumber: 121,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
      lineNumber: 120,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AuthFooter, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
      lineNumber: 126,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordForm/index.tsx",
    lineNumber: 52,
    columnNumber: 3
  }, this);
}
const requestSchema = object({
  email: email({ message: "INVALID_EMAIL" })
});
function RequestPasswordResetForm({ className, ...props }) {
  const { t } = useTranslation();
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onChange: requestSchema },
    onSubmit: async (form2) => {
      const result = requestSchema.safeParse(form2.value);
      if (!result.success) return;
      const { error } = await auth$2.requestPasswordReset({
        email: result.data.email,
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) {
        handleApiError(error);
        return;
      }
      toast.success(t("auth.resetPassword.requestSuccess"), {
        description: t("auth.resetPassword.requestSuccessDescription")
      });
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col w-full", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 mb-8 text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-3xl font-semibold text-foreground", children: t("auth.resetPassword.requestTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
        lineNumber: 48,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("auth.resetPassword.requestSubtitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
        lineNumber: 49,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
      lineNumber: 47,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        className: "w-full",
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          form.handleSubmit();
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "email", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.resetPassword.email") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
              lineNumber: 64,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconMail, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
                lineNumber: 66,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "email",
                  value: field.state.value ?? "",
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value),
                  autoComplete: "email",
                  className: "pl-9"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
                  lineNumber: 67,
                  columnNumber: 10
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
              lineNumber: 65,
              columnNumber: 9
            }, this),
            field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
              lineNumber: 77,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
            lineNumber: 63,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
            lineNumber: 61,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { disabled: !canSubmit, type: "submit", className: "w-full mt-2", size: "lg", children: [
            isSubmitting && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
              lineNumber: 85,
              columnNumber: 26
            }, this),
            t("auth.resetPassword.requestSubmit")
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
            lineNumber: 84,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
            lineNumber: 82,
            columnNumber: 6
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
          lineNumber: 60,
          columnNumber: 5
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
        lineNumber: 52,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-6 text-center text-sm text-muted-foreground", children: [
      t("auth.resetPassword.rememberPassword"),
      " ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/sign-in", className: "text-primary hover:underline font-medium", children: t("auth.signIn.submit") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
        lineNumber: 95,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
      lineNumber: 93,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AuthFooter, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
      lineNumber: 100,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/RequestPasswordResetForm/index.tsx",
    lineNumber: 46,
    columnNumber: 3
  }, this);
}
function ResetPasswordSidebar({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("aside", { className: cn("hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-8 lg:p-12", className), ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/70 text-sm text-right mt-auto", children: "© 2026 Medscall" }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordSidebar/index.tsx",
    lineNumber: 7,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/-components/ResetPasswordSidebar/index.tsx",
    lineNumber: 6,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    token
  } = Route$2.useSearch();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "w-full h-full flex min-h-screen", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex-1 flex flex-col items-center justify-center py-8 px-8 lg:px-16 xl:px-24 2xl:px-36 bg-background overflow-y-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full max-w-md", children: token ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ResetPasswordForm, { token }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 47
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(RequestPasswordResetForm, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 85
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
      lineNumber: 8,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ResetPasswordSidebar, { className: "w-full lg:w-13/24" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
      lineNumber: 11,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/reset-password/index.tsx?tsr-split=component",
    lineNumber: 7,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
