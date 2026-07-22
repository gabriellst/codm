import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription, f as DialogFooter } from "./dialog-CDhCxi7G.mjs";
import { B as Button } from "./router-NNnLbzcz.mjs";
import { S as Spinner } from "./spinner-BF9CKMGy.mjs";
import { c as create } from "../_libs/zustand.mjs";
function ConfirmDialog({
  title,
  description,
  actionLabel = "Confirmar",
  cancelLabel = "Cancelar",
  pendingLabel,
  isPending = false,
  variant = "default",
  onConfirm,
  onCancel
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { showCloseButton: false, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: title }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
        lineNumber: 31,
        columnNumber: 5
      }, this),
      description && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: description }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
        lineNumber: 32,
        columnNumber: 21
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
      lineNumber: 30,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogFooter, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "outline", onClick: onCancel, disabled: isPending, children: cancelLabel }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
        lineNumber: 35,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant, onClick: onConfirm, disabled: isPending, children: [
        isPending && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
          lineNumber: 39,
          columnNumber: 20
        }, this),
        isPending && pendingLabel ? pendingLabel : actionLabel
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
        lineNumber: 38,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
      lineNumber: 34,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/confirm-dialog.tsx",
    lineNumber: 29,
    columnNumber: 3
  }, this);
}
const CLOSE_ANIMATION_MS = 250;
const useDialogStore = create((set) => ({
  content: null,
  open: false,
  show: (content) => set({ content, open: true }),
  hide: () => {
    set({ open: false });
    setTimeout(() => {
      if (!useDialogStore.getState().open) {
        set({ content: null });
      }
    }, CLOSE_ANIMATION_MS);
  },
  confirm: (options) => new Promise((resolve) => {
    const close = (result) => {
      resolve(result);
      set({ open: false });
      setTimeout(() => {
        if (!useDialogStore.getState().open) {
          set({ content: null });
        }
      }, CLOSE_ANIMATION_MS);
    };
    set({
      open: true,
      content: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        ConfirmDialog,
        {
          title: options.title,
          description: options.description,
          actionLabel: options.actionLabel,
          cancelLabel: options.cancelLabel,
          variant: options.variant,
          onConfirm: () => close(true),
          onCancel: () => close(false)
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/stores/useDialogStore.tsx",
          lineNumber: 54,
          columnNumber: 6
        },
        void 0
      )
    });
  })
}));
export {
  useDialogStore as u
};
