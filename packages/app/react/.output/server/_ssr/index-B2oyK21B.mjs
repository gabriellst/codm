import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { b as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { d as Route$4, B as Button, c as cn, a as auth$2, h as handleApiError } from "./router-GQ4JltwW.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { F as FieldGroup, a as Field, b as FieldLabel, I as Input, c as FieldError } from "./input-rdFGzFZO.mjs";
import { S as Spinner } from "./spinner-C0Bce5in.mjs";
import { A as AuthFooter } from "./index-Bit3HRpz.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { b as IconUser, c as IconMail, d as IconLock, e as IconRefresh, f as IconCheck } from "../_libs/tabler__icons-react.mjs";
import { C as CheckboxRoot, e as CheckboxIndicator } from "../_libs/base-ui__react.mjs";
import { o as object, b as boolean, s as string, e as email } from "../_libs/zod.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/better-auth__core.mjs";
import "../_libs/defu.mjs";
import "../_libs/better-fetch__fetch.mjs";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/nanostores.mjs";
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
const checkboxBg = "gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_2%)_0%,color-mix(in_oklab,var(--background),var(--foreground)_75%)_700%]";
const checkboxBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0)_100%]";
const checkboxCheckedBg = "data-checked:gradient-bg-[var(--primary),var(--primary)]";
const checkboxCheckedBorder = "data-checked:gradient-border-[oklch(from_var(--primary-foreground)_l_c_h_/_0.25)_0%,oklch(from_var(--primary-foreground)_l_c_h_/_0.08)_100%]";
const Checkbox = reactExports.forwardRef(function Checkbox2({ className, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    CheckboxRoot,
    {
      ref,
      "data-slot": "checkbox",
      className: cn(
        "gradient-box",
        checkboxBg,
        checkboxBorder,
        checkboxCheckedBg,
        checkboxCheckedBorder,
        "cursor-pointer flex size-5 items-center justify-center rounded-sm data-checked:text-primary-foreground focus-visible:ring-ring/50 focus-visible:ring-[0.1875rem] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-[0.1875rem] peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50 group-has-disabled/field:opacity-50",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        CheckboxIndicator,
        {
          "data-slot": "checkbox-indicator",
          className: "[&>svg]:size-3.5 grid place-content-center text-current transition-none",
          children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCheck, {}, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/checkbox.tsx",
            lineNumber: 37,
            columnNumber: 5
          }, this)
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/checkbox.tsx",
          lineNumber: 33,
          columnNumber: 4
        },
        this
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/checkbox.tsx",
      lineNumber: 19,
      columnNumber: 3
    },
    this
  );
});
const signUpSchema = object({
  name: string().min(2, { message: "INVALID_NAME" }),
  email: email({ message: "INVALID_EMAIL" }),
  password: string().min(8, { message: "PASSWORD_TOO_SHORT" }).max(64, { message: "PASSWORD_TOO_LONG" }),
  confirmPassword: string().min(8).max(64),
  termsAndConditions: boolean().refine((v) => v === true, { message: "TERMS_REQUIRED" })
}).refine((d) => d.password === d.confirmPassword, { message: "PASSWORDS_DONT_MATCH", path: ["confirmPassword"] });
function SignUpForm({ className, callback, email: prefilledEmail, ...props }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const defaultValues = {
    name: "",
    email: prefilledEmail ?? "",
    password: "",
    confirmPassword: "",
    termsAndConditions: false
  };
  const form = useForm({
    defaultValues,
    validators: { onChange: signUpSchema },
    onSubmit: async (form2) => {
      const result = signUpSchema.safeParse(form2.value);
      if (!result.success) return;
      const safeCallback = callback?.startsWith("/") && !callback.startsWith("//") ? callback : "/dashboard";
      const { error } = await auth$2.signUp.email({
        name: result.data.name,
        email: result.data.email,
        password: result.data.password,
        callbackURL: safeCallback,
        fetchOptions: {
          body: {
            ...result.data
          }
        }
      });
      if (error) {
        handleApiError(error);
        return;
      }
      toast.success(t("auth.signUp.registerSuccess"));
      await navigate({ to: safeCallback });
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col w-full", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 mb-6 text-center", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-2xl font-semibold text-foreground", children: t("auth.signUp.title") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
        lineNumber: 78,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("auth.signUp.subtitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
        lineNumber: 79,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
      lineNumber: 77,
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
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "name", children: (field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signUp.name") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 96,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconUser, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                  lineNumber: 98,
                  columnNumber: 11
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Input,
                  {
                    id: field.name,
                    type: "text",
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid,
                    autoComplete: "name",
                    className: "pl-9"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 99,
                    columnNumber: 11
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 97,
                columnNumber: 10
              }, this),
              isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 110,
                columnNumber: 24
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 95,
              columnNumber: 9
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 91,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "email", children: (field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signUp.email") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 121,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconMail, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                  lineNumber: 123,
                  columnNumber: 11
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Input,
                  {
                    type: "email",
                    id: field.name,
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid,
                    autoComplete: "email",
                    className: "pl-9",
                    readOnly: !!prefilledEmail
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 124,
                    columnNumber: 11
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 122,
                columnNumber: 10
              }, this),
              isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 136,
                columnNumber: 24
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 120,
              columnNumber: 9
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 116,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "password", children: (field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signUp.password") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 147,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconLock, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                  lineNumber: 149,
                  columnNumber: 11
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Input,
                  {
                    type: "password",
                    id: field.name,
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid,
                    autoComplete: "new-password",
                    className: "pl-9"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 150,
                    columnNumber: 11
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 148,
                columnNumber: 10
              }, this),
              isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 161,
                columnNumber: 24
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 146,
              columnNumber: 9
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 142,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "confirmPassword", children: (field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("auth.signUp.confirmPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 172,
                columnNumber: 10
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "relative", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconRefresh, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                  lineNumber: 174,
                  columnNumber: 11
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Input,
                  {
                    type: "password",
                    id: field.name,
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid,
                    autoComplete: "new-password",
                    className: "pl-9"
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 175,
                    columnNumber: 11
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 173,
                columnNumber: 10
              }, this),
              isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 186,
                columnNumber: 24
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 171,
              columnNumber: 9
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 167,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "termsAndConditions", children: (field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-2", children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Checkbox,
                  {
                    id: field.name,
                    checked: field.state.value,
                    onCheckedChange: (checked) => field.handleChange(checked === true),
                    onBlur: field.handleBlur,
                    "aria-invalid": isInvalid
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 198,
                    columnNumber: 11
                  },
                  this
                ),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  FieldLabel,
                  {
                    htmlFor: field.name,
                    className: "text-xs text-muted-foreground/70 cursor-pointer leading-relaxed font-normal",
                    children: t("auth.signUp.terms")
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                    lineNumber: 205,
                    columnNumber: 11
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 197,
                columnNumber: 10
              }, this),
              isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
                lineNumber: 212,
                columnNumber: 24
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 196,
              columnNumber: 9
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 192,
            columnNumber: 6
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: !canSubmit, className: "w-full mt-2", size: "lg", children: [
            isSubmitting && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
              lineNumber: 221,
              columnNumber: 26
            }, this),
            t("auth.signUp.submit")
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 220,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
            lineNumber: 218,
            columnNumber: 6
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
          lineNumber: 90,
          columnNumber: 5
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
        lineNumber: 82,
        columnNumber: 4
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mt-6 text-center text-sm text-muted-foreground", children: [
      t("auth.signUp.hasAccount"),
      " ",
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/sign-in", className: "text-primary hover:underline font-medium", children: t("auth.signUp.signInLink") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
        lineNumber: 231,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
      lineNumber: 229,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AuthFooter, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
      lineNumber: 236,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpForm/index.tsx",
    lineNumber: 76,
    columnNumber: 3
  }, this);
}
function SignUpSidebar({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("aside", { className: cn("hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-8 lg:p-12", className), ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "text-white/70 text-sm text-right mt-auto", children: "© 2026 Medscall" }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpSidebar/index.tsx",
    lineNumber: 7,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/-components/SignUpSidebar/index.tsx",
    lineNumber: 6,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    callback,
    email: email2
  } = Route$4.useSearch();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "w-full h-full flex min-h-screen", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex-1 flex flex-col items-center justify-center py-8 px-8 lg:px-16 xl:px-24 2xl:px-36 bg-background overflow-y-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "w-full max-w-2xl", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SignUpForm, { callback, email: email2 }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/index.tsx?tsr-split=component",
      lineNumber: 11,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/index.tsx?tsr-split=component",
      lineNumber: 10,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SignUpSidebar, { className: "w-full lg:w-13/24" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/index.tsx?tsr-split=component",
      lineNumber: 14,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/sign-up/index.tsx?tsr-split=component",
    lineNumber: 8,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};
