import { r as reactExports, j as jsxRuntimeExports } from "./react.mjs";
import { m as mergeObjects, f as formatErrorMessage, u as useIsoLayoutEffect, a as useStableCallback, E as EMPTY_OBJECT, b as useMergedRefs, c as useMergedRefsN, g as getReactElementRef, d as useId, e as android, j as jsdom, v as voiceOver, w as webkit, h as visuallyHidden, o as ownerDocument, N as NOOP, i as mergeCleanups, k as addEventListener, l as useRefWithInit, n as useValueAsRef, p as useTimeout, q as useAnimationFrame, T as Timeout, R as ReactStore, r as createSelector, A as AnimationFrame, s as useOnFirstRender, t as useOnMount, x as inertValue, y as useScrollLock, z as ios, B as useEnhancedClickHandler, C as useControlled } from "./base-ui__utils.mjs";
import { r as reactDomExports } from "./react-dom.mjs";
import { a as isHTMLElement, b as isShadowRoot, c as isElement, d as getComputedStyle$1, e as getNodeName, f as isNode, g as getWindow, h as isLastTraversableNode, j as getParentNode, k as evaluate, l as getPaddingObject, m as getAlignmentAxis, n as getAlignment, o as getAxisLength, p as clamp, q as getSide, r as getSideAxis } from "./floating-ui__utils.mjs";
import { u as useFloating$1, h as hide$1, f as flip, s as size, o as offset, a as shift, l as limitShift } from "./floating-ui__react-dom.mjs";
import { a as autoUpdate } from "./floating-ui__dom.mjs";
const EMPTY_PROPS = {};
function mergeProps(a, b, c, d, e) {
  if (!c && !d && true && !a) {
    return createInitialMergedProps(b);
  }
  let merged = createInitialMergedProps(a);
  if (b) {
    merged = mergeInto(merged, b);
  }
  if (c) {
    merged = mergeInto(merged, c);
  }
  if (d) {
    merged = mergeInto(merged, d);
  }
  return merged;
}
function mergePropsN(props) {
  if (props.length === 0) {
    return EMPTY_PROPS;
  }
  if (props.length === 1) {
    return createInitialMergedProps(props[0]);
  }
  let merged = createInitialMergedProps(props[0]);
  for (let i = 1; i < props.length; i += 1) {
    merged = mergeInto(merged, props[i]);
  }
  return merged;
}
function createInitialMergedProps(inputProps) {
  if (isPropsGetter(inputProps)) {
    return {
      ...resolvePropsGetter(inputProps, EMPTY_PROPS)
    };
  }
  return copyInitialProps(inputProps);
}
function mergeInto(merged, inputProps) {
  if (isPropsGetter(inputProps)) {
    return resolvePropsGetter(inputProps, merged);
  }
  return mutablyMergeInto(merged, inputProps);
}
function copyInitialProps(inputProps) {
  const copiedProps = {
    ...inputProps
  };
  for (const propName in copiedProps) {
    const propValue = copiedProps[propName];
    if (isEventHandler(propName, propValue)) {
      copiedProps[propName] = wrapEventHandler(propValue);
    }
  }
  return copiedProps;
}
function mutablyMergeInto(mergedProps, externalProps) {
  if (!externalProps) {
    return mergedProps;
  }
  for (const propName in externalProps) {
    const externalPropValue = externalProps[propName];
    switch (propName) {
      case "style": {
        mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
        break;
      }
      case "className": {
        mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
        break;
      }
      default: {
        if (isEventHandler(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }
  return mergedProps;
}
function isEventHandler(key, value) {
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return code0 === 111 && code1 === 110 && code2 >= 65 && code2 <= 90 && (typeof value === "function" || typeof value === "undefined");
}
function isPropsGetter(inputProps) {
  return typeof inputProps === "function";
}
function resolvePropsGetter(inputProps, previousProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(previousProps);
  }
  return inputProps ?? EMPTY_PROPS;
}
function mergeEventHandlers(ourHandler, theirHandler) {
  if (!theirHandler) {
    return ourHandler;
  }
  if (!ourHandler) {
    return wrapEventHandler(theirHandler);
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      const baseUIEvent = event;
      makeEventPreventable(baseUIEvent);
      const result2 = theirHandler(...args);
      if (!baseUIEvent.baseUIHandlerPrevented) {
        ourHandler?.(...args);
      }
      return result2;
    }
    const result = theirHandler(...args);
    ourHandler?.(...args);
    return result;
  };
}
function wrapEventHandler(handler) {
  if (!handler) {
    return handler;
  }
  return (...args) => {
    const event = args[0];
    if (isSyntheticEvent(event)) {
      makeEventPreventable(event);
    }
    return handler(...args);
  };
}
function makeEventPreventable(event) {
  event.preventBaseUIHandler = () => {
    event.baseUIHandlerPrevented = true;
  };
  return event;
}
function mergeClassNames(ourClassName, theirClassName) {
  if (theirClassName) {
    if (ourClassName) {
      return theirClassName + " " + ourClassName;
    }
    return theirClassName;
  }
  return ourClassName;
}
function isSyntheticEvent(event) {
  return event != null && typeof event === "object" && "nativeEvent" in event;
}
const CompositeRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useCompositeRootContext(optional = false) {
  const context = reactExports.useContext(CompositeRootContext);
  if (context === void 0 && !optional) {
    throw new Error(formatErrorMessage(16));
  }
  return context;
}
function useFocusableWhenDisabled(parameters) {
  const {
    focusableWhenDisabled,
    disabled,
    composite = false,
    tabIndex: tabIndexProp = 0,
    isNativeButton
  } = parameters;
  const isFocusableComposite = composite && focusableWhenDisabled !== false;
  const isNonFocusableComposite = composite && focusableWhenDisabled === false;
  const props = reactExports.useMemo(() => {
    const additionalProps = {
      // allow Tabbing away from focusableWhenDisabled elements
      onKeyDown(event) {
        if (disabled && focusableWhenDisabled && event.key !== "Tab") {
          event.preventDefault();
        }
      }
    };
    if (!composite) {
      additionalProps.tabIndex = tabIndexProp;
      if (!isNativeButton && disabled) {
        additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
      }
    }
    if (isNativeButton && (focusableWhenDisabled || isFocusableComposite) || !isNativeButton && disabled) {
      additionalProps["aria-disabled"] = disabled;
    }
    if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
      additionalProps.disabled = disabled;
    }
    return additionalProps;
  }, [composite, disabled, focusableWhenDisabled, isFocusableComposite, isNonFocusableComposite, isNativeButton, tabIndexProp]);
  return {
    props
  };
}
function useButton(parameters = {}) {
  const {
    disabled = false,
    focusableWhenDisabled,
    tabIndex = 0,
    native: isNativeButton = true,
    composite: compositeProp
  } = parameters;
  const elementRef = reactExports.useRef(null);
  const compositeRootContext = useCompositeRootContext(true);
  const isCompositeItem = compositeProp ?? compositeRootContext !== void 0;
  const {
    props: focusableWhenDisabledProps
  } = useFocusableWhenDisabled({
    focusableWhenDisabled,
    disabled,
    composite: isCompositeItem,
    tabIndex,
    isNativeButton
  });
  const updateDisabled = reactExports.useCallback(() => {
    const element = elementRef.current;
    if (!isButtonElement(element)) {
      return;
    }
    if (isCompositeItem && disabled && focusableWhenDisabledProps.disabled === void 0 && element.disabled) {
      element.disabled = false;
    }
  }, [disabled, focusableWhenDisabledProps.disabled, isCompositeItem]);
  useIsoLayoutEffect(updateDisabled, [updateDisabled]);
  const getButtonProps = reactExports.useCallback((externalProps = {}) => {
    const {
      onClick: externalOnClick,
      onMouseDown: externalOnMouseDown,
      onKeyUp: externalOnKeyUp,
      onKeyDown: externalOnKeyDown,
      onPointerDown: externalOnPointerDown,
      ...otherExternalProps
    } = externalProps;
    return mergeProps({
      onClick(event) {
        if (disabled) {
          event.preventDefault();
          return;
        }
        externalOnClick?.(event);
      },
      onMouseDown(event) {
        if (!disabled) {
          externalOnMouseDown?.(event);
        }
      },
      onKeyDown(event) {
        if (disabled) {
          return;
        }
        makeEventPreventable(event);
        externalOnKeyDown?.(event);
        if (event.baseUIHandlerPrevented) {
          return;
        }
        const isCurrentTarget = event.target === event.currentTarget;
        const currentTarget = event.currentTarget;
        const isButton = isButtonElement(currentTarget);
        const isLink = !isNativeButton && isValidLinkElement(currentTarget);
        const shouldClick = isCurrentTarget && (isNativeButton ? isButton : !isLink);
        const isEnterKey = event.key === "Enter";
        const isSpaceKey = event.key === " ";
        const role = currentTarget.getAttribute("role");
        const isTextNavigationRole = role?.startsWith("menuitem") || role === "option" || role === "gridcell";
        if (isCurrentTarget && isCompositeItem && isSpaceKey) {
          if (event.defaultPrevented && isTextNavigationRole) {
            return;
          }
          event.preventDefault();
          if (isLink || isNativeButton && isButton) {
            currentTarget.click();
            event.preventBaseUIHandler();
          } else if (shouldClick) {
            externalOnClick?.(event);
            event.preventBaseUIHandler();
          }
          return;
        }
        if (shouldClick) {
          if (!isNativeButton && (isSpaceKey || isEnterKey)) {
            event.preventDefault();
          }
          if (!isNativeButton && isEnterKey) {
            externalOnClick?.(event);
          }
        }
      },
      onKeyUp(event) {
        if (disabled) {
          return;
        }
        makeEventPreventable(event);
        externalOnKeyUp?.(event);
        if (event.target === event.currentTarget && isNativeButton && isCompositeItem && isButtonElement(event.currentTarget) && event.key === " ") {
          event.preventDefault();
          return;
        }
        if (event.baseUIHandlerPrevented) {
          return;
        }
        if (event.target === event.currentTarget && !isNativeButton && !isCompositeItem && event.key === " ") {
          externalOnClick?.(event);
        }
      },
      onPointerDown(event) {
        if (disabled) {
          event.preventDefault();
          return;
        }
        externalOnPointerDown?.(event);
      }
    }, isNativeButton ? {
      type: "button"
    } : {
      role: "button"
    }, focusableWhenDisabledProps, otherExternalProps);
  }, [disabled, focusableWhenDisabledProps, isCompositeItem, isNativeButton]);
  const buttonRef = useStableCallback((element) => {
    elementRef.current = element;
    updateDisabled();
  });
  return {
    getButtonProps,
    buttonRef
  };
}
function isButtonElement(elem) {
  return isHTMLElement(elem) && elem.tagName === "BUTTON";
}
function isValidLinkElement(elem) {
  return Boolean(elem?.tagName === "A" && elem?.href);
}
function getStateAttributesProps(state, customMapping) {
  const props = {};
  for (const key in state) {
    const value = state[key];
    if (customMapping?.hasOwnProperty(key)) {
      const customProps = customMapping[key](value);
      if (customProps != null) {
        Object.assign(props, customProps);
      }
      continue;
    }
    if (value === true) {
      props[`data-${key.toLowerCase()}`] = "";
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = value.toString();
    }
  }
  return props;
}
function resolveClassName(className, state) {
  return typeof className === "function" ? className(state) : className;
}
function resolveStyle(style, state) {
  return typeof style === "function" ? style(state) : style;
}
function useRenderElement(element, componentProps, params = {}) {
  const renderProp = componentProps.render;
  const outProps = useRenderElementProps(componentProps, params);
  if (params.enabled === false) {
    return null;
  }
  const state = params.state ?? EMPTY_OBJECT;
  return evaluateRenderProp(element, renderProp, outProps, state);
}
function useRenderElementProps(componentProps, params = {}) {
  const {
    className: classNameProp,
    style: styleProp,
    render: renderProp
  } = componentProps;
  const {
    state = EMPTY_OBJECT,
    ref,
    props,
    stateAttributesMapping: stateAttributesMapping2,
    enabled = true
  } = params;
  const className = enabled ? resolveClassName(classNameProp, state) : void 0;
  const style = enabled ? resolveStyle(styleProp, state) : void 0;
  const stateProps = enabled ? getStateAttributesProps(state, stateAttributesMapping2) : EMPTY_OBJECT;
  const resolvedProps = enabled && props ? resolveRenderFunctionProps(props) : void 0;
  const outProps = enabled ? mergeObjects(stateProps, resolvedProps) ?? {} : EMPTY_OBJECT;
  if (typeof document !== "undefined") {
    if (!enabled) {
      useMergedRefs(null, null);
    } else if (Array.isArray(ref)) {
      outProps.ref = useMergedRefsN([outProps.ref, getReactElementRef(renderProp), ...ref]);
    } else {
      outProps.ref = useMergedRefs(outProps.ref, getReactElementRef(renderProp), ref);
    }
  }
  if (!enabled) {
    return EMPTY_OBJECT;
  }
  if (className !== void 0) {
    outProps.className = mergeClassNames(outProps.className, className);
  }
  if (style !== void 0) {
    outProps.style = mergeObjects(outProps.style, style);
  }
  return outProps;
}
function resolveRenderFunctionProps(props) {
  if (Array.isArray(props)) {
    return mergePropsN(props);
  }
  return mergeProps(void 0, props);
}
const REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
function evaluateRenderProp(element, render, props, state) {
  if (render) {
    if (typeof render === "function") {
      return render(props, state);
    }
    const mergedProps = mergeProps(props, render.props);
    mergedProps.ref = props.ref;
    let newElement = render;
    if (newElement?.$$typeof === REACT_LAZY_TYPE) {
      const children = reactExports.Children.toArray(render);
      newElement = children[0];
    }
    return /* @__PURE__ */ reactExports.cloneElement(newElement, mergedProps);
  }
  if (element) {
    if (typeof element === "string") {
      return renderTag(element, props);
    }
  }
  throw new Error(formatErrorMessage(8));
}
function renderTag(Tag, props) {
  if (Tag === "button") {
    return /* @__PURE__ */ reactExports.createElement("button", {
      type: "button",
      ...props,
      key: props.key
    });
  }
  if (Tag === "img") {
    return /* @__PURE__ */ reactExports.createElement("img", {
      alt: "",
      ...props,
      key: props.key
    });
  }
  return /* @__PURE__ */ reactExports.createElement(Tag, props);
}
const Button = /* @__PURE__ */ reactExports.forwardRef(function Button2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled = false,
    focusableWhenDisabled = false,
    nativeButton = true,
    style,
    ...elementProps
  } = componentProps;
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    focusableWhenDisabled,
    native: nativeButton
  });
  const state = {
    disabled
  };
  return useRenderElement("button", componentProps, {
    state,
    ref: [forwardedRef, buttonRef],
    props: [elementProps, getButtonProps]
  });
});
const IsDrawerContext = /* @__PURE__ */ reactExports.createContext(false);
const DialogRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDialogRootContext(optional) {
  const dialogRootContext = reactExports.useContext(DialogRootContext);
  if (optional === false && dialogRootContext === void 0) {
    throw new Error(formatErrorMessage(27));
  }
  return dialogRootContext;
}
let TransitionStatusDataAttributes = /* @__PURE__ */ (function(TransitionStatusDataAttributes2) {
  TransitionStatusDataAttributes2["startingStyle"] = "data-starting-style";
  TransitionStatusDataAttributes2["endingStyle"] = "data-ending-style";
  return TransitionStatusDataAttributes2;
})({});
const STARTING_HOOK = {
  [TransitionStatusDataAttributes.startingStyle]: ""
};
const ENDING_HOOK = {
  [TransitionStatusDataAttributes.endingStyle]: ""
};
const transitionStatusMapping = {
  transitionStatus(value) {
    if (value === "starting") {
      return STARTING_HOOK;
    }
    if (value === "ending") {
      return ENDING_HOOK;
    }
    return null;
  }
};
let CommonPopupDataAttributes = (function(CommonPopupDataAttributes2) {
  CommonPopupDataAttributes2["open"] = "data-open";
  CommonPopupDataAttributes2["closed"] = "data-closed";
  CommonPopupDataAttributes2[CommonPopupDataAttributes2["startingStyle"] = TransitionStatusDataAttributes.startingStyle] = "startingStyle";
  CommonPopupDataAttributes2[CommonPopupDataAttributes2["endingStyle"] = TransitionStatusDataAttributes.endingStyle] = "endingStyle";
  CommonPopupDataAttributes2["anchorHidden"] = "data-anchor-hidden";
  CommonPopupDataAttributes2["side"] = "data-side";
  CommonPopupDataAttributes2["align"] = "data-align";
  return CommonPopupDataAttributes2;
})({});
let CommonTriggerDataAttributes = /* @__PURE__ */ (function(CommonTriggerDataAttributes2) {
  CommonTriggerDataAttributes2["popupOpen"] = "data-popup-open";
  CommonTriggerDataAttributes2["pressed"] = "data-pressed";
  return CommonTriggerDataAttributes2;
})({});
const TRIGGER_HOOK = {
  [CommonTriggerDataAttributes.popupOpen]: ""
};
const PRESSABLE_TRIGGER_HOOK = {
  [CommonTriggerDataAttributes.popupOpen]: "",
  [CommonTriggerDataAttributes.pressed]: ""
};
const POPUP_OPEN_HOOK = {
  [CommonPopupDataAttributes.open]: ""
};
const POPUP_CLOSED_HOOK = {
  [CommonPopupDataAttributes.closed]: ""
};
const ANCHOR_HIDDEN_HOOK = {
  [CommonPopupDataAttributes.anchorHidden]: ""
};
const triggerOpenStateMapping = {
  open(value) {
    if (value) {
      return TRIGGER_HOOK;
    }
    return null;
  }
};
const pressableTriggerOpenStateMapping = {
  open(value) {
    if (value) {
      return PRESSABLE_TRIGGER_HOOK;
    }
    return null;
  }
};
const popupStateMapping = {
  open(value) {
    if (value) {
      return POPUP_OPEN_HOOK;
    }
    return POPUP_CLOSED_HOOK;
  },
  anchorHidden(value) {
    if (value) {
      return ANCHOR_HIDDEN_HOOK;
    }
    return null;
  }
};
const stateAttributesMapping$3 = {
  ...popupStateMapping,
  ...transitionStatusMapping
};
const DialogBackdrop = /* @__PURE__ */ reactExports.forwardRef(function DialogBackdrop2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    forceRender = false,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const open = store.useState("open");
  const nested = store.useState("nested");
  const mounted = store.useState("mounted");
  const transitionStatus = store.useState("transitionStatus");
  const state = {
    open,
    transitionStatus
  };
  return useRenderElement("div", componentProps, {
    state,
    ref: [store.context.backdropRef, forwardedRef],
    stateAttributesMapping: stateAttributesMapping$3,
    props: [{
      role: "presentation",
      hidden: !mounted,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, elementProps],
    enabled: forceRender || !nested
  });
});
const none = "none";
const triggerPress = "trigger-press";
const triggerHover = "trigger-hover";
const outsidePress = "outside-press";
const closePress = "close-press";
const focusOut = "focus-out";
const escapeKey = "escape-key";
const imperativeAction = "imperative-action";
function createChangeEventDetails(reason, event, trigger, customProperties) {
  let canceled = false;
  let allowPropagation = false;
  const custom = EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    cancel() {
      canceled = true;
    },
    allowPropagation() {
      allowPropagation = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return allowPropagation;
    },
    trigger,
    ...custom
  };
  return details;
}
const DialogClose = /* @__PURE__ */ reactExports.forwardRef(function DialogClose2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const open = store.useState("open");
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const state = {
    disabled
  };
  function handleClick(event) {
    if (open) {
      store.setOpen(false, createChangeEventDetails(closePress, event.nativeEvent));
    }
  }
  return useRenderElement("button", componentProps, {
    state,
    ref: [forwardedRef, buttonRef],
    props: [{
      onClick: handleClick
    }, elementProps, getButtonProps]
  });
});
function useBaseUiId(idOverride) {
  return useId(idOverride, "base-ui");
}
const DialogDescription = /* @__PURE__ */ reactExports.forwardRef(function DialogDescription2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const id = useBaseUiId(idProp);
  store.useSyncedValueWithCleanup("descriptionElementId", id);
  return useRenderElement("p", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
});
function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
function isReactEvent(event) {
  return "nativeEvent" in event;
}
function isVirtualClick(event) {
  if (event.pointerType === "" && event.isTrusted) {
    return true;
  }
  if (android && event.pointerType) {
    return event.type === "click" && event.buttons === 1;
  }
  return event.detail === 0 && !event.pointerType;
}
function isVirtualPointerEvent(event) {
  if (jsdom) {
    return false;
  }
  return !android && event.width === 0 && event.height === 0 || android && event.width === 1 && event.height === 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch";
}
function isMouseLikePointerType(pointerType, strict) {
  const values = ["mouse", "pen"];
  if (!strict) {
    values.push("", void 0);
  }
  return values.includes(pointerType);
}
function isClickLikeEvent(event) {
  const type = event.type;
  return type === "click" || type === "mousedown" || type === "keydown" || type === "keyup";
}
const FOCUSABLE_ATTRIBUTE = "data-base-ui-focusable";
const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
function activeElement(doc) {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement != null) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode?.();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && isShadowRoot(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0];
  }
  return event.target;
}
function isTargetInsideEnabledTrigger(target, triggerElements) {
  if (!isElement(target)) {
    return false;
  }
  const targetElement = target;
  if (triggerElements.hasElement(targetElement)) {
    return !targetElement.hasAttribute("data-trigger-disabled");
  }
  for (const [, trigger] of triggerElements.entries()) {
    if (contains(trigger, targetElement)) {
      return !trigger.hasAttribute("data-trigger-disabled");
    }
  }
  return false;
}
function isEventTargetWithin(event, node) {
  if (node == null) {
    return false;
  }
  if ("composedPath" in event) {
    return event.composedPath().includes(node);
  }
  const eventAgain = event;
  return eventAgain.target != null && node.contains(eventAgain.target);
}
function isRootElement(element) {
  return element.matches("html,body");
}
function isTypeableElement(element) {
  return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}
function isInteractiveElement(element) {
  return element?.closest(`button,a[href],[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`) != null;
}
function isTypeableCombobox(element) {
  if (!element) {
    return false;
  }
  return element.getAttribute("role") === "combobox" && isTypeableElement(element);
}
function getFloatingFocusElement(floatingElement) {
  if (!floatingElement) {
    return null;
  }
  return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE) ? floatingElement : floatingElement.querySelector(`[${FOCUSABLE_ATTRIBUTE}]`) || floatingElement;
}
function resolveValue(value, pointerType) {
  if (pointerType != null && !isMouseLikePointerType(pointerType)) {
    return 0;
  }
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function getDelay(value, prop, pointerType) {
  const result = resolveValue(value, pointerType);
  if (typeof result === "number") {
    return result;
  }
  return result?.[prop];
}
function getRestMs(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function isClickLikeOpenEvent(openEventType, interactedInside) {
  return interactedInside || openEventType === "click" || openEventType === "mousedown";
}
function isHoverOpenEvent(openEventType) {
  return openEventType?.includes("mouse") && openEventType !== "mousedown";
}
const FocusGuard = /* @__PURE__ */ reactExports.forwardRef(function FocusGuard2(props, ref) {
  const [role, setRole] = reactExports.useState();
  useIsoLayoutEffect(() => {
    if (voiceOver && webkit) {
      setRole("button");
    }
  }, []);
  const restProps = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
    ...props,
    ref,
    style: visuallyHidden,
    "aria-hidden": role ? void 0 : true,
    ...restProps,
    "data-base-ui-focus-guard": ""
  });
});
function isHiddenByStyles(styles) {
  return styles.visibility === "hidden" || styles.visibility === "collapse";
}
function isElementVisible(element, styles = element ? getComputedStyle$1(element) : null) {
  if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) {
    return false;
  }
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility();
  }
  return styles.display !== "none" && styles.display !== "contents";
}
const CANDIDATE_SELECTOR = 'a[href],button,input,select,textarea,summary,details,iframe,object,embed,[tabindex],[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
function getParentElement(element) {
  const assignedSlot = element.assignedSlot;
  if (assignedSlot) {
    return assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const rootNode = element.getRootNode();
  return isShadowRoot(rootNode) ? rootNode.host : null;
}
function getDetailsSummary(details) {
  for (const child of Array.from(details.children)) {
    if (getNodeName(child) === "summary") {
      return child;
    }
  }
  return null;
}
function isWithinOpenDetailsSummary(element, details) {
  const summary = getDetailsSummary(details);
  return !!summary && (element === summary || contains(summary, element));
}
function isFocusableCandidate(element) {
  const nodeName = element ? getNodeName(element) : "";
  return element != null && element.matches(CANDIDATE_SELECTOR) && (nodeName !== "summary" || element.parentElement != null && getNodeName(element.parentElement) === "details" && getDetailsSummary(element.parentElement) === element) && (nodeName !== "details" || getDetailsSummary(element) == null) && (nodeName !== "input" || element.type !== "hidden");
}
function isFocusableElement(element) {
  if (!isFocusableCandidate(element) || !element.isConnected || element.matches(":disabled")) {
    return false;
  }
  for (let current = element; current; current = getParentElement(current)) {
    const isAncestor = current !== element;
    const isSlot = getNodeName(current) === "slot";
    if (current.hasAttribute("inert")) {
      return false;
    }
    if (isAncestor && getNodeName(current) === "details" && !current.open && !isWithinOpenDetailsSummary(element, current) || current.hasAttribute("hidden") || !isSlot && !isVisibleInTabbableTree(current, isAncestor)) {
      return false;
    }
  }
  return true;
}
function isVisibleInTabbableTree(element, isAncestor) {
  const styles = getComputedStyle$1(element);
  if (!isAncestor) {
    return isElementVisible(element, styles);
  }
  return styles.display !== "none";
}
function getTabIndex(element) {
  const tabIndex = element.tabIndex;
  if (tabIndex < 0) {
    const nodeName = getNodeName(element);
    if (nodeName === "details" || nodeName === "audio" || nodeName === "video" || isHTMLElement(element) && element.isContentEditable) {
      return 0;
    }
  }
  return tabIndex;
}
function getNamedRadioInput(element) {
  if (getNodeName(element) !== "input") {
    return null;
  }
  const input = element;
  return input.type === "radio" && input.name !== "" ? input : null;
}
function isTabbableRadio(element, candidates) {
  const input = getNamedRadioInput(element);
  if (!input) {
    return true;
  }
  const checkedRadio = candidates.find((candidate) => {
    const radio = getNamedRadioInput(candidate);
    return radio?.name === input.name && radio.form === input.form && radio.checked;
  });
  if (checkedRadio) {
    return checkedRadio === input;
  }
  return candidates.find((candidate) => {
    const radio = getNamedRadioInput(candidate);
    return radio?.name === input.name && radio.form === input.form;
  }) === input;
}
function getComposedChildren(container) {
  if (isHTMLElement(container) && getNodeName(container) === "slot") {
    const assignedElements = container.assignedElements({
      flatten: true
    });
    if (assignedElements.length > 0) {
      return assignedElements;
    }
  }
  if (isHTMLElement(container) && container.shadowRoot) {
    return Array.from(container.shadowRoot.children);
  }
  return Array.from(container.children);
}
function appendCandidates(container, list) {
  getComposedChildren(container).forEach((child) => {
    if (isFocusableCandidate(child)) {
      list.push(child);
    }
    appendCandidates(child, list);
  });
}
function appendMatchingElements(container, selector, list) {
  getComposedChildren(container).forEach((child) => {
    if (isHTMLElement(child) && child.matches(selector)) {
      list.push(child);
    }
    appendMatchingElements(child, selector, list);
  });
}
function isTabbable(element) {
  return isFocusableElement(element) && getTabIndex(element) >= 0;
}
function focusable(container) {
  const candidates = [];
  appendCandidates(container, candidates);
  return candidates.filter(isFocusableElement);
}
function tabbable(container) {
  const candidates = focusable(container);
  return candidates.filter((element) => getTabIndex(element) >= 0 && isTabbableRadio(element, candidates));
}
function getTabbableIn(container, dir) {
  const list = tabbable(container);
  const len = list.length;
  if (len === 0) {
    return void 0;
  }
  const active = activeElement(ownerDocument(container));
  const index = list.indexOf(active);
  const nextIndex = index === -1 ? dir === 1 ? 0 : len - 1 : index + dir;
  return list[nextIndex];
}
function getNextTabbable(referenceElement) {
  return getTabbableIn(ownerDocument(referenceElement).body, 1) || referenceElement;
}
function getPreviousTabbable(referenceElement) {
  return getTabbableIn(ownerDocument(referenceElement).body, -1) || referenceElement;
}
function getTabbableNearElement(referenceElement, dir) {
  if (!referenceElement) {
    return null;
  }
  const list = tabbable(ownerDocument(referenceElement).body);
  const elementCount = list.length;
  if (elementCount === 0) {
    return null;
  }
  const index = list.indexOf(referenceElement);
  if (index === -1) {
    return null;
  }
  const nextIndex = (index + dir + elementCount) % elementCount;
  return list[nextIndex];
}
function getTabbableAfterElement(referenceElement) {
  return getTabbableNearElement(referenceElement, 1);
}
function getTabbableBeforeElement(referenceElement) {
  return getTabbableNearElement(referenceElement, -1);
}
function isOutsideEvent(event, container) {
  const containerElement = container || event.currentTarget;
  const relatedTarget = event.relatedTarget;
  return !relatedTarget || !contains(containerElement, relatedTarget);
}
function disableFocusInside(container) {
  const tabbableElements = tabbable(container);
  tabbableElements.forEach((element) => {
    element.dataset.tabindex = element.getAttribute("tabindex") || "";
    element.setAttribute("tabindex", "-1");
  });
}
function enableFocusInside(container) {
  const elements = [];
  appendMatchingElements(container, "[data-tabindex]", elements);
  elements.forEach((element) => {
    const tabindex = element.dataset.tabindex;
    delete element.dataset.tabindex;
    if (tabindex) {
      element.setAttribute("tabindex", tabindex);
    } else {
      element.removeAttribute("tabindex");
    }
  });
}
function getNodeChildren(nodes, id, onlyOpenChildren = true) {
  const directChildren = nodes.filter((node) => node.parentId === id);
  return directChildren.flatMap((child) => [...!onlyOpenChildren || child.context?.open ? [child] : [], ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
}
function getNodeAncestors(nodes, id) {
  let allAncestors = [];
  let currentParentId = nodes.find((node) => node.id === id)?.parentId;
  while (currentParentId) {
    const currentNode = nodes.find((node) => node.id === currentParentId);
    currentParentId = currentNode?.parentId;
    if (currentNode) {
      allAncestors = allAncestors.concat(currentNode);
    }
  }
  return allAncestors;
}
function createAttribute(name) {
  return `data-base-ui-${name}`;
}
let rafId = 0;
function enqueueFocus(el, options = {}) {
  const {
    preventScroll = false,
    sync = false,
    shouldFocus
  } = options;
  cancelAnimationFrame(rafId);
  function exec() {
    if (shouldFocus && !shouldFocus()) {
      return;
    }
    el?.focus({
      preventScroll
    });
  }
  if (sync) {
    exec();
    return NOOP;
  }
  const currentRafId = requestAnimationFrame(exec);
  rafId = currentRafId;
  return () => {
    if (rafId === currentRafId) {
      cancelAnimationFrame(currentRafId);
      rafId = 0;
    }
  };
}
const counters = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap()
};
const markerName = "data-base-ui-inert";
const uncontrolledElementsSets = {
  inert: /* @__PURE__ */ new WeakSet(),
  "aria-hidden": /* @__PURE__ */ new WeakSet()
};
let markerCounterMap = /* @__PURE__ */ new WeakMap();
let lockCount = 0;
function getUncontrolledElementsSet(controlAttribute) {
  return uncontrolledElementsSets[controlAttribute];
}
function unwrapHost(node) {
  if (!node) {
    return null;
  }
  return isShadowRoot(node) ? node.host : unwrapHost(node.parentNode);
}
const correctElements = (parent, targets) => targets.map((target) => {
  if (parent.contains(target)) {
    return target;
  }
  const correctedTarget = unwrapHost(target);
  if (parent.contains(correctedTarget)) {
    return correctedTarget;
  }
  return null;
}).filter((x) => x != null);
const buildKeepSet = (targets) => {
  const keep = /* @__PURE__ */ new Set();
  targets.forEach((target) => {
    let node = target;
    while (node && !keep.has(node)) {
      keep.add(node);
      node = node.parentNode;
    }
  });
  return keep;
};
const collectOutsideElements = (root, keepElements, stopElements) => {
  const outside = [];
  const walk = (parent) => {
    if (!parent || stopElements.has(parent)) {
      return;
    }
    Array.from(parent.children).forEach((node) => {
      if (getNodeName(node) === "script") {
        return;
      }
      if (keepElements.has(node)) {
        walk(node);
      } else {
        outside.push(node);
      }
    });
  };
  walk(root);
  return outside;
};
function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, inert, {
  mark = true
}) {
  let controlAttribute = null;
  if (inert) {
    controlAttribute = "inert";
  } else if (ariaHidden) {
    controlAttribute = "aria-hidden";
  }
  let counterMap = null;
  let uncontrolledElementsSet = null;
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const markerTargets = mark ? collectOutsideElements(body, buildKeepSet(avoidElements), new Set(avoidElements)) : [];
  const hiddenElements = [];
  const markedElements = [];
  if (controlAttribute) {
    const map = counters[controlAttribute];
    const currentUncontrolledElementsSet = getUncontrolledElementsSet(controlAttribute);
    uncontrolledElementsSet = currentUncontrolledElementsSet;
    counterMap = map;
    const ariaLiveElements = correctElements(body, Array.from(body.querySelectorAll("[aria-live]")));
    const controlElements = avoidElements.concat(ariaLiveElements);
    const controlTargets = collectOutsideElements(body, buildKeepSet(controlElements), new Set(controlElements));
    controlTargets.forEach((node) => {
      const attr2 = node.getAttribute(controlAttribute);
      const alreadyHidden = attr2 !== null && attr2 !== "false";
      const counterValue = (map.get(node) || 0) + 1;
      map.set(node, counterValue);
      hiddenElements.push(node);
      if (counterValue === 1 && alreadyHidden) {
        currentUncontrolledElementsSet.add(node);
      }
      if (!alreadyHidden) {
        node.setAttribute(controlAttribute, controlAttribute === "inert" ? "" : "true");
      }
    });
  }
  if (mark) {
    markerTargets.forEach((node) => {
      const markerValue = (markerCounterMap.get(node) || 0) + 1;
      markerCounterMap.set(node, markerValue);
      markedElements.push(node);
      if (markerValue === 1) {
        node.setAttribute(markerName, "");
      }
    });
  }
  lockCount += 1;
  return () => {
    if (counterMap) {
      hiddenElements.forEach((element) => {
        const currentCounterValue = counterMap.get(element) || 0;
        const counterValue = currentCounterValue - 1;
        counterMap.set(element, counterValue);
        if (!counterValue) {
          if (!uncontrolledElementsSet?.has(element) && controlAttribute) {
            element.removeAttribute(controlAttribute);
          }
          uncontrolledElementsSet?.delete(element);
        }
      });
    }
    if (mark) {
      markedElements.forEach((element) => {
        const markerValue = (markerCounterMap.get(element) || 0) - 1;
        markerCounterMap.set(element, markerValue);
        if (!markerValue) {
          element.removeAttribute(markerName);
        }
      });
    }
    lockCount -= 1;
    if (!lockCount) {
      counters.inert = /* @__PURE__ */ new WeakMap();
      counters["aria-hidden"] = /* @__PURE__ */ new WeakMap();
      uncontrolledElementsSets.inert = /* @__PURE__ */ new WeakSet();
      uncontrolledElementsSets["aria-hidden"] = /* @__PURE__ */ new WeakSet();
      markerCounterMap = /* @__PURE__ */ new WeakMap();
    }
  };
}
function markOthers(avoidElements, options = {}) {
  const {
    ariaHidden = false,
    inert = false,
    mark = true
  } = options;
  const body = ownerDocument(avoidElements[0]).body;
  return applyAttributeToOthers(avoidElements, body, ariaHidden, inert, {
    mark
  });
}
const PATIENT_CLICK_THRESHOLD = 500;
const DISABLED_TRANSITIONS_STYLE = {
  style: {
    transition: "none"
  }
};
const CLICK_TRIGGER_IDENTIFIER = "data-base-ui-click-trigger";
const POPUP_COLLISION_AVOIDANCE = {
  fallbackAxisSide: "end"
};
const ownerVisuallyHidden = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
};
const PortalContext = /* @__PURE__ */ reactExports.createContext(null);
const usePortalContext = () => reactExports.useContext(PortalContext);
const attr = createAttribute("portal");
function useFloatingPortalNode(props = {}) {
  const {
    ref,
    container: containerProp,
    componentProps = EMPTY_OBJECT,
    elementProps
  } = props;
  const uniqueId = useId();
  const portalContext = usePortalContext();
  const parentPortalNode = portalContext?.portalNode;
  const [containerElement, setContainerElement] = reactExports.useState(null);
  const [portalNode, setPortalNode] = reactExports.useState(null);
  const setPortalNodeRef = useStableCallback((node) => {
    if (node !== null) {
      setPortalNode(node);
    }
  });
  const containerRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (containerProp === null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    if (uniqueId == null) {
      return;
    }
    const resolvedContainer = (containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ?? parentPortalNode ?? document.body;
    if (resolvedContainer == null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    if (containerRef.current !== resolvedContainer) {
      containerRef.current = resolvedContainer;
      setPortalNode(null);
      setContainerElement(resolvedContainer);
    }
  }, [containerProp, parentPortalNode, uniqueId]);
  const portalElement = useRenderElement("div", componentProps, {
    ref: [ref, setPortalNodeRef],
    props: [{
      id: uniqueId,
      [attr]: ""
    }, elementProps]
  });
  const portalSubtree = containerElement && portalElement ? /* @__PURE__ */ reactDomExports.createPortal(portalElement, containerElement) : null;
  return {
    portalNode,
    portalSubtree
  };
}
const FloatingPortal = /* @__PURE__ */ reactExports.forwardRef(function FloatingPortal2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    children,
    container,
    renderGuards,
    ...elementProps
  } = componentProps;
  const {
    portalNode,
    portalSubtree
  } = useFloatingPortalNode({
    container,
    ref: forwardedRef,
    componentProps,
    elementProps
  });
  const beforeOutsideRef = reactExports.useRef(null);
  const afterOutsideRef = reactExports.useRef(null);
  const beforeInsideRef = reactExports.useRef(null);
  const afterInsideRef = reactExports.useRef(null);
  const [focusManagerState, setFocusManagerState] = reactExports.useState(null);
  const focusInsideDisabledRef = reactExports.useRef(false);
  const modal = focusManagerState?.modal;
  const open = focusManagerState?.open;
  const shouldRenderGuards = typeof renderGuards === "boolean" ? renderGuards : !!focusManagerState && !focusManagerState.modal && focusManagerState.open && !!portalNode;
  reactExports.useEffect(() => {
    if (!portalNode || modal) {
      return void 0;
    }
    function onFocus(event) {
      if (portalNode && event.relatedTarget && isOutsideEvent(event)) {
        if (event.type === "focusin") {
          if (focusInsideDisabledRef.current) {
            enableFocusInside(portalNode);
            focusInsideDisabledRef.current = false;
          }
        } else {
          disableFocusInside(portalNode);
          focusInsideDisabledRef.current = true;
        }
      }
    }
    return mergeCleanups(addEventListener(portalNode, "focusin", onFocus, true), addEventListener(portalNode, "focusout", onFocus, true));
  }, [portalNode, modal]);
  useIsoLayoutEffect(() => {
    if (!portalNode || open !== true || !focusInsideDisabledRef.current) {
      return;
    }
    enableFocusInside(portalNode);
    focusInsideDisabledRef.current = false;
  }, [open, portalNode]);
  const portalContextValue = reactExports.useMemo(() => ({
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
    portalNode,
    setFocusManagerState
  }), [portalNode]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
    children: [portalSubtree, /* @__PURE__ */ jsxRuntimeExports.jsxs(PortalContext.Provider, {
      value: portalContextValue,
      children: [shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        "data-type": "outside",
        ref: beforeOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            beforeInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          }
        }
      }), shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
        "aria-owns": portalNode.id,
        style: ownerVisuallyHidden
      }), portalNode && /* @__PURE__ */ reactDomExports.createPortal(children, portalNode), shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        "data-type": "outside",
        ref: afterOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            afterInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
            if (focusManagerState?.closeOnFocusOut) {
              focusManagerState?.onOpenChange(false, createChangeEventDetails(focusOut, event.nativeEvent));
            }
          }
        }
      })]
    })]
  });
});
function createEventEmitter() {
  const map = /* @__PURE__ */ new Map();
  return {
    emit(event, data) {
      map.get(event)?.forEach((listener) => listener(data));
    },
    on(event, listener) {
      if (!map.has(event)) {
        map.set(event, /* @__PURE__ */ new Set());
      }
      map.get(event).add(listener);
    },
    off(event, listener) {
      map.get(event)?.delete(listener);
    }
  };
}
class FloatingTreeStore {
  nodesRef = {
    current: []
  };
  events = createEventEmitter();
  addNode(node) {
    this.nodesRef.current.push(node);
  }
  removeNode(node) {
    const index = this.nodesRef.current.findIndex((n) => n === node);
    if (index !== -1) {
      this.nodesRef.current.splice(index, 1);
    }
  }
}
const FloatingNodeContext = /* @__PURE__ */ reactExports.createContext(null);
const FloatingTreeContext = /* @__PURE__ */ reactExports.createContext(null);
const useFloatingParentNodeId = () => reactExports.useContext(FloatingNodeContext)?.id || null;
const useFloatingTree = (externalTree) => {
  const contextTree = reactExports.useContext(FloatingTreeContext);
  return externalTree ?? contextTree;
};
function useFloatingNodeId(externalTree) {
  const id = useId();
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();
  useIsoLayoutEffect(() => {
    if (!id) {
      return void 0;
    }
    const node = {
      id,
      parentId
    };
    tree?.addNode(node);
    return () => {
      tree?.removeNode(node);
    };
  }, [tree, id, parentId]);
  return id;
}
function FloatingNode(props) {
  const {
    children,
    id
  } = props;
  const parentId = useFloatingParentNodeId();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingNodeContext.Provider, {
    value: reactExports.useMemo(() => ({
      id,
      parentId
    }), [id, parentId]),
    children
  });
}
function FloatingTree(props) {
  const {
    children,
    externalTree
  } = props;
  const tree = useRefWithInit(() => externalTree ?? new FloatingTreeStore()).current;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingTreeContext.Provider, {
    value: tree,
    children
  });
}
function resolveRef(maybeRef) {
  if (maybeRef == null) {
    return maybeRef;
  }
  return "current" in maybeRef ? maybeRef.current : maybeRef;
}
function getEventType(event, lastInteractionType) {
  const win = getWindow(getTarget(event));
  if (event instanceof win.KeyboardEvent) {
    return "keyboard";
  }
  if (event instanceof win.FocusEvent) {
    return lastInteractionType || "keyboard";
  }
  if ("pointerType" in event) {
    return event.pointerType || "keyboard";
  }
  if ("touches" in event) {
    return "touch";
  }
  if (event instanceof win.MouseEvent) {
    return lastInteractionType || (event.detail === 0 ? "keyboard" : "mouse");
  }
  return "";
}
const LIST_LIMIT = 20;
let previouslyFocusedElements = [];
function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter((entry) => {
    return entry.deref()?.isConnected;
  });
}
function addPreviouslyFocusedElement(element) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== "body") {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}
function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}
function getFirstTabbableElement(container) {
  if (!container) {
    return null;
  }
  if (isTabbable(container)) {
    return container;
  }
  return tabbable(container)[0] || container;
}
function handleTabIndex(floatingFocusElement) {
  if (floatingFocusElement.hasAttribute("tabindex") && !floatingFocusElement.hasAttribute("data-tabindex")) {
    return;
  }
  if (!floatingFocusElement.getAttribute("role")?.includes("dialog")) {
    return;
  }
  const focusableElements = focusable(floatingFocusElement);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute("data-tabindex") || "";
    return isTabbable(element) || element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-");
  });
  const tabIndex = floatingFocusElement.getAttribute("tabindex");
  if (tabbableContent.length === 0) {
    if (tabIndex !== "0") {
      floatingFocusElement.setAttribute("tabindex", "0");
      floatingFocusElement.setAttribute("data-tabindex", "0");
    }
  } else if (tabIndex !== "-1" || floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1") {
    floatingFocusElement.setAttribute("tabindex", "-1");
    floatingFocusElement.setAttribute("data-tabindex", "-1");
  }
}
function FloatingFocusManager(props) {
  const {
    context,
    children,
    disabled = false,
    initialFocus = true,
    returnFocus = true,
    restoreFocus = false,
    modal = true,
    closeOnFocusOut = true,
    openInteractionType = "",
    nextFocusableElement,
    previousFocusableElement,
    beforeContentFocusGuardRef,
    externalTree,
    getInsideElements
  } = props;
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const domReference = store.useState("domReferenceElement");
  const floating = store.useState("floatingElement");
  const {
    events,
    dataRef
  } = store.context;
  const getNodeId = useStableCallback(() => dataRef.current.floatingContext?.nodeId);
  const ignoreInitialFocus = initialFocus === false;
  const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;
  const initialFocusRef = useValueAsRef(initialFocus);
  const returnFocusRef = useValueAsRef(returnFocus);
  const openInteractionTypeRef = useValueAsRef(openInteractionType);
  const openRef = useValueAsRef(open);
  const tree = useFloatingTree(externalTree);
  const portalContext = usePortalContext();
  const preventReturnFocusRef = reactExports.useRef(false);
  const isPointerDownRef = reactExports.useRef(false);
  const pointerDownOutsideRef = reactExports.useRef(false);
  const lastFocusedTabbableRef = reactExports.useRef(null);
  const closeTypeRef = reactExports.useRef("");
  const lastInteractionTypeRef = reactExports.useRef("");
  const beforeGuardRef = reactExports.useRef(null);
  const afterGuardRef = reactExports.useRef(null);
  const mergedBeforeGuardRef = useMergedRefs(beforeGuardRef, beforeContentFocusGuardRef, portalContext?.beforeInsideRef);
  const mergedAfterGuardRef = useMergedRefs(afterGuardRef, portalContext?.afterInsideRef);
  const blurTimeout = useTimeout();
  const pointerDownTimeout = useTimeout();
  const restoreFocusFrame = useAnimationFrame();
  const isInsidePortal = portalContext != null;
  const floatingFocusElement = getFloatingFocusElement(floating);
  const getTabbableContent = useStableCallback((container = floatingFocusElement) => {
    return container ? tabbable(container) : [];
  });
  const getResolvedInsideElements = useStableCallback(() => getInsideElements?.().filter((element) => element != null) ?? []);
  reactExports.useEffect(() => {
    if (disabled || !modal) {
      return void 0;
    }
    function onKeyDown(event) {
      if (event.key === "Tab") {
        if (contains(floatingFocusElement, activeElement(ownerDocument(floatingFocusElement))) && getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) {
          stopEvent(event);
        }
      }
    }
    const doc = ownerDocument(floatingFocusElement);
    return addEventListener(doc, "keydown", onKeyDown);
  }, [disabled, floatingFocusElement, modal, isUntrappedTypeableCombobox, getTabbableContent]);
  reactExports.useEffect(() => {
    if (disabled || !open) {
      return void 0;
    }
    const doc = ownerDocument(floatingFocusElement);
    function clearPointerDownOutside() {
      pointerDownOutsideRef.current = false;
    }
    function onPointerDown(event) {
      const target = getTarget(event);
      const insideElements = getResolvedInsideElements();
      const pointerTargetInside = contains(floating, target) || contains(domReference, target) || contains(portalContext?.portalNode, target) || insideElements.some((element) => element === target || contains(element, target));
      pointerDownOutsideRef.current = !pointerTargetInside;
      lastInteractionTypeRef.current = event.pointerType || "keyboard";
      if (target?.closest(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
        isPointerDownRef.current = true;
        pointerDownTimeout.start(0, () => {
          isPointerDownRef.current = false;
        });
      }
    }
    function onKeyDown() {
      lastInteractionTypeRef.current = "keyboard";
    }
    return mergeCleanups(
      addEventListener(doc, "pointerdown", onPointerDown, true),
      addEventListener(doc, "pointerup", clearPointerDownOutside, true),
      addEventListener(doc, "pointercancel", clearPointerDownOutside, true),
      addEventListener(doc, "keydown", onKeyDown, true),
      // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
      // if the popup dismissed between pointerdown and pointerup.
      clearPointerDownOutside
    );
  }, [disabled, floating, domReference, floatingFocusElement, open, portalContext, pointerDownTimeout, getResolvedInsideElements]);
  reactExports.useEffect(() => {
    if (disabled || !closeOnFocusOut) {
      return void 0;
    }
    const doc = ownerDocument(floatingFocusElement);
    function handlePointerDown() {
      isPointerDownRef.current = true;
      pointerDownTimeout.start(0, () => {
        isPointerDownRef.current = false;
      });
    }
    function handleFocusIn(event) {
      const target = getTarget(event);
      if (isTabbable(target)) {
        lastFocusedTabbableRef.current = target;
      }
    }
    function handleFocusOutside(event) {
      const relatedTarget = event.relatedTarget;
      const currentTarget = event.currentTarget;
      const target = getTarget(event);
      if (modal && relatedTarget == null && target != null && contains(floating, target)) {
        addPreviouslyFocusedElement(target);
      }
      queueMicrotask(() => {
        const nodeId = getNodeId();
        const triggers = store.context.triggerElements;
        const insideElements = getResolvedInsideElements();
        const isRelatedFocusGuard = relatedTarget?.hasAttribute(createAttribute("focus-guard")) && [beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeInsideRef.current, portalContext?.afterInsideRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement)].includes(relatedTarget);
        const movedToUnrelatedNode = !(contains(domReference, relatedTarget) || contains(floating, relatedTarget) || contains(relatedTarget, floating) || contains(portalContext?.portalNode, relatedTarget) || insideElements.some((element) => element === relatedTarget || contains(element, relatedTarget)) || relatedTarget != null && triggers.hasElement(relatedTarget) || triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) || isRelatedFocusGuard || tree && (getNodeChildren(tree.nodesRef.current, nodeId).find((node) => contains(node.context?.elements.floating, relatedTarget) || contains(node.context?.elements.domReference, relatedTarget)) || getNodeAncestors(tree.nodesRef.current, nodeId).find((node) => [node.context?.elements.floating, getFloatingFocusElement(node.context?.elements.floating)].includes(relatedTarget) || node.context?.elements.domReference === relatedTarget)));
        if (currentTarget === domReference && floatingFocusElement) {
          handleTabIndex(floatingFocusElement);
        }
        if (restoreFocus && currentTarget !== domReference && !isElementVisible(target) && activeElement(doc) === doc.body) {
          if (isHTMLElement(floatingFocusElement)) {
            floatingFocusElement.focus();
            if (restoreFocus === "popup") {
              restoreFocusFrame.request(() => {
                floatingFocusElement.focus();
              });
              return;
            }
          }
          const tabbableContent = getTabbableContent();
          const prevTabbable = lastFocusedTabbableRef.current;
          const nodeToFocus = (prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) || tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
          if (isHTMLElement(nodeToFocus)) {
            nodeToFocus.focus();
          }
        }
        if (dataRef.current.insideReactTree) {
          dataRef.current.insideReactTree = false;
          return;
        }
        if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDownRef.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())) {
          preventReturnFocusRef.current = true;
          store.setOpen(false, createChangeEventDetails(focusOut, event));
        }
      });
    }
    function markInsideReactTree() {
      if (pointerDownOutsideRef.current) {
        return;
      }
      dataRef.current.insideReactTree = true;
      blurTimeout.start(0, () => {
        dataRef.current.insideReactTree = false;
      });
    }
    const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
    if (!floating && !domReferenceElement) {
      return void 0;
    }
    return mergeCleanups(domReferenceElement && addEventListener(domReferenceElement, "focusout", handleFocusOutside), domReferenceElement && addEventListener(domReferenceElement, "pointerdown", handlePointerDown), floating && addEventListener(floating, "focusin", handleFocusIn), floating && addEventListener(floating, "focusout", handleFocusOutside), floating && portalContext && addEventListener(floating, "focusout", markInsideReactTree, true));
  }, [disabled, domReference, floating, floatingFocusElement, modal, tree, portalContext, store, closeOnFocusOut, restoreFocus, getTabbableContent, isUntrappedTypeableCombobox, getNodeId, dataRef, blurTimeout, pointerDownTimeout, restoreFocusFrame, nextFocusableElement, previousFocusableElement, getResolvedInsideElements]);
  reactExports.useEffect(() => {
    if (disabled || !floating || !open) {
      return void 0;
    }
    const portalNodes = Array.from(portalContext?.portalNode?.querySelectorAll(`[${createAttribute("portal")}]`) || []);
    const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
    const rootAncestorComboboxDomReference = ancestors.find((node) => isTypeableCombobox(node.context?.elements.domReference || null))?.context?.elements.domReference;
    const controlInsideElements = [floating, ...portalNodes, beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, ...getResolvedInsideElements()];
    const insideElements = [...controlInsideElements, rootAncestorComboboxDomReference, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement), isUntrappedTypeableCombobox ? domReference : null].filter((x) => x != null);
    const ariaHiddenCleanup = markOthers(insideElements, {
      ariaHidden: modal || isUntrappedTypeableCombobox,
      mark: false
    });
    const markerInsideElements = [floating, ...portalNodes].filter((x) => x != null);
    const markerCleanup = markOthers(markerInsideElements);
    return () => {
      markerCleanup();
      ariaHiddenCleanup();
    };
  }, [open, disabled, domReference, floating, modal, portalContext, isUntrappedTypeableCombobox, tree, getNodeId, nextFocusableElement, previousFocusableElement, getResolvedInsideElements]);
  useIsoLayoutEffect(() => {
    if (!open || disabled || !isHTMLElement(floatingFocusElement)) {
      return;
    }
    const doc = ownerDocument(floatingFocusElement);
    const previouslyFocusedElement = activeElement(doc);
    queueMicrotask(() => {
      const initialFocusValueOrFn = initialFocusRef.current;
      const resolvedInitialFocus = typeof initialFocusValueOrFn === "function" ? initialFocusValueOrFn(openInteractionTypeRef.current || "") : initialFocusValueOrFn;
      if (resolvedInitialFocus === void 0 || resolvedInitialFocus === false) {
        return;
      }
      const focusAlreadyInsideFloatingEl = contains(floatingFocusElement, previouslyFocusedElement);
      if (focusAlreadyInsideFloatingEl) {
        return;
      }
      let focusableElements = null;
      const getDefaultFocusElement = () => {
        if (focusableElements == null) {
          focusableElements = getTabbableContent(floatingFocusElement);
        }
        return focusableElements[0] || floatingFocusElement;
      };
      let elToFocus;
      if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
        elToFocus = getDefaultFocusElement();
      } else {
        elToFocus = resolveRef(resolvedInitialFocus);
      }
      elToFocus = elToFocus || getDefaultFocusElement();
      const hadFocusInside = contains(floatingFocusElement, activeElement(doc));
      enqueueFocus(elToFocus, {
        preventScroll: elToFocus === floatingFocusElement,
        shouldFocus() {
          if (!openRef.current) {
            return false;
          }
          if (hadFocusInside) {
            return true;
          }
          const currentActiveElement = activeElement(doc);
          const focusMovedInside = currentActiveElement !== elToFocus && contains(floatingFocusElement, currentActiveElement);
          return !focusMovedInside;
        }
      });
    });
  }, [disabled, open, floatingFocusElement, getTabbableContent, initialFocusRef, openInteractionTypeRef, openRef]);
  useIsoLayoutEffect(() => {
    if (disabled || !floatingFocusElement) {
      return void 0;
    }
    const doc = ownerDocument(floatingFocusElement);
    const elementFocusedBeforeOpen = activeElement(doc);
    const preferPreviousFocus = openInteractionTypeRef.current == null;
    addPreviouslyFocusedElement(elementFocusedBeforeOpen);
    function onOpenChangeLocal(details) {
      if (!details.open) {
        closeTypeRef.current = getEventType(details.nativeEvent, lastInteractionTypeRef.current);
      }
      if (details.reason === triggerHover && details.nativeEvent.type === "mouseleave") {
        preventReturnFocusRef.current = true;
      }
      if (details.reason !== outsidePress) {
        return;
      }
      if (details.nested) {
        preventReturnFocusRef.current = false;
      } else if (isVirtualClick(details.nativeEvent) || isVirtualPointerEvent(details.nativeEvent)) {
        preventReturnFocusRef.current = false;
      } else {
        let isPreventScrollSupported = false;
        ownerDocument(floatingFocusElement).createElement("div").focus({
          get preventScroll() {
            isPreventScrollSupported = true;
            return false;
          }
        });
        if (isPreventScrollSupported) {
          preventReturnFocusRef.current = false;
        } else {
          preventReturnFocusRef.current = true;
        }
      }
    }
    events.on("openchange", onOpenChangeLocal);
    function getReturnElement() {
      const returnFocusValueOrFn = returnFocusRef.current;
      let resolvedReturnFocusValue = typeof returnFocusValueOrFn === "function" ? returnFocusValueOrFn(closeTypeRef.current) : returnFocusValueOrFn;
      if (resolvedReturnFocusValue === void 0 || resolvedReturnFocusValue === false) {
        return null;
      }
      if (resolvedReturnFocusValue === null) {
        resolvedReturnFocusValue = true;
      }
      const referenceReturnElement = domReference?.isConnected ? domReference : null;
      const previousReturnElement = elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== "body" ? elementFocusedBeforeOpen : null;
      let defaultReturnElement = preferPreviousFocus ? previousReturnElement || referenceReturnElement : referenceReturnElement || previousReturnElement;
      if (!defaultReturnElement) {
        defaultReturnElement = getPreviouslyFocusedElement() || null;
      }
      if (typeof resolvedReturnFocusValue === "boolean") {
        return defaultReturnElement;
      }
      return resolveRef(resolvedReturnFocusValue) || defaultReturnElement || null;
    }
    return () => {
      events.off("openchange", onOpenChangeLocal);
      const activeEl = activeElement(doc);
      const insideElements = getResolvedInsideElements();
      const isFocusInsideFloatingTree = contains(floating, activeEl) || insideElements.some((element) => element === activeEl || contains(element, activeEl)) || tree && getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) => contains(node.context?.elements.floating, activeEl));
      const returnFocusValueOrFn = returnFocusRef.current;
      const returnElement = getReturnElement();
      queueMicrotask(() => {
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        const hasExplicitReturnFocus = typeof returnFocusValueOrFn !== "boolean";
        if (returnFocusValueOrFn && !preventReturnFocusRef.current && isHTMLElement(tabbableReturnElement) && // If the focus moved somewhere else after mount, avoid returning focus
        // since it likely entered a different element which should be
        // respected: https://github.com/floating-ui/floating-ui/issues/2607
        (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)) {
          tabbableReturnElement.focus({
            preventScroll: true
          });
        }
        preventReturnFocusRef.current = false;
      });
    };
  }, [disabled, floating, floatingFocusElement, returnFocusRef, openInteractionTypeRef, events, tree, domReference, getNodeId, getResolvedInsideElements]);
  useIsoLayoutEffect(() => {
    if (!webkit || open || !floating) {
      return;
    }
    const activeEl = activeElement(ownerDocument(floating));
    if (!isHTMLElement(activeEl) || !isTypeableElement(activeEl)) {
      return;
    }
    if (contains(floating, activeEl)) {
      activeEl.blur();
    }
  }, [open, floating]);
  useIsoLayoutEffect(() => {
    if (disabled || !portalContext) {
      return void 0;
    }
    portalContext.setFocusManagerState({
      modal,
      closeOnFocusOut,
      open,
      onOpenChange: store.setOpen,
      domReference
    });
    return () => {
      portalContext.setFocusManagerState(null);
    };
  }, [disabled, portalContext, modal, open, store, closeOnFocusOut, domReference]);
  useIsoLayoutEffect(() => {
    if (disabled || !floatingFocusElement) {
      return void 0;
    }
    handleTabIndex(floatingFocusElement);
    return () => {
      queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    };
  }, [disabled, floatingFocusElement]);
  const shouldRenderGuards = !disabled && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
    children: [shouldRenderGuards && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedBeforeGuardRef,
      onFocus: (event) => {
        if (modal) {
          const els = getTabbableContent();
          enqueueFocus(els[els.length - 1]);
        } else if (portalContext?.portalNode) {
          preventReturnFocusRef.current = false;
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
          } else {
            resolveRef(previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
          }
        }
      }
    }), children, shouldRenderGuards && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedAfterGuardRef,
      onFocus: (event) => {
        if (modal) {
          enqueueFocus(getTabbableContent()[0]);
        } else if (portalContext?.portalNode) {
          if (closeOnFocusOut) {
            preventReturnFocusRef.current = true;
          }
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          } else {
            resolveRef(nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
          }
        }
      }
    })]
  });
}
function useClick(context, props = {}) {
  const {
    enabled = true,
    event: eventOption = "click",
    toggle = true,
    ignoreMouse = false,
    stickIfOpen = true,
    touchOpenDelay = 0,
    reason = triggerPress
  } = props;
  const store = "rootStore" in context ? context.rootStore : context;
  const dataRef = store.context.dataRef;
  const pointerTypeRef = reactExports.useRef(void 0);
  const frame = useAnimationFrame();
  const touchOpenTimeout = useTimeout();
  const reference = reactExports.useMemo(() => {
    function setOpenWithTouchDelay(nextOpen, nativeEvent, target, pointerType) {
      const details = createChangeEventDetails(reason, nativeEvent, target);
      if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) {
        touchOpenTimeout.start(touchOpenDelay, () => {
          store.setOpen(true, details);
        });
      } else {
        store.setOpen(nextOpen, details);
      }
    }
    function getNextOpen(open, currentTarget, isClickLikeOpenEvent2) {
      const openEvent = dataRef.current.openEvent;
      const hasClickedOnInactiveTrigger = store.select("domReferenceElement") !== currentTarget;
      if (open && hasClickedOnInactiveTrigger) {
        return true;
      }
      if (!open) {
        return true;
      }
      if (!toggle) {
        return true;
      }
      if (openEvent && stickIfOpen) {
        return !isClickLikeOpenEvent2(openEvent.type);
      }
      return false;
    }
    return {
      onPointerDown(event) {
        pointerTypeRef.current = event.pointerType;
      },
      onMouseDown(event) {
        const pointerType = pointerTypeRef.current;
        const nativeEvent = event.nativeEvent;
        const open = store.select("open");
        if (event.button !== 0 || eventOption === "click" || isMouseLikePointerType(pointerType, true) && ignoreMouse) {
          return;
        }
        const nextOpen = getNextOpen(open, event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown");
        const target = getTarget(nativeEvent);
        if (isTypeableElement(target)) {
          setOpenWithTouchDelay(nextOpen, nativeEvent, target, pointerType);
          return;
        }
        const eventCurrentTarget = event.currentTarget;
        frame.request(() => {
          setOpenWithTouchDelay(nextOpen, nativeEvent, eventCurrentTarget, pointerType);
        });
      },
      onClick(event) {
        if (eventOption === "mousedown-only") {
          return;
        }
        const pointerType = pointerTypeRef.current;
        if (eventOption === "mousedown" && pointerType) {
          pointerTypeRef.current = void 0;
          return;
        }
        if (isMouseLikePointerType(pointerType, true) && ignoreMouse) {
          return;
        }
        const open = store.select("open");
        const nextOpen = getNextOpen(open, event.currentTarget, (openEventType) => openEventType === "click" || openEventType === "mousedown" || openEventType === "keydown" || openEventType === "keyup");
        setOpenWithTouchDelay(nextOpen, event.nativeEvent, event.currentTarget, pointerType);
      },
      onKeyDown() {
        pointerTypeRef.current = void 0;
      }
    };
  }, [dataRef, eventOption, ignoreMouse, reason, store, stickIfOpen, toggle, frame, touchOpenTimeout, touchOpenDelay]);
  return reactExports.useMemo(() => enabled ? {
    reference
  } : EMPTY_OBJECT, [enabled, reference]);
}
function alwaysFalse() {
  return false;
}
function normalizeProp(normalizable) {
  return {
    escapeKey: typeof normalizable === "boolean" ? normalizable : normalizable?.escapeKey ?? false,
    outsidePress: typeof normalizable === "boolean" ? normalizable : normalizable?.outsidePress ?? true
  };
}
function useDismiss(context, props = {}) {
  const {
    enabled = true,
    escapeKey: escapeKey$1 = true,
    outsidePress: outsidePressProp = true,
    outsidePressEvent = "sloppy",
    referencePress = alwaysFalse,
    bubbles,
    externalTree
  } = props;
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const {
    dataRef
  } = store.context;
  const tree = useFloatingTree(externalTree);
  const outsidePressFn = useStableCallback(typeof outsidePressProp === "function" ? outsidePressProp : () => false);
  const outsidePress$1 = typeof outsidePressProp === "function" ? outsidePressFn : outsidePressProp;
  const outsidePressEnabled = outsidePress$1 !== false;
  const getOutsidePressEventProp = useStableCallback(() => outsidePressEvent);
  const {
    escapeKey: escapeKeyBubbles,
    outsidePress: outsidePressBubbles
  } = normalizeProp(bubbles);
  const pressStartedInsideRef = reactExports.useRef(false);
  const pressStartPreventedRef = reactExports.useRef(false);
  const suppressNextOutsideClickRef = reactExports.useRef(false);
  const isComposingRef = reactExports.useRef(false);
  const currentPointerTypeRef = reactExports.useRef("");
  const touchStateRef = reactExports.useRef(null);
  const cancelDismissOnEndTimeout = useTimeout();
  const clearInsideReactTreeTimeout = useTimeout();
  const clearInsideReactTree = useStableCallback(() => {
    clearInsideReactTreeTimeout.clear();
    dataRef.current.insideReactTree = false;
  });
  const hasBlockingChild = useStableCallback((bubbleKey) => {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    return children.some((child) => child.context?.open && !child.context.dataRef.current[bubbleKey]);
  });
  const isEventWithinOwnElements = useStableCallback((event) => {
    return isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"));
  });
  const closeOnReferencePress = useStableCallback((event) => {
    if (!referencePress()) {
      return;
    }
    store.setOpen(false, createChangeEventDetails(triggerPress, event.nativeEvent));
  });
  const closeOnEscapeKeyDown = useStableCallback((event) => {
    if (!open || !enabled || !escapeKey$1 || event.key !== "Escape") {
      return;
    }
    if (isComposingRef.current) {
      return;
    }
    if (!escapeKeyBubbles && hasBlockingChild("__escapeKeyBubbles")) {
      return;
    }
    const native = isReactEvent(event) ? event.nativeEvent : event;
    const eventDetails = createChangeEventDetails(escapeKey, native);
    store.setOpen(false, eventDetails);
    if (!eventDetails.isCanceled) {
      event.preventDefault();
    }
    if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
      event.stopPropagation();
    }
  });
  const markInsideReactTree = useStableCallback(() => {
    dataRef.current.insideReactTree = true;
    clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
  });
  const markPressStartedInsideReactTree = useStableCallback((event) => {
    if (!open || !enabled || event.button !== 0) {
      return;
    }
    const target = getTarget(event.nativeEvent);
    if (!contains(store.select("floatingElement"), target)) {
      return;
    }
    if (!pressStartedInsideRef.current) {
      pressStartedInsideRef.current = true;
      pressStartPreventedRef.current = false;
    }
  });
  const markInsidePressStartPrevented = useStableCallback((event) => {
    if (!open || !enabled) {
      return;
    }
    if (!(event.defaultPrevented || event.nativeEvent.defaultPrevented)) {
      return;
    }
    if (pressStartedInsideRef.current) {
      pressStartPreventedRef.current = true;
    }
  });
  reactExports.useEffect(() => {
    if (!open || !enabled) {
      return void 0;
    }
    dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
    dataRef.current.__outsidePressBubbles = outsidePressBubbles;
    const compositionTimeout = new Timeout();
    const preventedPressSuppressionTimeout = new Timeout();
    function handleCompositionStart() {
      compositionTimeout.clear();
      isComposingRef.current = true;
    }
    function handleCompositionEnd() {
      compositionTimeout.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        webkit ? 5 : 0,
        () => {
          isComposingRef.current = false;
        }
      );
    }
    function suppressImmediateOutsideClickAfterPreventedStart() {
      suppressNextOutsideClickRef.current = true;
      preventedPressSuppressionTimeout.start(0, () => {
        suppressNextOutsideClickRef.current = false;
      });
    }
    function resetPressStartState() {
      pressStartedInsideRef.current = false;
      pressStartPreventedRef.current = false;
    }
    function getOutsidePressEvent() {
      const type = currentPointerTypeRef.current;
      const computedType = type === "pen" || !type ? "mouse" : type;
      const outsidePressEventValue = getOutsidePressEventProp();
      const resolved = typeof outsidePressEventValue === "function" ? outsidePressEventValue() : outsidePressEventValue;
      if (typeof resolved === "string") {
        return resolved;
      }
      return resolved[computedType];
    }
    function shouldIgnoreEvent(event) {
      const computedOutsidePressEvent = getOutsidePressEvent();
      return computedOutsidePressEvent === "intentional" && event.type !== "click" || computedOutsidePressEvent === "sloppy" && event.type === "click";
    }
    function isEventWithinFloatingTree(event) {
      const nodeId = dataRef.current.floatingContext?.nodeId;
      const targetIsInsideChildren = tree && getNodeChildren(tree.nodesRef.current, nodeId).some((node) => isEventTargetWithin(event, node.context?.elements.floating));
      return isEventWithinOwnElements(event) || targetIsInsideChildren;
    }
    function closeOnPressOutside(event) {
      if (shouldIgnoreEvent(event)) {
        if (event.type !== "click" && !isEventWithinOwnElements(event)) {
          preventedPressSuppressionTimeout.clear();
          suppressNextOutsideClickRef.current = false;
        }
        clearInsideReactTree();
        return;
      }
      if (dataRef.current.insideReactTree) {
        clearInsideReactTree();
        return;
      }
      const target = getTarget(event);
      const inertSelector = `[${createAttribute("inert")}]`;
      const targetRoot = isElement(target) ? target.getRootNode() : null;
      const markers = Array.from((isShadowRoot(targetRoot) ? targetRoot : ownerDocument(store.select("floatingElement"))).querySelectorAll(inertSelector));
      const triggers = store.context.triggerElements;
      if (target && (triggers.hasElement(target) || triggers.hasMatchingElement((trigger) => contains(trigger, target)))) {
        return;
      }
      let targetRootAncestor = isElement(target) ? target : null;
      while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
        const nextParent = getParentNode(targetRootAncestor);
        if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
          break;
        }
        targetRootAncestor = nextParent;
      }
      if (markers.length && isElement(target) && !isRootElement(target) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !contains(target, store.select("floatingElement")) && // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      markers.every((marker) => !contains(targetRootAncestor, marker))) {
        return;
      }
      if (isHTMLElement(target) && !("touches" in event)) {
        const lastTraversableNode = isLastTraversableNode(target);
        const style = getComputedStyle$1(target);
        const scrollRe = /auto|scroll/;
        const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
        const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
        const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
        const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
        const isRTL = style.direction === "rtl";
        const pressedVerticalScrollbar = canScrollY && (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
        const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
        if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
          return;
        }
      }
      if (isEventWithinFloatingTree(event)) {
        return;
      }
      if (getOutsidePressEvent() === "intentional" && suppressNextOutsideClickRef.current) {
        preventedPressSuppressionTimeout.clear();
        suppressNextOutsideClickRef.current = false;
        return;
      }
      if (typeof outsidePress$1 === "function" && !outsidePress$1(event)) {
        return;
      }
      if (hasBlockingChild("__outsidePressBubbles")) {
        return;
      }
      store.setOpen(false, createChangeEventDetails(outsidePress, event));
      clearInsideReactTree();
    }
    function handlePointerDown(event) {
      if (getOutsidePressEvent() !== "sloppy" || event.pointerType === "touch" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) {
        return;
      }
      closeOnPressOutside(event);
    }
    function handleTouchStart(event) {
      if (getOutsidePressEvent() !== "sloppy" || !store.select("open") || !enabled || isEventWithinOwnElements(event)) {
        return;
      }
      const touch = event.touches[0];
      if (touch) {
        touchStateRef.current = {
          startTime: Date.now(),
          startX: touch.clientX,
          startY: touch.clientY,
          dismissOnTouchEnd: false,
          dismissOnMouseDown: true
        };
        cancelDismissOnEndTimeout.start(1e3, () => {
          if (touchStateRef.current) {
            touchStateRef.current.dismissOnTouchEnd = false;
            touchStateRef.current.dismissOnMouseDown = false;
          }
        });
      }
    }
    function addTargetEventListenerOnce(event, listener) {
      const target = getTarget(event);
      if (!target) {
        return;
      }
      const unsubscribe2 = addEventListener(target, event.type, () => {
        listener(event);
        unsubscribe2();
      });
    }
    function handleTouchStartCapture(event) {
      currentPointerTypeRef.current = "touch";
      addTargetEventListenerOnce(event, handleTouchStart);
    }
    function closeOnPressOutsideCapture(event) {
      cancelDismissOnEndTimeout.clear();
      if (event.type === "pointerdown") {
        currentPointerTypeRef.current = event.pointerType;
      }
      if (event.type === "mousedown" && touchStateRef.current && !touchStateRef.current.dismissOnMouseDown) {
        return;
      }
      addTargetEventListenerOnce(event, (targetEvent) => {
        if (targetEvent.type === "pointerdown") {
          handlePointerDown(targetEvent);
        } else {
          closeOnPressOutside(targetEvent);
        }
      });
    }
    function handlePressEndCapture(event) {
      if (!pressStartedInsideRef.current) {
        return;
      }
      const pressStartedInsideDefaultPrevented = pressStartPreventedRef.current;
      resetPressStartState();
      if (getOutsidePressEvent() !== "intentional") {
        return;
      }
      if (event.type === "pointercancel") {
        if (pressStartedInsideDefaultPrevented) {
          suppressImmediateOutsideClickAfterPreventedStart();
        }
        return;
      }
      if (isEventWithinFloatingTree(event)) {
        return;
      }
      if (pressStartedInsideDefaultPrevented) {
        suppressImmediateOutsideClickAfterPreventedStart();
        return;
      }
      if (typeof outsidePress$1 === "function" && !outsidePress$1(event)) {
        return;
      }
      preventedPressSuppressionTimeout.clear();
      suppressNextOutsideClickRef.current = true;
      clearInsideReactTree();
    }
    function handleTouchMove(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
      const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > 5) {
        touchStateRef.current.dismissOnTouchEnd = true;
      }
      if (distance > 10) {
        closeOnPressOutside(event);
        cancelDismissOnEndTimeout.clear();
        touchStateRef.current = null;
      }
    }
    function handleTouchMoveCapture(event) {
      addTargetEventListenerOnce(event, handleTouchMove);
    }
    function handleTouchEnd(event) {
      if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventWithinOwnElements(event)) {
        return;
      }
      if (touchStateRef.current.dismissOnTouchEnd) {
        closeOnPressOutside(event);
      }
      cancelDismissOnEndTimeout.clear();
      touchStateRef.current = null;
    }
    function handleTouchEndCapture(event) {
      addTargetEventListenerOnce(event, handleTouchEnd);
    }
    const doc = ownerDocument(floatingElement);
    const unsubscribe = mergeCleanups(escapeKey$1 && mergeCleanups(addEventListener(doc, "keydown", closeOnEscapeKeyDown), addEventListener(doc, "compositionstart", handleCompositionStart), addEventListener(doc, "compositionend", handleCompositionEnd)), outsidePressEnabled && mergeCleanups(addEventListener(doc, "click", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerdown", closeOnPressOutsideCapture, true), addEventListener(doc, "pointerup", handlePressEndCapture, true), addEventListener(doc, "pointercancel", handlePressEndCapture, true), addEventListener(doc, "mousedown", closeOnPressOutsideCapture, true), addEventListener(doc, "mouseup", handlePressEndCapture, true), addEventListener(doc, "touchstart", handleTouchStartCapture, true), addEventListener(doc, "touchmove", handleTouchMoveCapture, true), addEventListener(doc, "touchend", handleTouchEndCapture, true)));
    return () => {
      unsubscribe();
      compositionTimeout.clear();
      preventedPressSuppressionTimeout.clear();
      resetPressStartState();
      suppressNextOutsideClickRef.current = false;
    };
  }, [dataRef, floatingElement, escapeKey$1, outsidePressEnabled, outsidePress$1, open, enabled, escapeKeyBubbles, outsidePressBubbles, closeOnEscapeKeyDown, clearInsideReactTree, getOutsidePressEventProp, hasBlockingChild, isEventWithinOwnElements, tree, store, cancelDismissOnEndTimeout]);
  reactExports.useEffect(clearInsideReactTree, [outsidePress$1, clearInsideReactTree]);
  const reference = reactExports.useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    onPointerDown: closeOnReferencePress,
    onClick: closeOnReferencePress
  }), [closeOnEscapeKeyDown, closeOnReferencePress]);
  const floating = reactExports.useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: markInsidePressStartPrevented,
    onMouseDown: markInsidePressStartPrevented,
    onClickCapture: markInsideReactTree,
    onMouseDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onPointerDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onMouseUpCapture: markInsideReactTree,
    onTouchEndCapture: markInsideReactTree,
    onTouchMoveCapture: markInsideReactTree
  }), [closeOnEscapeKeyDown, markInsideReactTree, markPressStartedInsideReactTree, markInsidePressStartPrevented]);
  return reactExports.useMemo(() => enabled ? {
    reference,
    floating,
    trigger: reference
  } : {}, [enabled, reference, floating]);
}
const selectors$2 = {
  open: createSelector((state) => state.open),
  transitionStatus: createSelector((state) => state.transitionStatus),
  domReferenceElement: createSelector((state) => state.domReferenceElement),
  referenceElement: createSelector((state) => state.positionReference ?? state.referenceElement),
  floatingElement: createSelector((state) => state.floatingElement),
  floatingId: createSelector((state) => state.floatingId)
};
class FloatingRootStore extends ReactStore {
  constructor(options) {
    const {
      syncOnly,
      nested,
      onOpenChange,
      triggerElements,
      ...initialState
    } = options;
    super({
      ...initialState,
      positionReference: initialState.referenceElement,
      domReferenceElement: initialState.referenceElement
    }, {
      onOpenChange,
      dataRef: {
        current: {}
      },
      events: createEventEmitter(),
      nested,
      triggerElements
    }, selectors$2);
    this.syncOnly = syncOnly;
  }
  /**
   * Syncs the event used by hover logic to distinguish hover-open from click-like interaction.
   */
  syncOpenEvent = (newOpen, event) => {
    if (!newOpen || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    event != null && isClickLikeEvent(event)) {
      this.context.dataRef.current.openEvent = newOpen ? event : void 0;
    }
  };
  /**
   * Runs the root-owned side effects for an open state change.
   */
  dispatchOpenChange = (newOpen, eventDetails) => {
    this.syncOpenEvent(newOpen, eventDetails.event);
    const details = {
      open: newOpen,
      reason: eventDetails.reason,
      nativeEvent: eventDetails.event,
      nested: this.context.nested,
      triggerElement: eventDetails.trigger
    };
    this.context.events.emit("openchange", details);
  };
  /**
   * Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
   *
   * @param newOpen The new open state.
   * @param eventDetails Details about the event that triggered the open state change.
   */
  setOpen = (newOpen, eventDetails) => {
    if (this.syncOnly) {
      this.context.onOpenChange?.(newOpen, eventDetails);
      return;
    }
    this.dispatchOpenChange(newOpen, eventDetails);
    this.context.onOpenChange?.(newOpen, eventDetails);
  };
}
function useSyncedFloatingRootContext(options) {
  const {
    popupStore,
    treatPopupAsFloatingElement = false,
    floatingRootContext: floatingRootContextProp,
    floatingId,
    nested,
    onOpenChange
  } = options;
  const open = popupStore.useState("open");
  const referenceElement = popupStore.useState("activeTriggerElement");
  const floatingElement = popupStore.useState(treatPopupAsFloatingElement ? "popupElement" : "positionerElement");
  const triggerElements = popupStore.context.triggerElements;
  const handleOpenChange = onOpenChange;
  const internalStoreRef = reactExports.useRef(null);
  if (floatingRootContextProp === void 0 && internalStoreRef.current === null) {
    internalStoreRef.current = new FloatingRootStore({
      open,
      transitionStatus: void 0,
      referenceElement,
      floatingElement,
      triggerElements,
      onOpenChange: handleOpenChange,
      floatingId,
      syncOnly: true,
      nested
    });
  }
  const store = floatingRootContextProp ?? internalStoreRef.current;
  popupStore.useSyncedValue("floatingId", floatingId);
  useIsoLayoutEffect(() => {
    const valuesToSync = {
      open,
      floatingId,
      referenceElement,
      floatingElement
    };
    if (isElement(referenceElement)) {
      valuesToSync.domReferenceElement = referenceElement;
    }
    if (store.state.positionReference === store.state.referenceElement) {
      valuesToSync.positionReference = referenceElement;
    }
    store.update(valuesToSync);
  }, [open, floatingId, referenceElement, floatingElement, store]);
  store.context.onOpenChange = handleOpenChange;
  store.context.nested = nested;
  return store;
}
function useTransitionStatus(open, enableIdleState = false, deferEndingState = false) {
  const [transitionStatus, setTransitionStatus] = reactExports.useState(open && enableIdleState ? "idle" : void 0);
  const [mounted, setMounted] = reactExports.useState(open);
  if (open && !mounted) {
    setMounted(true);
    setTransitionStatus("starting");
  }
  if (!open && mounted && transitionStatus !== "ending" && !deferEndingState) {
    setTransitionStatus("ending");
  }
  if (!open && !mounted && transitionStatus === "ending") {
    setTransitionStatus(void 0);
  }
  useIsoLayoutEffect(() => {
    if (!open && mounted && transitionStatus !== "ending" && deferEndingState) {
      const frame = AnimationFrame.request(() => {
        setTransitionStatus("ending");
      });
      return () => {
        AnimationFrame.cancel(frame);
      };
    }
    return void 0;
  }, [open, mounted, transitionStatus, deferEndingState]);
  useIsoLayoutEffect(() => {
    if (!open || enableIdleState) {
      return void 0;
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus(void 0);
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open]);
  useIsoLayoutEffect(() => {
    if (!open || !enableIdleState) {
      return void 0;
    }
    if (open && mounted && transitionStatus !== "idle") {
      setTransitionStatus("starting");
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus("idle");
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open, mounted, transitionStatus]);
  return {
    mounted,
    setMounted,
    transitionStatus
  };
}
function useAnimationsFinished(elementOrRef, waitForStartingStyleRemoved = false, treatAbortedAsFinished = true) {
  const frame = useAnimationFrame();
  return useStableCallback((fnToExecute, signal = null) => {
    frame.cancel();
    const element = resolveRef(elementOrRef);
    if (element == null) {
      return;
    }
    const resolvedElement = element;
    const done = () => {
      reactDomExports.flushSync(fnToExecute);
    };
    if (typeof resolvedElement.getAnimations !== "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      fnToExecute();
      return;
    }
    function exec() {
      Promise.all(resolvedElement.getAnimations().map((animation) => animation.finished)).then(() => {
        if (!signal?.aborted) {
          done();
        }
      }).catch(() => {
        if (treatAbortedAsFinished) {
          if (!signal?.aborted) {
            done();
          }
          return;
        }
        const currentAnimations = resolvedElement.getAnimations();
        if (!signal?.aborted && currentAnimations.length > 0 && currentAnimations.some((animation) => animation.pending || animation.playState !== "finished")) {
          exec();
        }
      });
    }
    if (waitForStartingStyleRemoved) {
      const startingStyleAttribute = TransitionStatusDataAttributes.startingStyle;
      if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
        frame.request(exec);
        return;
      }
      const attributeObserver = new MutationObserver(() => {
        if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
          attributeObserver.disconnect();
          exec();
        }
      });
      attributeObserver.observe(resolvedElement, {
        attributes: true,
        attributeFilter: [startingStyleAttribute]
      });
      signal?.addEventListener("abort", () => attributeObserver.disconnect(), {
        once: true
      });
      return;
    }
    frame.request(exec);
  });
}
function useOpenChangeComplete(parameters) {
  const {
    enabled = true,
    open,
    ref,
    onComplete: onCompleteParam
  } = parameters;
  const onComplete = useStableCallback(onCompleteParam);
  const runOnceAnimationsFinish = useAnimationsFinished(ref, open, false);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    const abortController = new AbortController();
    runOnceAnimationsFinish(onComplete, abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [enabled, open, onComplete, runOnceAnimationsFinish]);
}
const FOCUSABLE_POPUP_PROPS = {
  tabIndex: -1,
  [FOCUSABLE_ATTRIBUTE]: ""
};
function createDefaultInitialFocus(popupRef) {
  return (interactionType) => interactionType === "touch" ? popupRef.current : true;
}
function usePopupStore(externalStore, createStore, treatPopupAsFloatingElement = false) {
  const floatingId = useId();
  const nested = useFloatingParentNodeId() != null;
  const internalStoreRef = reactExports.useRef(null);
  if (externalStore === void 0 && internalStoreRef.current === null) {
    internalStoreRef.current = createStore(floatingId, nested);
  }
  const store = externalStore ?? internalStoreRef.current;
  useSyncedFloatingRootContext({
    popupStore: store,
    treatPopupAsFloatingElement,
    floatingRootContext: store.state.floatingRootContext,
    floatingId,
    nested,
    onOpenChange: store.setOpen
  });
  return {
    store,
    internalStore: internalStoreRef.current
  };
}
function useTriggerRegistration(id, store) {
  const registeredElementIdRef = reactExports.useRef(null);
  const registeredElementRef = reactExports.useRef(null);
  return reactExports.useCallback((element) => {
    if (id === void 0) {
      return;
    }
    let shouldSyncTriggerCount = false;
    if (registeredElementIdRef.current !== null) {
      const registeredId = registeredElementIdRef.current;
      const registeredElement = registeredElementRef.current;
      const currentElement = store.context.triggerElements.getById(registeredId);
      if (registeredElement && currentElement === registeredElement) {
        store.context.triggerElements.delete(registeredId);
        shouldSyncTriggerCount = true;
      }
      registeredElementIdRef.current = null;
      registeredElementRef.current = null;
    }
    if (element !== null) {
      registeredElementIdRef.current = id;
      registeredElementRef.current = element;
      store.context.triggerElements.add(id, element);
      shouldSyncTriggerCount = true;
    }
    if (shouldSyncTriggerCount) {
      const triggerCount = store.context.triggerElements.size;
      if (store.select("open") && store.state.triggerCount !== triggerCount) {
        store.set("triggerCount", triggerCount);
      }
    }
  }, [store, id]);
}
function setPopupOpenState(state, open, trigger, preventUnmountOnClose = false) {
  if (open) {
    state.preventUnmountingOnClose = false;
  } else if (preventUnmountOnClose) {
    state.preventUnmountingOnClose = true;
  }
  const triggerId = trigger?.id ?? null;
  if (triggerId || open) {
    state.activeTriggerId = triggerId;
    state.activeTriggerElement = trigger ?? null;
  }
}
function attachPreventUnmountOnClose(eventDetails) {
  let preventUnmountOnClose = false;
  eventDetails.preventUnmountOnClose = () => {
    preventUnmountOnClose = true;
  };
  return () => preventUnmountOnClose;
}
function useInitialOpenSync(store, openProp, defaultOpen, defaultTriggerId) {
  useOnFirstRender(() => {
    if (openProp === void 0 && store.state.open === false && defaultOpen) {
      store.state = {
        ...store.state,
        open: true,
        activeTriggerId: defaultTriggerId,
        preventUnmountingOnClose: false
      };
    }
  });
}
function useTriggerDataForwarding(triggerId, triggerElementRef, store, stateUpdates) {
  const isMountedByThisTrigger = store.useState("isMountedByTrigger", triggerId);
  const baseRegisterTrigger = useTriggerRegistration(triggerId, store);
  const registerTrigger = useStableCallback((element) => {
    baseRegisterTrigger(element);
    if (!element) {
      return;
    }
    const open = store.select("open");
    const activeTriggerId = store.select("activeTriggerId");
    if (activeTriggerId === triggerId) {
      store.update({
        activeTriggerElement: element,
        ...open ? stateUpdates : null
      });
      return;
    }
    if (activeTriggerId == null && open) {
      store.update({
        activeTriggerId: triggerId,
        activeTriggerElement: element,
        ...stateUpdates
      });
    }
  });
  useIsoLayoutEffect(() => {
    if (isMountedByThisTrigger) {
      store.update({
        activeTriggerElement: triggerElementRef.current,
        ...stateUpdates
      });
    }
  }, [isMountedByThisTrigger, store, triggerElementRef, ...Object.values(stateUpdates)]);
  return {
    registerTrigger,
    isMountedByThisTrigger
  };
}
function useImplicitActiveTrigger(store, options = {}) {
  const {
    closeOnActiveTriggerUnmount = false
  } = options;
  const open = store.useState("open");
  const reactiveTriggerCount = store.useState("triggerCount");
  useIsoLayoutEffect(() => {
    if (!open) {
      if (store.state.triggerCount !== 0) {
        store.set("triggerCount", 0);
      }
      return;
    }
    const triggerCount = store.context.triggerElements.size;
    const stateUpdates = {};
    if (store.state.triggerCount !== triggerCount) {
      stateUpdates.triggerCount = triggerCount;
    }
    const activeTriggerId = store.select("activeTriggerId");
    let lostActiveTriggerId = null;
    if (activeTriggerId) {
      const activeTriggerElement = store.context.triggerElements.getById(activeTriggerId);
      if (!activeTriggerElement) {
        lostActiveTriggerId = activeTriggerId;
      } else if (activeTriggerElement !== store.state.activeTriggerElement) {
        stateUpdates.activeTriggerElement = activeTriggerElement;
      }
    }
    if (!lostActiveTriggerId && !activeTriggerId && triggerCount === 1) {
      const iteratorResult = store.context.triggerElements.entries().next();
      if (!iteratorResult.done) {
        const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
        stateUpdates.activeTriggerId = implicitTriggerId;
        stateUpdates.activeTriggerElement = implicitTriggerElement;
      }
    }
    if (stateUpdates.triggerCount !== void 0 || stateUpdates.activeTriggerId !== void 0 || stateUpdates.activeTriggerElement !== void 0) {
      store.update(stateUpdates);
    }
    if (lostActiveTriggerId) {
      if (closeOnActiveTriggerUnmount) {
        queueMicrotask(() => {
          if (store.select("open") && store.select("activeTriggerId") === lostActiveTriggerId && !store.context.triggerElements.getById(lostActiveTriggerId)) {
            const eventDetails = createChangeEventDetails(none);
            store.setOpen(false, eventDetails);
            if (!eventDetails.isCanceled) {
              store.update({
                activeTriggerId: null,
                activeTriggerElement: null
              });
            }
          }
        });
      }
    }
  }, [open, store, reactiveTriggerCount, closeOnActiveTriggerUnmount]);
}
function useOpenStateTransitions(open, store, onUnmount) {
  const {
    mounted,
    setMounted,
    transitionStatus
  } = useTransitionStatus(open);
  const preventUnmountingOnClose = store.useState("preventUnmountingOnClose");
  const syncedPreventUnmountingOnClose = open ? false : preventUnmountingOnClose;
  store.useSyncedValues({
    mounted,
    transitionStatus,
    preventUnmountingOnClose: syncedPreventUnmountingOnClose
  });
  const forceUnmount = useStableCallback(() => {
    setMounted(false);
    store.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: false,
      preventUnmountingOnClose: false
    });
    onUnmount?.();
    store.context.onOpenChangeComplete?.(false);
  });
  useOpenChangeComplete({
    enabled: mounted && !open && !syncedPreventUnmountingOnClose,
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (!open) {
        forceUnmount();
      }
    }
  });
  return {
    forceUnmount,
    transitionStatus
  };
}
function usePopupInteractionProps(store, statePart) {
  store.useSyncedValues(statePart);
  useIsoLayoutEffect(() => () => {
    store.update({
      activeTriggerProps: EMPTY_OBJECT,
      inactiveTriggerProps: EMPTY_OBJECT,
      popupProps: EMPTY_OBJECT
    });
  }, [store]);
}
function usePopupRootSync(store, open) {
  useIsoLayoutEffect(() => {
    if (!open && store.state.openMethod !== null) {
      store.set("openMethod", null);
    }
  }, [open, store]);
  useIsoLayoutEffect(() => () => {
    if (store.state.openMethod !== null) {
      store.set("openMethod", null);
    }
  }, [store]);
}
class PopupTriggerMap {
  constructor() {
    this.elementsSet = /* @__PURE__ */ new Set();
    this.idMap = /* @__PURE__ */ new Map();
  }
  /**
   * Adds a trigger element with the given ID.
   *
   * Note: The provided element is assumed to not be registered under multiple IDs.
   */
  add(id, element) {
    const existingElement = this.idMap.get(id);
    if (existingElement === element) {
      return;
    }
    if (existingElement !== void 0) {
      this.elementsSet.delete(existingElement);
    }
    this.elementsSet.add(element);
    this.idMap.set(id, element);
  }
  /**
   * Removes the trigger element with the given ID.
   */
  delete(id) {
    const element = this.idMap.get(id);
    if (element) {
      this.elementsSet.delete(element);
      this.idMap.delete(id);
    }
  }
  /**
   * Whether the given element is registered as a trigger.
   */
  hasElement(element) {
    return this.elementsSet.has(element);
  }
  /**
   * Whether there is a registered trigger element matching the given predicate.
   */
  hasMatchingElement(predicate) {
    for (const element of this.elementsSet) {
      if (predicate(element)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns the trigger element associated with the given ID, or undefined if no such element exists.
   */
  getById(id) {
    return this.idMap.get(id);
  }
  /**
   * Returns an iterable of all registered trigger entries, where each entry is a tuple of [id, element].
   */
  entries() {
    return this.idMap.entries();
  }
  /**
   * Returns an iterable of all registered trigger elements.
   */
  elements() {
    return this.elementsSet.values();
  }
  /**
   * Returns the number of registered trigger elements.
   */
  get size() {
    return this.idMap.size;
  }
}
function getEmptyRootContext() {
  return new FloatingRootStore({
    open: false,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new PopupTriggerMap(),
    floatingId: void 0,
    syncOnly: false,
    nested: false,
    onOpenChange: void 0
  });
}
function createInitialPopupStoreState() {
  return {
    open: false,
    openProp: void 0,
    mounted: false,
    transitionStatus: void 0,
    floatingRootContext: getEmptyRootContext(),
    floatingId: void 0,
    triggerCount: 0,
    preventUnmountingOnClose: false,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: EMPTY_OBJECT,
    inactiveTriggerProps: EMPTY_OBJECT,
    popupProps: EMPTY_OBJECT
  };
}
function createPopupFloatingRootContext(triggerElements, floatingId, nested = false) {
  return new FloatingRootStore({
    open: false,
    transitionStatus: void 0,
    floatingElement: null,
    referenceElement: null,
    triggerElements,
    floatingId,
    syncOnly: true,
    nested,
    onOpenChange: void 0
  });
}
const activeTriggerIdSelector = createSelector((state) => state.triggerIdProp ?? state.activeTriggerId);
const openSelector = createSelector((state) => state.openProp ?? state.open);
const popupIdSelector = createSelector((state) => {
  const popupId = state.popupElement?.id ?? state.floatingId;
  return popupId || void 0;
});
function triggerOwnsOpenPopup(state, triggerId) {
  return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) === triggerId;
}
function triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) {
  if (triggerOwnsOpenPopup(state, triggerId)) {
    return true;
  }
  return triggerId !== void 0 && openSelector(state) && activeTriggerIdSelector(state) == null && state.triggerCount === 1;
}
const popupStoreSelectors = {
  open: openSelector,
  mounted: createSelector((state) => state.mounted),
  transitionStatus: createSelector((state) => state.transitionStatus),
  floatingRootContext: createSelector((state) => state.floatingRootContext),
  triggerCount: createSelector((state) => state.triggerCount),
  preventUnmountingOnClose: createSelector((state) => state.preventUnmountingOnClose),
  payload: createSelector((state) => state.payload),
  activeTriggerId: activeTriggerIdSelector,
  activeTriggerElement: createSelector((state) => state.mounted ? state.activeTriggerElement : null),
  popupId: popupIdSelector,
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: createSelector((state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: createSelector((state, triggerId) => triggerOwnsOpenPopup(state, triggerId)),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: createSelector((state, triggerId) => triggerId !== void 0 && activeTriggerIdSelector(state) === triggerId && state.mounted),
  triggerProps: createSelector((state, isActive) => isActive ? state.activeTriggerProps : state.inactiveTriggerProps),
  /**
   * Popup id for the trigger that currently owns the open popup.
   */
  triggerPopupId: createSelector((state, triggerId) => triggerOwnsOpenPopupOrIsOnlyTrigger(state, triggerId) ? popupIdSelector(state) : void 0),
  popupProps: createSelector((state) => state.popupProps),
  popupElement: createSelector((state) => state.popupElement),
  positionerElement: createSelector((state) => state.positionerElement)
};
function useFloatingRootContext(options) {
  const {
    open = false,
    onOpenChange,
    elements = {}
  } = options;
  const floatingId = useId();
  const nested = useFloatingParentNodeId() != null;
  const store = useRefWithInit(() => new FloatingRootStore({
    open,
    transitionStatus: void 0,
    onOpenChange,
    referenceElement: elements.reference ?? null,
    floatingElement: elements.floating ?? null,
    triggerElements: new PopupTriggerMap(),
    floatingId,
    syncOnly: false,
    nested
  })).current;
  useIsoLayoutEffect(() => {
    const valuesToSync = {
      open,
      floatingId
    };
    if (elements.reference !== void 0) {
      valuesToSync.referenceElement = elements.reference;
      valuesToSync.domReferenceElement = isElement(elements.reference) ? elements.reference : null;
    }
    if (elements.floating !== void 0) {
      valuesToSync.floatingElement = elements.floating;
    }
    store.update(valuesToSync);
  }, [open, floatingId, elements.reference, elements.floating, store]);
  store.context.onOpenChange = onOpenChange;
  store.context.nested = nested;
  return store;
}
function useFloating(options = {}) {
  const {
    nodeId,
    externalTree
  } = options;
  const internalStore = useFloatingRootContext(options);
  const store = options.rootContext || internalStore;
  const referenceElement = store.useState("referenceElement");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const open = store.useState("open");
  const floatingId = store.useState("floatingId");
  const [positionReference, setPositionReferenceRaw] = reactExports.useState(null);
  const [localDomReference, setLocalDomReference] = reactExports.useState(void 0);
  const [localFloatingElement, setLocalFloatingElement] = reactExports.useState(void 0);
  const domReferenceRef = reactExports.useRef(null);
  const tree = useFloatingTree(externalTree);
  const storeElements = reactExports.useMemo(() => ({
    reference: referenceElement,
    floating: floatingElement,
    domReference: domReferenceElement
  }), [referenceElement, floatingElement, domReferenceElement]);
  const position = useFloating$1({
    ...options,
    elements: {
      ...storeElements,
      ...positionReference && {
        reference: positionReference
      }
    }
  });
  const localDomReferenceElement = isElement(localDomReference) ? localDomReference : null;
  const syncedFloatingElement = localFloatingElement === void 0 ? store.state.floatingElement : localFloatingElement;
  store.useSyncedValue("referenceElement", localDomReference ?? null);
  store.useSyncedValue("domReferenceElement", localDomReference === void 0 ? domReferenceElement : localDomReferenceElement);
  store.useSyncedValue("floatingElement", syncedFloatingElement);
  const setPositionReference = reactExports.useCallback((node) => {
    const computedPositionReference = isElement(node) ? {
      getBoundingClientRect: () => node.getBoundingClientRect(),
      getClientRects: () => node.getClientRects(),
      contextElement: node
    } : node;
    setPositionReferenceRaw(computedPositionReference);
    position.refs.setReference(computedPositionReference);
  }, [position.refs]);
  const setReference = reactExports.useCallback((node) => {
    if (isElement(node) || node === null) {
      domReferenceRef.current = node;
      setLocalDomReference(node);
    }
    if (isElement(position.refs.reference.current) || position.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    node !== null && !isElement(node)) {
      position.refs.setReference(node);
    }
  }, [position.refs, setLocalDomReference]);
  const setFloating = reactExports.useCallback((node) => {
    setLocalFloatingElement(node);
    position.refs.setFloating(node);
  }, [position.refs]);
  const refs = reactExports.useMemo(() => ({
    ...position.refs,
    setReference,
    setFloating,
    setPositionReference,
    domReference: domReferenceRef
  }), [position.refs, setReference, setFloating, setPositionReference]);
  const elements = reactExports.useMemo(() => ({
    ...position.elements,
    domReference: domReferenceElement
  }), [position.elements, domReferenceElement]);
  const context = reactExports.useMemo(() => ({
    ...position,
    dataRef: store.context.dataRef,
    open,
    onOpenChange: store.setOpen,
    events: store.context.events,
    floatingId,
    refs,
    elements,
    nodeId,
    rootStore: store
  }), [position, refs, elements, nodeId, store, open, floatingId]);
  useIsoLayoutEffect(() => {
    if (domReferenceElement) {
      domReferenceRef.current = domReferenceElement;
    }
  }, [domReferenceElement]);
  useIsoLayoutEffect(() => {
    store.context.dataRef.current.floatingContext = context;
    const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.context = context;
    }
  });
  return reactExports.useMemo(() => ({
    ...position,
    context,
    refs,
    elements,
    rootStore: store
  }), [position, refs, elements, context, store]);
}
class HoverInteraction {
  constructor() {
    this.pointerType = void 0;
    this.interactedInside = false;
    this.handler = void 0;
    this.blockMouseMove = true;
    this.performedPointerEventsMutation = false;
    this.pointerEventsScopeElement = null;
    this.pointerEventsReferenceElement = null;
    this.pointerEventsFloatingElement = null;
    this.restTimeoutPending = false;
    this.openChangeTimeout = new Timeout();
    this.restTimeout = new Timeout();
    this.handleCloseOptions = void 0;
  }
  static create() {
    return new HoverInteraction();
  }
  dispose = () => {
    this.openChangeTimeout.clear();
    this.restTimeout.clear();
  };
  disposeEffect = () => {
    return this.dispose;
  };
}
const pointerEventsMutationOwnerByScopeElement = /* @__PURE__ */ new WeakMap();
function clearSafePolygonPointerEventsMutation(instance) {
  if (!instance.performedPointerEventsMutation) {
    return;
  }
  const scopeElement = instance.pointerEventsScopeElement;
  if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
    instance.pointerEventsScopeElement?.style.removeProperty("pointer-events");
    instance.pointerEventsReferenceElement?.style.removeProperty("pointer-events");
    instance.pointerEventsFloatingElement?.style.removeProperty("pointer-events");
    pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
  }
  instance.performedPointerEventsMutation = false;
  instance.pointerEventsScopeElement = null;
  instance.pointerEventsReferenceElement = null;
  instance.pointerEventsFloatingElement = null;
}
function applySafePolygonPointerEventsMutation(instance, options) {
  const {
    scopeElement,
    referenceElement,
    floatingElement
  } = options;
  const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
  if (existingOwner && existingOwner !== instance) {
    clearSafePolygonPointerEventsMutation(existingOwner);
  }
  clearSafePolygonPointerEventsMutation(instance);
  instance.performedPointerEventsMutation = true;
  instance.pointerEventsScopeElement = scopeElement;
  instance.pointerEventsReferenceElement = referenceElement;
  instance.pointerEventsFloatingElement = floatingElement;
  pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);
  scopeElement.style.pointerEvents = "none";
  referenceElement.style.pointerEvents = "auto";
  floatingElement.style.pointerEvents = "auto";
}
function useHoverInteractionSharedState(store) {
  const data = store.context.dataRef.current;
  const instance = useRefWithInit(() => data.hoverInteractionState ?? HoverInteraction.create()).current;
  if (!data.hoverInteractionState) {
    data.hoverInteractionState = instance;
  }
  useOnMount(data.hoverInteractionState.disposeEffect);
  return data.hoverInteractionState;
}
function useHoverFloatingInteraction(context, parameters = {}) {
  const {
    enabled = true,
    closeDelay: closeDelayProp = 0,
    nodeId: nodeIdProp
  } = parameters;
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const {
    dataRef
  } = store.context;
  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const instance = useHoverInteractionSharedState(store);
  const childClosedTimeout = useTimeout();
  const isClickLikeOpenEvent$1 = useStableCallback(() => {
    return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
  });
  const isHoverOpen = useStableCallback(() => {
    return isHoverOpenEvent(dataRef.current.openEvent?.type);
  });
  const clearPointerEvents = useStableCallback(() => {
    clearSafePolygonPointerEventsMutation(instance);
  });
  useIsoLayoutEffect(() => {
    if (!open) {
      instance.pointerType = void 0;
      instance.restTimeoutPending = false;
      instance.interactedInside = false;
      clearPointerEvents();
    }
  }, [open, instance, clearPointerEvents]);
  reactExports.useEffect(() => {
    return clearPointerEvents;
  }, [clearPointerEvents]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return void 0;
    }
    if (open && instance.handleCloseOptions?.blockPointerEvents && isHoverOpen() && isElement(domReferenceElement) && floatingElement) {
      const ref = domReferenceElement;
      const floatingEl = floatingElement;
      const doc = ownerDocument(floatingElement);
      const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
      if (parentFloating) {
        parentFloating.style.pointerEvents = "";
      }
      const cachedScopeElement = instance.pointerEventsScopeElement !== floatingEl ? instance.pointerEventsScopeElement : null;
      const parentScopeElement = parentFloating !== floatingEl ? parentFloating : null;
      const scopeElement = instance.handleCloseOptions?.getScope?.() ?? cachedScopeElement ?? parentScopeElement ?? ref.closest("[data-rootownerid]") ?? doc.body;
      applySafePolygonPointerEventsMutation(instance, {
        scopeElement,
        referenceElement: ref,
        floatingElement: floatingEl
      });
      return () => {
        clearPointerEvents();
      };
    }
    return void 0;
  }, [enabled, open, domReferenceElement, floatingElement, instance, isHoverOpen, tree, parentId, clearPointerEvents]);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function hasParentChildren() {
      return !!(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);
    }
    function closeWithDelay(event) {
      const closeDelay = getDelay(closeDelayProp, "close", instance.pointerType);
      const close = () => {
        store.setOpen(false, createChangeEventDetails(triggerHover, event));
        tree?.events.emit("floating.closed", event);
      };
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, close);
      } else {
        instance.openChangeTimeout.clear();
        close();
      }
    }
    function handleInteractInside(event) {
      const target = getTarget(event);
      if (!isInteractiveElement(target)) {
        instance.interactedInside = false;
        return;
      }
      instance.interactedInside = target?.closest("[aria-haspopup]") != null;
    }
    function onFloatingMouseEnter() {
      instance.openChangeTimeout.clear();
      childClosedTimeout.clear();
      tree?.events.off("floating.closed", onNodeClosed);
      clearPointerEvents();
    }
    function onFloatingMouseLeave(event) {
      if (hasParentChildren() && tree) {
        tree.events.on("floating.closed", onNodeClosed);
        return;
      }
      if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        return;
      }
      const currentNodeId = dataRef.current.floatingContext?.nodeId ?? nodeIdProp;
      const relatedTarget = event.relatedTarget;
      const isMovingIntoDescendantFloating = tree && currentNodeId && isElement(relatedTarget) && getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node) => contains(node.context?.elements.floating, relatedTarget));
      if (isMovingIntoDescendantFloating) {
        return;
      }
      if (instance.handler) {
        instance.handler(event);
        return;
      }
      clearPointerEvents();
      if (isHoverOpen() && !isClickLikeOpenEvent$1()) {
        closeWithDelay(event);
      }
    }
    function onNodeClosed(event) {
      if (!tree || !parentId || hasParentChildren()) {
        return;
      }
      childClosedTimeout.start(0, () => {
        tree.events.off("floating.closed", onNodeClosed);
        store.setOpen(false, createChangeEventDetails(triggerHover, event));
        tree.events.emit("floating.closed", event);
      });
    }
    const floating = floatingElement;
    return mergeCleanups(floating && addEventListener(floating, "mouseenter", onFloatingMouseEnter), floating && addEventListener(floating, "mouseleave", onFloatingMouseLeave), floating && addEventListener(floating, "pointerdown", handleInteractInside, true), () => {
      tree?.events.off("floating.closed", onNodeClosed);
    });
  }, [enabled, floatingElement, store, dataRef, closeDelayProp, nodeIdProp, isHoverOpen, isClickLikeOpenEvent$1, clearPointerEvents, instance, tree, parentId, childClosedTimeout]);
}
const EMPTY_REF = {
  current: null
};
function useHoverReferenceInteraction(context, props = {}) {
  const {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0,
    move = true,
    triggerElementRef = EMPTY_REF,
    externalTree,
    isActiveTrigger = true,
    getHandleCloseContext,
    isClosing,
    shouldOpen: shouldOpenProp
  } = props;
  const store = "rootStore" in context ? context.rootStore : context;
  const {
    dataRef,
    events
  } = store.context;
  const tree = useFloatingTree(externalTree);
  const instance = useHoverInteractionSharedState(store);
  const isHoverCloseActiveRef = reactExports.useRef(false);
  const handleCloseRef = useValueAsRef(handleClose);
  const delayRef = useValueAsRef(delay);
  const restMsRef = useValueAsRef(restMs);
  const enabledRef = useValueAsRef(enabled);
  const shouldOpenRef = useValueAsRef(shouldOpenProp);
  const isClosingRef = useValueAsRef(isClosing);
  const isClickLikeOpenEvent$1 = useStableCallback(() => {
    return isClickLikeOpenEvent(dataRef.current.openEvent?.type, instance.interactedInside);
  });
  const checkShouldOpen = useStableCallback(() => {
    return shouldOpenRef.current?.() !== false;
  });
  const isOverInactiveTrigger = useStableCallback((currentDomReference, currentTarget, target) => {
    const allTriggers = store.context.triggerElements;
    if (allTriggers.hasElement(currentTarget)) {
      return !currentDomReference || !contains(currentDomReference, currentTarget);
    }
    if (!isElement(target)) {
      return false;
    }
    const targetElement = target;
    return allTriggers.hasMatchingElement((trigger) => contains(trigger, targetElement)) && (!currentDomReference || !contains(currentDomReference, targetElement));
  });
  const cleanupMouseMoveHandler = useStableCallback(() => {
    if (!instance.handler) {
      return;
    }
    const doc = ownerDocument(store.select("domReferenceElement"));
    doc.removeEventListener("mousemove", instance.handler);
    instance.handler = void 0;
  });
  const clearPointerEvents = useStableCallback(() => {
    clearSafePolygonPointerEventsMutation(instance);
  });
  if (isActiveTrigger) {
    instance.handleCloseOptions = handleCloseRef.current?.__options;
  }
  reactExports.useEffect(() => cleanupMouseMoveHandler, [cleanupMouseMoveHandler]);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function onOpenChangeLocal(details) {
      if (!details.open) {
        isHoverCloseActiveRef.current = details.reason === triggerHover;
        cleanupMouseMoveHandler();
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        instance.blockMouseMove = true;
        instance.restTimeoutPending = false;
      } else {
        isHoverCloseActiveRef.current = false;
      }
    }
    events.on("openchange", onOpenChangeLocal);
    return () => {
      events.off("openchange", onOpenChangeLocal);
    };
  }, [enabled, events, instance, cleanupMouseMoveHandler]);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function closeWithDelay(event, runElseBranch = true) {
      const closeDelay = getDelay(delayRef.current, "close", instance.pointerType);
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, () => {
          store.setOpen(false, createChangeEventDetails(triggerHover, event));
          tree?.events.emit("floating.closed", event);
        });
      } else if (runElseBranch) {
        instance.openChangeTimeout.clear();
        store.setOpen(false, createChangeEventDetails(triggerHover, event));
        tree?.events.emit("floating.closed", event);
      }
    }
    const trigger = triggerElementRef.current ?? (isActiveTrigger ? store.select("domReferenceElement") : null);
    if (!isElement(trigger)) {
      return void 0;
    }
    function onMouseEnter(event) {
      instance.openChangeTimeout.clear();
      instance.blockMouseMove = false;
      if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
        return;
      }
      const restMsValue = getRestMs(restMsRef.current);
      const openDelay = getDelay(delayRef.current, "open", instance.pointerType);
      const eventTarget = getTarget(event);
      const currentTarget = event.currentTarget ?? null;
      const currentDomReference = store.select("domReferenceElement");
      let triggerNode = currentTarget;
      if (isElement(eventTarget) && !store.context.triggerElements.hasElement(eventTarget)) {
        for (const triggerElement of store.context.triggerElements.elements()) {
          if (contains(triggerElement, eventTarget)) {
            triggerNode = triggerElement;
            break;
          }
        }
      }
      if (isElement(currentTarget) && isElement(currentDomReference) && !store.context.triggerElements.hasElement(currentTarget) && contains(currentTarget, currentDomReference)) {
        triggerNode = currentDomReference;
      }
      const isOverInactive = triggerNode == null ? false : isOverInactiveTrigger(currentDomReference, triggerNode, eventTarget);
      const isOpen = store.select("open");
      const isInClosingTransition = isClosingRef.current?.() ?? store.select("transitionStatus") === "ending";
      const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActiveRef.current;
      const isReenteringSameTriggerDuringCloseTransition = !isOverInactive && isElement(triggerNode) && isElement(currentDomReference) && contains(currentDomReference, triggerNode) && isHoverCloseTransition;
      const isRestOnlyDelay = restMsValue > 0 && !openDelay;
      const shouldOpenImmediately = isOverInactive && (isOpen || isHoverCloseTransition) || isReenteringSameTriggerDuringCloseTransition;
      const shouldOpen = !isOpen || isOverInactive;
      if (shouldOpenImmediately) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
        }
        return;
      }
      if (isRestOnlyDelay) {
        return;
      }
      if (openDelay) {
        instance.openChangeTimeout.start(openDelay, () => {
          if (shouldOpen && checkShouldOpen()) {
            store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
          }
        });
      } else if (shouldOpen) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
        }
      }
    }
    function onMouseLeave(event) {
      if (isClickLikeOpenEvent$1()) {
        clearPointerEvents();
        return;
      }
      cleanupMouseMoveHandler();
      const domReferenceElement = store.select("domReferenceElement");
      const doc = ownerDocument(domReferenceElement);
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;
      const handleCloseContextBase = dataRef.current.floatingContext ?? getHandleCloseContext?.();
      if (isTargetInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        return;
      }
      if (handleCloseRef.current && handleCloseContextBase) {
        if (!store.select("open")) {
          instance.openChangeTimeout.clear();
        }
        const currentTrigger = triggerElementRef.current;
        instance.handler = handleCloseRef.current({
          ...handleCloseContextBase,
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (enabledRef.current && !isClickLikeOpenEvent$1() && currentTrigger === store.select("domReferenceElement")) {
              closeWithDelay(event, true);
            }
          }
        });
        doc.addEventListener("mousemove", instance.handler);
        instance.handler(event);
        return;
      }
      const shouldClose = instance.pointerType === "touch" ? !contains(store.select("floatingElement"), event.relatedTarget) : true;
      if (shouldClose) {
        closeWithDelay(event);
      }
    }
    if (move) {
      return mergeCleanups(addEventListener(trigger, "mousemove", onMouseEnter, {
        once: true
      }), addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave));
    }
    return mergeCleanups(addEventListener(trigger, "mouseenter", onMouseEnter), addEventListener(trigger, "mouseleave", onMouseLeave));
  }, [cleanupMouseMoveHandler, clearPointerEvents, dataRef, delayRef, store, enabled, handleCloseRef, instance, isActiveTrigger, isOverInactiveTrigger, isClickLikeOpenEvent$1, mouseOnly, move, restMsRef, triggerElementRef, tree, enabledRef, getHandleCloseContext, isClosingRef, checkShouldOpen]);
  return reactExports.useMemo(() => {
    if (!enabled) {
      return void 0;
    }
    function setPointerRef(event) {
      instance.pointerType = event.pointerType;
    }
    return {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,
      onMouseMove(event) {
        const {
          nativeEvent
        } = event;
        const trigger = event.currentTarget;
        const currentDomReference = store.select("domReferenceElement");
        const currentOpen = store.select("open");
        const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);
        if (mouseOnly && !isMouseLikePointerType(instance.pointerType)) {
          return;
        }
        if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
          const floatingElement = store.select("floatingElement");
          if (floatingElement) {
            const scopeElement = instance.handleCloseOptions?.getScope?.() ?? trigger.ownerDocument.body;
            applySafePolygonPointerEventsMutation(instance, {
              scopeElement,
              referenceElement: trigger,
              floatingElement
            });
          }
        }
        const restMsValue = getRestMs(restMsRef.current);
        if (currentOpen && !isOverInactive || restMsValue === 0) {
          return;
        }
        if (!isOverInactive && instance.restTimeoutPending && event.movementX ** 2 + event.movementY ** 2 < 2) {
          return;
        }
        instance.restTimeout.clear();
        function handleMouseMove() {
          instance.restTimeoutPending = false;
          if (isClickLikeOpenEvent$1()) {
            return;
          }
          const latestOpen = store.select("open");
          if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) {
            store.setOpen(true, createChangeEventDetails(triggerHover, nativeEvent, trigger));
          }
        }
        if (instance.pointerType === "touch") {
          reactDomExports.flushSync(() => {
            handleMouseMove();
          });
        } else if (isOverInactive && currentOpen) {
          handleMouseMove();
        } else {
          instance.restTimeoutPending = true;
          instance.restTimeout.start(restMsValue, handleMouseMove);
        }
      }
    };
  }, [enabled, instance, isClickLikeOpenEvent$1, isOverInactiveTrigger, mouseOnly, store, restMsRef, checkShouldOpen]);
}
const CURSOR_SPEED_THRESHOLD = 0.1;
const CURSOR_SPEED_THRESHOLD_SQUARED = CURSOR_SPEED_THRESHOLD * CURSOR_SPEED_THRESHOLD;
const POLYGON_BUFFER = 0.5;
function hasIntersectingEdge(pointX, pointY, xi, yi, xj, yj) {
  return yi >= pointY !== yj >= pointY && pointX <= (xj - xi) * (pointY - yi) / (yj - yi) + xi;
}
function isPointInQuadrilateral(pointX, pointY, x1, y1, x2, y2, x3, y3, x4, y4) {
  let isInsideValue = false;
  if (hasIntersectingEdge(pointX, pointY, x1, y1, x2, y2)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x2, y2, x3, y3)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x3, y3, x4, y4)) {
    isInsideValue = !isInsideValue;
  }
  if (hasIntersectingEdge(pointX, pointY, x4, y4, x1, y1)) {
    isInsideValue = !isInsideValue;
  }
  return isInsideValue;
}
function isInsideRect(pointX, pointY, rect) {
  return pointX >= rect.x && pointX <= rect.x + rect.width && pointY >= rect.y && pointY <= rect.y + rect.height;
}
function isInsideAxisAlignedRect(pointX, pointY, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY;
}
function safePolygon(options = {}) {
  const {
    blockPointerEvents = false
  } = options;
  const timeout = new Timeout();
  const fn = ({
    x,
    y,
    placement,
    elements,
    onClose,
    nodeId,
    tree
  }) => {
    const side = placement?.split("-")[0];
    let hasLanded = false;
    let lastX = null;
    let lastY = null;
    let lastCursorTime = typeof performance !== "undefined" ? performance.now() : 0;
    function isCursorMovingSlowly(nextX, nextY) {
      const currentTime = performance.now();
      const elapsedTime = currentTime - lastCursorTime;
      if (lastX === null || lastY === null || elapsedTime === 0) {
        lastX = nextX;
        lastY = nextY;
        lastCursorTime = currentTime;
        return false;
      }
      const deltaX = nextX - lastX;
      const deltaY = nextY - lastY;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const thresholdSquared = elapsedTime * elapsedTime * CURSOR_SPEED_THRESHOLD_SQUARED;
      lastX = nextX;
      lastY = nextY;
      lastCursorTime = currentTime;
      return distanceSquared < thresholdSquared;
    }
    function close() {
      timeout.clear();
      onClose();
    }
    return function onMouseMove(event) {
      timeout.clear();
      const domReference = elements.domReference;
      const floating = elements.floating;
      if (!domReference || !floating || side == null || x == null || y == null) {
        return void 0;
      }
      const {
        clientX,
        clientY
      } = event;
      const target = getTarget(event);
      const isLeave = event.type === "mouseleave";
      const isOverFloatingEl = contains(floating, target);
      const isOverReferenceEl = contains(domReference, target);
      if (isOverFloatingEl) {
        hasLanded = true;
        if (!isLeave) {
          return void 0;
        }
      }
      if (isOverReferenceEl) {
        hasLanded = false;
        if (!isLeave) {
          hasLanded = true;
          return void 0;
        }
      }
      if (isLeave && isElement(event.relatedTarget) && contains(floating, event.relatedTarget)) {
        return void 0;
      }
      function hasOpenChildNode() {
        return Boolean(tree && getNodeChildren(tree.nodesRef.current, nodeId).length > 0);
      }
      function closeIfNoOpenChild() {
        if (!hasOpenChildNode()) {
          close();
        }
      }
      if (hasOpenChildNode()) {
        return void 0;
      }
      const refRect = domReference.getBoundingClientRect();
      const rect = floating.getBoundingClientRect();
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
      const isFloatingWider = rect.width > refRect.width;
      const isFloatingTaller = rect.height > refRect.height;
      const left = (isFloatingWider ? refRect : rect).left;
      const right = (isFloatingWider ? refRect : rect).right;
      const top = (isFloatingTaller ? refRect : rect).top;
      const bottom = (isFloatingTaller ? refRect : rect).bottom;
      if (side === "top" && y >= refRect.bottom - 1 || side === "bottom" && y <= refRect.top + 1 || side === "left" && x >= refRect.right - 1 || side === "right" && x <= refRect.left + 1) {
        closeIfNoOpenChild();
        return void 0;
      }
      let isInsideTroughRect = false;
      switch (side) {
        case "top":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, refRect.top + 1, right, rect.bottom - 1);
          break;
        case "bottom":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, left, rect.top + 1, right, refRect.bottom - 1);
          break;
        case "left":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, rect.right - 1, bottom, refRect.left + 1, top);
          break;
        case "right":
          isInsideTroughRect = isInsideAxisAlignedRect(clientX, clientY, refRect.right - 1, bottom, rect.left + 1, top);
          break;
      }
      if (isInsideTroughRect) {
        return void 0;
      }
      if (hasLanded && !isInsideRect(clientX, clientY, refRect)) {
        closeIfNoOpenChild();
        return void 0;
      }
      if (!isLeave && isCursorMovingSlowly(clientX, clientY)) {
        closeIfNoOpenChild();
        return void 0;
      }
      let isInsidePolygon = false;
      switch (side) {
        case "top": {
          const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointY = y + POLYGON_BUFFER + 1;
          const commonYLeft = cursorLeaveFromRight ? rect.bottom - POLYGON_BUFFER : isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top;
          const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.bottom - POLYGON_BUFFER : rect.top : rect.bottom - POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
          break;
        }
        case "bottom": {
          const cursorXOffset = isFloatingWider ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneX = isFloatingWider ? x + cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointTwoX = isFloatingWider ? x - cursorXOffset : cursorLeaveFromRight ? x + cursorXOffset : x - cursorXOffset;
          const cursorPointY = y - POLYGON_BUFFER;
          const commonYLeft = cursorLeaveFromRight ? rect.top + POLYGON_BUFFER : isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom;
          const commonYRight = cursorLeaveFromRight ? isFloatingWider ? rect.top + POLYGON_BUFFER : rect.bottom : rect.top + POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointOneX, cursorPointY, cursorPointTwoX, cursorPointY, rect.left, commonYLeft, rect.right, commonYRight);
          break;
        }
        case "left": {
          const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointX = x + POLYGON_BUFFER + 1;
          const commonXTop = cursorLeaveFromBottom ? rect.right - POLYGON_BUFFER : isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left;
          const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.right - POLYGON_BUFFER : rect.left : rect.right - POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, commonXTop, rect.top, commonXBottom, rect.bottom, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY);
          break;
        }
        case "right": {
          const cursorYOffset = isFloatingTaller ? POLYGON_BUFFER / 2 : POLYGON_BUFFER * 4;
          const cursorPointOneY = isFloatingTaller ? y + cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointTwoY = isFloatingTaller ? y - cursorYOffset : cursorLeaveFromBottom ? y + cursorYOffset : y - cursorYOffset;
          const cursorPointX = x - POLYGON_BUFFER;
          const commonXTop = cursorLeaveFromBottom ? rect.left + POLYGON_BUFFER : isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right;
          const commonXBottom = cursorLeaveFromBottom ? isFloatingTaller ? rect.left + POLYGON_BUFFER : rect.right : rect.left + POLYGON_BUFFER;
          isInsidePolygon = isPointInQuadrilateral(clientX, clientY, cursorPointX, cursorPointOneY, cursorPointX, cursorPointTwoY, commonXTop, rect.top, commonXBottom, rect.bottom);
          break;
        }
      }
      if (!isInsidePolygon) {
        closeIfNoOpenChild();
      } else if (!hasLanded) {
        timeout.start(40, closeIfNoOpenChild);
      }
      return void 0;
    };
  };
  fn.__options = {
    ...options,
    blockPointerEvents
  };
  return fn;
}
let DialogPopupCssVars = /* @__PURE__ */ (function(DialogPopupCssVars2) {
  DialogPopupCssVars2["nestedDialogs"] = "--nested-dialogs";
  return DialogPopupCssVars2;
})({});
let DialogPopupDataAttributes = (function(DialogPopupDataAttributes2) {
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["open"] = CommonPopupDataAttributes.open] = "open";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["closed"] = CommonPopupDataAttributes.closed] = "closed";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["startingStyle"] = CommonPopupDataAttributes.startingStyle] = "startingStyle";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["endingStyle"] = CommonPopupDataAttributes.endingStyle] = "endingStyle";
  DialogPopupDataAttributes2["nested"] = "data-nested";
  DialogPopupDataAttributes2["nestedDialogOpen"] = "data-nested-dialog-open";
  return DialogPopupDataAttributes2;
})({});
const DialogPortalContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDialogPortalContext() {
  const value = reactExports.useContext(DialogPortalContext);
  if (value === void 0) {
    throw new Error(formatErrorMessage(26));
  }
  return value;
}
const ARROW_UP = "ArrowUp";
const ARROW_DOWN = "ArrowDown";
const ARROW_LEFT = "ArrowLeft";
const ARROW_RIGHT = "ArrowRight";
const HOME = "Home";
const END = "End";
const HORIZONTAL_KEYS = /* @__PURE__ */ new Set([ARROW_LEFT, ARROW_RIGHT]);
const VERTICAL_KEYS = /* @__PURE__ */ new Set([ARROW_UP, ARROW_DOWN]);
const ARROW_KEYS = /* @__PURE__ */ new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
const COMPOSITE_KEYS = /* @__PURE__ */ new Set([...ARROW_KEYS, HOME, END]);
const stateAttributesMapping$2 = {
  ...popupStateMapping,
  ...transitionStatusMapping,
  nestedDialogOpen(value) {
    return value ? {
      [DialogPopupDataAttributes.nestedDialogOpen]: ""
    } : null;
  }
};
const DialogPopup = /* @__PURE__ */ reactExports.forwardRef(function DialogPopup2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    finalFocus,
    initialFocus,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const descriptionElementId = store.useState("descriptionElementId");
  const disablePointerDismissal = store.useState("disablePointerDismissal");
  const floatingRootContext = store.useState("floatingRootContext");
  const rootPopupProps = store.useState("popupProps");
  const modal = store.useState("modal");
  const mounted = store.useState("mounted");
  const nested = store.useState("nested");
  const nestedOpenDialogCount = store.useState("nestedOpenDialogCount");
  const open = store.useState("open");
  const openMethod = store.useState("openMethod");
  const titleElementId = store.useState("titleElementId");
  const transitionStatus = store.useState("transitionStatus");
  const role = store.useState("role");
  const floatingId = floatingRootContext.useState("floatingId");
  const popupId = elementProps.id ?? floatingId;
  useDialogPortalContext();
  useOpenChangeComplete({
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (open) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  const resolvedInitialFocus = initialFocus === void 0 ? createDefaultInitialFocus(store.context.popupRef) : initialFocus;
  const nestedDialogOpen = nestedOpenDialogCount > 0;
  const setPopupElement = store.useStateSetter("popupElement");
  const state = {
    open,
    nested,
    transitionStatus,
    nestedDialogOpen
  };
  const element = useRenderElement("div", componentProps, {
    state,
    props: [rootPopupProps, {
      id: popupId,
      "aria-labelledby": titleElementId ?? void 0,
      "aria-describedby": descriptionElementId ?? void 0,
      role,
      ...FOCUSABLE_POPUP_PROPS,
      hidden: !mounted,
      onKeyDown(event) {
        if (COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      },
      style: {
        [DialogPopupCssVars.nestedDialogs]: nestedOpenDialogCount
      }
    }, elementProps],
    ref: [forwardedRef, store.context.popupRef, setPopupElement],
    stateAttributesMapping: stateAttributesMapping$2
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingFocusManager, {
    context: floatingRootContext,
    openInteractionType: openMethod,
    disabled: !mounted,
    closeOnFocusOut: !disablePointerDismissal,
    initialFocus: resolvedInitialFocus,
    returnFocus: finalFocus,
    modal: modal !== false,
    restoreFocus: "popup",
    children: element
  });
});
const InternalBackdrop = /* @__PURE__ */ reactExports.forwardRef(function InternalBackdrop2(props, ref) {
  const {
    cutout,
    ...otherProps
  } = props;
  let clipPath;
  if (cutout) {
    const rect = cutout.getBoundingClientRect();
    clipPath = `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
    ref,
    role: "presentation",
    "data-base-ui-inert": "",
    ...otherProps,
    style: {
      position: "fixed",
      inset: 0,
      userSelect: "none",
      WebkitUserSelect: "none",
      clipPath
    }
  });
});
const DialogPortal = /* @__PURE__ */ reactExports.forwardRef(function DialogPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const {
    store
  } = useDialogRootContext();
  const mounted = store.useState("mounted");
  const modal = store.useState("modal");
  const open = store.useState("open");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(DialogPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsxRuntimeExports.jsxs(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps,
      children: [mounted && modal === true && /* @__PURE__ */ jsxRuntimeExports.jsx(InternalBackdrop, {
        ref: store.context.internalBackdropRef,
        inert: inertValue(!open)
      }), props.children]
    })
  });
});
function useDialogRoot(params) {
  const {
    store,
    actionsRef
  } = params;
  const open = store.useState("open");
  usePopupRootSync(store, open);
  useImplicitActiveTrigger(store);
  const {
    forceUnmount
  } = useOpenStateTransitions(open, store);
  const handleImperativeClose = reactExports.useCallback(() => {
    store.setOpen(false, createChangeEventDetails(imperativeAction));
  }, [store]);
  reactExports.useImperativeHandle(actionsRef, () => ({
    unmount: forceUnmount,
    close: handleImperativeClose
  }), [forceUnmount, handleImperativeClose]);
}
function DialogInteractions({
  store,
  parentContext,
  isDrawer
}) {
  const open = store.useState("open");
  const disablePointerDismissal = store.useState("disablePointerDismissal");
  const modal = store.useState("modal");
  const popupElement = store.useState("popupElement");
  const floatingRootContext = store.useState("floatingRootContext");
  const [ownNestedOpenDialogs, setOwnNestedOpenDialogs] = reactExports.useState(0);
  const [ownNestedOpenDrawers, setOwnNestedOpenDrawers] = reactExports.useState(0);
  const isTopmost = ownNestedOpenDialogs === 0;
  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent() {
      if (store.context.internalBackdropRef.current || store.context.backdropRef.current) {
        return "intentional";
      }
      return {
        mouse: modal === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(event) {
      if (!store.context.outsidePressEnabledRef.current) {
        return false;
      }
      if ("button" in event && event.button !== 0) {
        return false;
      }
      if ("touches" in event && event.touches.length !== 1) {
        return false;
      }
      const target = getTarget(event);
      if (isTopmost && !disablePointerDismissal) {
        if (modal) {
          return store.context.internalBackdropRef.current || store.context.backdropRef.current ? store.context.internalBackdropRef.current === target || store.context.backdropRef.current === target || contains(target, popupElement) && !target?.hasAttribute("data-base-ui-portal") : true;
        }
        return true;
      }
      return false;
    },
    escapeKey: isTopmost
  });
  useScrollLock(open && modal === true, popupElement);
  store.useContextCallback("onNestedDialogOpen", (dialogCount, drawerCount) => {
    setOwnNestedOpenDialogs(dialogCount);
    setOwnNestedOpenDrawers(drawerCount);
  });
  store.useContextCallback("onNestedDialogClose", () => {
    setOwnNestedOpenDialogs(0);
    setOwnNestedOpenDrawers(0);
  });
  reactExports.useEffect(() => {
    if (parentContext?.onNestedDialogOpen && open) {
      parentContext.onNestedDialogOpen(ownNestedOpenDialogs + 1, ownNestedOpenDrawers + (isDrawer ? 1 : 0));
    }
    if (parentContext?.onNestedDialogClose && !open) {
      parentContext.onNestedDialogClose();
    }
    return () => {
      if (parentContext?.onNestedDialogClose && open) {
        parentContext.onNestedDialogClose();
      }
    };
  }, [isDrawer, open, ownNestedOpenDialogs, ownNestedOpenDrawers, parentContext]);
  const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
  const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
  const popupProps = dismiss.floating ?? EMPTY_OBJECT;
  usePopupInteractionProps(store, {
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    nestedOpenDialogCount: ownNestedOpenDialogs,
    nestedOpenDrawerCount: ownNestedOpenDrawers
  });
  return null;
}
const selectors$1 = {
  ...popupStoreSelectors,
  modal: createSelector((state) => state.modal),
  nested: createSelector((state) => state.nested),
  nestedOpenDialogCount: createSelector((state) => state.nestedOpenDialogCount),
  nestedOpenDrawerCount: createSelector((state) => state.nestedOpenDrawerCount),
  disablePointerDismissal: createSelector((state) => state.disablePointerDismissal),
  openMethod: createSelector((state) => state.openMethod),
  descriptionElementId: createSelector((state) => state.descriptionElementId),
  titleElementId: createSelector((state) => state.titleElementId),
  viewportElement: createSelector((state) => state.viewportElement),
  role: createSelector((state) => state.role)
};
class DialogStore extends ReactStore {
  constructor(initialState, floatingId, nested = false) {
    const triggerElements = new PopupTriggerMap();
    const state = createInitialState$1(initialState);
    state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);
    super(state, {
      popupRef: /* @__PURE__ */ reactExports.createRef(),
      backdropRef: /* @__PURE__ */ reactExports.createRef(),
      internalBackdropRef: /* @__PURE__ */ reactExports.createRef(),
      outsidePressEnabledRef: {
        current: true
      },
      triggerElements,
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, selectors$1);
  }
  setOpen = (nextOpen, eventDetails) => {
    eventDetails.preventUnmountOnClose = () => {
      this.set("preventUnmountingOnClose", true);
    };
    if (!nextOpen && eventDetails.trigger == null && this.state.activeTriggerId != null) {
      eventDetails.trigger = this.state.activeTriggerElement ?? void 0;
    }
    this.context.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    this.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
    const updatedState = {
      open: nextOpen
    };
    setPopupOpenState(updatedState, nextOpen, eventDetails.trigger);
    this.update(updatedState);
  };
  static useStore(externalStore, initialState) {
    const store = usePopupStore(externalStore, (floatingId, nested) => new DialogStore(initialState, floatingId, nested), true).store;
    return store;
  }
}
function createInitialState$1(initialState = {}) {
  return {
    ...createInitialPopupStoreState(),
    modal: true,
    disablePointerDismissal: false,
    popupElement: null,
    viewportElement: null,
    descriptionElementId: void 0,
    titleElementId: void 0,
    openMethod: null,
    nested: false,
    nestedOpenDialogCount: 0,
    nestedOpenDrawerCount: 0,
    role: "dialog",
    ...initialState
  };
}
function useRenderDialogRoot(props, mode = "dialog") {
  const {
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onOpenChangeComplete,
    disablePointerDismissal: disablePointerDismissalProp = false,
    modal: modalProp = true,
    actionsRef,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null
  } = props;
  const isDrawer = mode === "drawer";
  const isAlertDialog = mode === "alert-dialog";
  const modal = isAlertDialog ? true : modalProp;
  const disablePointerDismissal = isAlertDialog || disablePointerDismissalProp;
  const role = isAlertDialog ? "alertdialog" : "dialog";
  const parentDialogRootContext = useDialogRootContext(true);
  const nested = Boolean(parentDialogRootContext);
  const rootState = {
    modal,
    disablePointerDismissal,
    nested,
    role
  };
  const store = DialogStore.useStore(handle?.store, {
    open: defaultOpen,
    openProp,
    activeTriggerId: defaultTriggerIdProp,
    triggerIdProp,
    ...rootState
  });
  useOnFirstRender(() => {
    const nextState = openProp === void 0 && store.state.open === false && defaultOpen === true ? {
      open: true,
      activeTriggerId: defaultTriggerIdProp
    } : null;
    if (isAlertDialog) {
      store.update(nextState ? {
        ...rootState,
        ...nextState
      } : rootState);
    } else if (nextState) {
      store.update(nextState);
    }
  });
  store.useControlledProp("openProp", openProp);
  store.useControlledProp("triggerIdProp", triggerIdProp);
  store.useSyncedValues(rootState);
  store.useContextCallback("onOpenChange", onOpenChange);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  const open = store.useState("open");
  const mounted = store.useState("mounted");
  const payload = store.useState("payload");
  useDialogRoot({
    store,
    actionsRef
  });
  const shouldRenderInteractions = open || mounted;
  const contextValue = reactExports.useMemo(() => ({
    store
  }), [store]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(IsDrawerContext.Provider, {
    value: false,
    children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogRootContext.Provider, {
      value: contextValue,
      children: [shouldRenderInteractions && /* @__PURE__ */ jsxRuntimeExports.jsx(DialogInteractions, {
        store,
        parentContext: parentDialogRootContext?.store.context,
        isDrawer
      }), typeof children === "function" ? children({
        payload
      }) : children]
    })
  });
}
function DialogRoot(props) {
  const mode = reactExports.useContext(IsDrawerContext) ? "drawer" : "dialog";
  return useRenderDialogRoot(props, mode);
}
const DialogTitle = /* @__PURE__ */ reactExports.forwardRef(function DialogTitle2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const id = useBaseUiId(idProp);
  store.useSyncedValueWithCleanup("titleElementId", id);
  return useRenderElement("h2", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
});
function useOpenMethodTriggerProps(open, setOpenMethod) {
  const handleTriggerClick = useStableCallback((_, interactionType) => {
    const isOpen = typeof open === "function" ? open() : open;
    if (!isOpen) {
      setOpenMethod(interactionType || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
      // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
      // will be "" in that case.
      (ios ? "touch" : ""));
    }
  });
  const {
    onClick,
    onPointerDown
  } = useEnhancedClickHandler(handleTriggerClick);
  return reactExports.useMemo(() => ({
    onClick,
    onPointerDown
  }), [onClick, onPointerDown]);
}
function useRender(params) {
  return useRenderElement(params.defaultTagName ?? "div", params, params);
}
const PopoverRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverRootContext(optional) {
  const context = reactExports.useContext(PopoverRootContext);
  if (context === void 0 && !optional) {
    throw new Error(formatErrorMessage(47));
  }
  return context;
}
function createInitialState() {
  return {
    ...createInitialPopupStoreState(),
    disabled: false,
    modal: false,
    focusManagerModal: false,
    instantType: void 0,
    openMethod: null,
    openChangeReason: null,
    titleElementId: void 0,
    descriptionElementId: void 0,
    stickIfOpen: true,
    nested: false,
    openOnHover: false,
    closeDelay: 0,
    hasViewport: false
  };
}
const selectors = {
  ...popupStoreSelectors,
  disabled: createSelector((state) => state.disabled),
  instantType: createSelector((state) => state.instantType),
  openMethod: createSelector((state) => state.openMethod),
  openChangeReason: createSelector((state) => state.openChangeReason),
  modal: createSelector((state) => state.modal),
  focusManagerModal: createSelector((state) => state.focusManagerModal),
  stickIfOpen: createSelector((state) => state.stickIfOpen),
  titleElementId: createSelector((state) => state.titleElementId),
  descriptionElementId: createSelector((state) => state.descriptionElementId),
  openOnHover: createSelector((state) => state.openOnHover),
  closeDelay: createSelector((state) => state.closeDelay),
  hasViewport: createSelector((state) => state.hasViewport)
};
class PopoverStore extends ReactStore {
  constructor(initialState, floatingId, nested = false) {
    const initial = {
      ...createInitialState(),
      ...initialState
    };
    const triggerElements = new PopupTriggerMap();
    if (initial.open && initialState?.mounted === void 0) {
      initial.mounted = true;
    }
    initial.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);
    super(initial, {
      popupRef: /* @__PURE__ */ reactExports.createRef(),
      backdropRef: /* @__PURE__ */ reactExports.createRef(),
      internalBackdropRef: /* @__PURE__ */ reactExports.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ reactExports.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ reactExports.createRef(),
      stickIfOpenTimeout: new Timeout(),
      triggerElements
    }, selectors);
  }
  setOpen = (nextOpen, eventDetails) => {
    const isHover = eventDetails.reason === triggerHover;
    const isKeyboardClick = eventDetails.reason === triggerPress && eventDetails.event.detail === 0;
    const isDismissClose = !nextOpen && (eventDetails.reason === escapeKey || eventDetails.reason == null);
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);
    const activeTriggerId = this.select("activeTriggerId");
    if (!nextOpen && eventDetails.reason === closePress && eventDetails.trigger == null && activeTriggerId != null) {
      eventDetails.trigger = this.context.triggerElements.getById(activeTriggerId) ?? this.select("activeTriggerElement") ?? void 0;
    }
    this.context.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    this.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);
    const changeState = () => {
      const updatedState = {
        open: nextOpen,
        openChangeReason: eventDetails.reason
      };
      setPopupOpenState(updatedState, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
      this.update(updatedState);
    };
    if (isHover) {
      this.set("stickIfOpen", true);
      this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
        this.set("stickIfOpen", false);
      });
      reactDomExports.flushSync(changeState);
    } else {
      changeState();
    }
    if (isKeyboardClick || isDismissClose) {
      this.set("instantType", isKeyboardClick ? "click" : "dismiss");
    } else if (eventDetails.reason === focusOut) {
      this.set("instantType", "focus");
    } else {
      this.set("instantType", void 0);
    }
  };
  static useStore(externalStore, initialState) {
    const {
      store,
      internalStore
    } = usePopupStore(externalStore, (floatingId, nested) => new PopoverStore(initialState, floatingId, nested));
    reactExports.useEffect(() => internalStore?.disposeEffect(), [internalStore]);
    return store;
  }
  disposeEffect = () => {
    return this.context.stickIfOpenTimeout.disposeEffect();
  };
}
function PopoverRootComponent({
  props
}) {
  const {
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onOpenChangeComplete,
    modal = false,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null
  } = props;
  const store = PopoverStore.useStore(handle?.store, {
    modal,
    open: defaultOpen,
    openProp,
    activeTriggerId: defaultTriggerIdProp,
    triggerIdProp
  });
  useInitialOpenSync(store, openProp, defaultOpen, defaultTriggerIdProp);
  store.useControlledProp("openProp", openProp);
  store.useControlledProp("triggerIdProp", triggerIdProp);
  const open = store.useState("open");
  const mounted = store.useState("mounted");
  const payload = store.useState("payload");
  const nested = useFloatingParentNodeId() != null;
  store.useContextCallback("onOpenChange", onOpenChange);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  usePopupRootSync(store, open);
  useImplicitActiveTrigger(store);
  const {
    forceUnmount
  } = useOpenStateTransitions(open, store, () => {
    store.update({
      stickIfOpen: true,
      openChangeReason: null
    });
  });
  store.useSyncedValues({
    modal,
    nested
  });
  reactExports.useEffect(() => {
    if (!open) {
      store.context.stickIfOpenTimeout.clear();
    }
  }, [store, open]);
  const handleImperativeClose = reactExports.useCallback(() => {
    store.setOpen(false, createChangeEventDetails(imperativeAction));
  }, [store]);
  reactExports.useImperativeHandle(props.actionsRef, () => ({
    unmount: forceUnmount,
    close: handleImperativeClose
  }), [forceUnmount, handleImperativeClose]);
  const shouldRenderInteractions = open || mounted;
  const popoverContext = reactExports.useMemo(() => ({
    store
  }), [store]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(PopoverRootContext.Provider, {
    value: popoverContext,
    children: [shouldRenderInteractions && /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverInteractions, {
      store,
      modal
    }), typeof children === "function" ? children({
      payload
    }) : children]
  });
}
function PopoverRoot(props) {
  if (usePopoverRootContext(true)) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRootComponent, {
      props
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingTree, {
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRootComponent, {
      props
    })
  });
}
function PopoverInteractions({
  store,
  modal
}) {
  const floatingRootContext = store.useState("floatingRootContext");
  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: modal === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  });
  const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
  const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
  const popupProps = reactExports.useMemo(() => mergeProps(FOCUSABLE_POPUP_PROPS, dismiss.floating), [dismiss.floating]);
  usePopupInteractionProps(store, {
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps
  });
  return null;
}
const OPEN_DELAY = 300;
function useTriggerFocusGuards(store, triggerElementRef) {
  const preFocusGuardRef = reactExports.useRef(null);
  function handlePreFocusGuardFocus(event) {
    reactDomExports.flushSync(() => {
      store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent, event.currentTarget));
    });
    const previousTabbable = getTabbableBeforeElement(preFocusGuardRef.current);
    previousTabbable?.focus();
  }
  function handleFocusTargetFocus(event) {
    const positionerElement = store.select("positionerElement");
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
    } else {
      reactDomExports.flushSync(() => {
        store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent, event.currentTarget));
      });
      let nextTabbable = getTabbableAfterElement(store.context.triggerFocusTargetRef.current || triggerElementRef.current);
      while (nextTabbable !== null && contains(positionerElement, nextTabbable)) {
        const prevTabbable = nextTabbable;
        nextTabbable = getNextTabbable(nextTabbable);
        if (nextTabbable === prevTabbable) {
          break;
        }
      }
      nextTabbable?.focus();
    }
  }
  return {
    preFocusGuardRef,
    handlePreFocusGuardFocus,
    handleFocusTargetFocus
  };
}
const PopoverTrigger = /* @__PURE__ */ reactExports.forwardRef(function PopoverTrigger2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    disabled = false,
    nativeButton = true,
    handle,
    payload,
    openOnHover = false,
    delay = OPEN_DELAY,
    closeDelay = 0,
    id: idProp,
    ...elementProps
  } = componentProps;
  const rootContext = usePopoverRootContext(true);
  const store = handle?.store ?? rootContext?.store;
  if (!store) {
    throw new Error(formatErrorMessage(74));
  }
  const thisTriggerId = useBaseUiId(idProp);
  const isTriggerActive = store.useState("isTriggerActive", thisTriggerId);
  const floatingContext = store.useState("floatingRootContext");
  const isOpenedByThisTrigger = store.useState("isOpenedByTrigger", thisTriggerId);
  const popupId = store.useState("triggerPopupId", thisTriggerId);
  const triggerElementRef = reactExports.useRef(null);
  const {
    registerTrigger,
    isMountedByThisTrigger
  } = useTriggerDataForwarding(thisTriggerId, triggerElementRef, store, {
    payload,
    disabled,
    openOnHover,
    closeDelay
  });
  const openReason = store.useState("openChangeReason");
  const stickIfOpen = store.useState("stickIfOpen");
  const openMethod = store.useState("openMethod");
  const focusManagerModal = store.useState("focusManagerModal");
  const hoverProps = useHoverReferenceInteraction(floatingContext, {
    enabled: !disabled && floatingContext != null && openOnHover && (openMethod !== "touch" || openReason !== triggerPress),
    mouseOnly: true,
    move: false,
    handleClose: safePolygon(),
    restMs: delay,
    delay: {
      close: closeDelay
    },
    triggerElementRef,
    isActiveTrigger: isTriggerActive,
    isClosing: () => store.select("transitionStatus") === "ending"
  });
  const click = useClick(floatingContext, {
    enabled: floatingContext != null,
    stickIfOpen
  });
  const interactionTypeProps = useOpenMethodTriggerProps(() => store.select("open"), (interactionType) => {
    store.set("openMethod", interactionType);
  });
  const rootTriggerProps = store.useState("triggerProps", isMountedByThisTrigger);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const stateAttributesMapping2 = {
    open(value) {
      if (value && openReason === triggerPress) {
        return pressableTriggerOpenStateMapping.open(value);
      }
      return triggerOpenStateMapping.open(value);
    }
  };
  const {
    preFocusGuardRef,
    handlePreFocusGuardFocus,
    handleFocusTargetFocus
  } = useTriggerFocusGuards(store, triggerElementRef);
  const state = {
    disabled,
    open: isOpenedByThisTrigger
  };
  const element = useRenderElement("button", componentProps, {
    state,
    ref: [buttonRef, forwardedRef, registerTrigger, triggerElementRef],
    props: [click.reference, hoverProps, rootTriggerProps, interactionTypeProps, {
      [CLICK_TRIGGER_IDENTIFIER]: "",
      id: thisTriggerId,
      "aria-haspopup": "dialog",
      "aria-expanded": isOpenedByThisTrigger,
      "aria-controls": popupId
    }, elementProps, getButtonProps],
    stateAttributesMapping: stateAttributesMapping2
  });
  if (isMountedByThisTrigger && !focusManagerModal) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
      children: [/* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        ref: preFocusGuardRef,
        onFocus: handlePreFocusGuardFocus
      }), /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {
        children: element
      }, thisTriggerId), /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        ref: store.context.triggerFocusTargetRef,
        onFocus: handleFocusTargetFocus
      })]
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {
    children: element
  }, thisTriggerId);
});
const PopoverPortalContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverPortalContext() {
  const value = reactExports.useContext(PopoverPortalContext);
  if (value === void 0) {
    throw new Error(formatErrorMessage(45));
  }
  return value;
}
const PopoverPortal = /* @__PURE__ */ reactExports.forwardRef(function PopoverPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const {
    store
  } = usePopoverRootContext();
  const mounted = store.useState("mounted");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps
    })
  });
});
const PopoverPositionerContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverPositionerContext() {
  const context = reactExports.useContext(PopoverPositionerContext);
  if (!context) {
    throw new Error(formatErrorMessage(46));
  }
  return context;
}
const DirectionContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDirection() {
  const context = reactExports.useContext(DirectionContext);
  return context?.direction ?? "ltr";
}
const baseArrow = (options) => ({
  name: "arrow",
  options,
  async fn(state) {
    const {
      x,
      y,
      placement,
      rects,
      platform,
      elements,
      middlewareData
    } = state;
    const {
      element,
      padding = 0,
      offsetParent = "real"
    } = evaluate(options, state) || {};
    if (element == null) {
      return {};
    }
    const paddingObject = getPaddingObject(padding);
    const coords = {
      x,
      y
    };
    const axis = getAlignmentAxis(placement);
    const length = getAxisLength(axis);
    const arrowDimensions = await platform.getDimensions(element);
    const isYAxis = axis === "y";
    const minProp = isYAxis ? "top" : "left";
    const maxProp = isYAxis ? "bottom" : "right";
    const clientProp = isYAxis ? "clientHeight" : "clientWidth";
    const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];
    const arrowOffsetParent = offsetParent === "real" ? await platform.getOffsetParent?.(element) : elements.floating;
    let clientSize = elements.floating[clientProp] || rects.floating[length];
    if (!clientSize || !await platform.isElement?.(arrowOffsetParent)) {
      clientSize = elements.floating[clientProp] || rects.floating[length];
    }
    const centerToReference = endDiff / 2 - startDiff / 2;
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
    const min = minPadding;
    const max = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset2 = clamp(min, center, max);
    const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset2 && rects.reference[length] / 2 - (center < min ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
    const alignmentOffset = shouldAddOffset ? center < min ? center - min : center - max : 0;
    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset2,
        centerOffset: center - offset2 - alignmentOffset,
        ...shouldAddOffset && {
          alignmentOffset
        }
      },
      reset: shouldAddOffset
    };
  }
});
const arrow = (options, deps) => ({
  ...baseArrow(options),
  options: [options, deps]
});
const nativeHideFn = hide$1().fn;
const hide = {
  name: "hide",
  async fn(state) {
    const {
      width,
      height,
      x,
      y
    } = state.rects.reference;
    const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
    const nativeHideResult = await nativeHideFn(state);
    return {
      data: {
        referenceHidden: nativeHideResult.data?.referenceHidden || anchorHidden
      }
    };
  }
};
const DEFAULT_SIDES = {
  sideX: "left",
  sideY: "top"
};
const adaptiveOrigin = {
  name: "adaptiveOrigin",
  async fn(state) {
    const {
      x: rawX,
      y: rawY,
      rects: {
        floating: floatRect
      },
      elements: {
        floating
      },
      platform,
      strategy,
      placement
    } = state;
    const win = getWindow(floating);
    const styles = win.getComputedStyle(floating);
    const hasTransition = styles.transitionDuration !== "0s" && styles.transitionDuration !== "";
    if (!hasTransition) {
      return {
        x: rawX,
        y: rawY,
        data: DEFAULT_SIDES
      };
    }
    const offsetParent = await platform.getOffsetParent?.(floating);
    let offsetDimensions = {
      width: 0,
      height: 0
    };
    if (strategy === "fixed" && win?.visualViewport) {
      offsetDimensions = {
        width: win.visualViewport.width,
        height: win.visualViewport.height
      };
    } else if (offsetParent === win) {
      const doc = ownerDocument(floating);
      offsetDimensions = {
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      };
    } else if (await platform.isElement?.(offsetParent)) {
      offsetDimensions = await platform.getDimensions(offsetParent);
    }
    const currentSide = getSide(placement);
    let x = rawX;
    let y = rawY;
    if (currentSide === "left") {
      x = offsetDimensions.width - (rawX + floatRect.width);
    }
    if (currentSide === "top") {
      y = offsetDimensions.height - (rawY + floatRect.height);
    }
    const sideX = currentSide === "left" ? "right" : DEFAULT_SIDES.sideX;
    const sideY = currentSide === "top" ? "bottom" : DEFAULT_SIDES.sideY;
    return {
      x,
      y,
      data: {
        sideX,
        sideY
      }
    };
  }
};
function getLogicalSide(sideParam, renderedSide, isRtl) {
  const isLogicalSideParam = sideParam === "inline-start" || sideParam === "inline-end";
  const logicalRight = isRtl ? "inline-start" : "inline-end";
  const logicalLeft = isRtl ? "inline-end" : "inline-start";
  return {
    top: "top",
    right: isLogicalSideParam ? logicalRight : "right",
    bottom: "bottom",
    left: isLogicalSideParam ? logicalLeft : "left"
  }[renderedSide];
}
function getOffsetData(state, sideParam, isRtl) {
  const {
    rects,
    placement
  } = state;
  const data = {
    side: getLogicalSide(sideParam, getSide(placement), isRtl),
    align: getAlignment(placement) || "center",
    anchor: {
      width: rects.reference.width,
      height: rects.reference.height
    },
    positioner: {
      width: rects.floating.width,
      height: rects.floating.height
    }
  };
  return data;
}
function useAnchorPositioning(params) {
  const {
    // Public parameters
    anchor,
    positionMethod = "absolute",
    side: sideParam = "bottom",
    sideOffset = 0,
    align = "center",
    alignOffset = 0,
    collisionBoundary,
    collisionPadding: collisionPaddingParam = 5,
    sticky = false,
    arrowPadding = 5,
    disableAnchorTracking = false,
    inline: inlineMiddleware,
    // Private parameters
    keepMounted = false,
    floatingRootContext,
    mounted,
    collisionAvoidance,
    shiftCrossAxis = false,
    nodeId,
    adaptiveOrigin: adaptiveOrigin2,
    lazyFlip = false,
    externalTree
  } = params;
  const [mountSide, setMountSide] = reactExports.useState(null);
  if (!mounted && mountSide !== null) {
    setMountSide(null);
  }
  const collisionAvoidanceSide = collisionAvoidance.side || "flip";
  const collisionAvoidanceAlign = collisionAvoidance.align || "flip";
  const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || "end";
  const anchorFn = typeof anchor === "function" ? anchor : void 0;
  const anchorFnCallback = useStableCallback(anchorFn);
  const anchorDep = anchorFn ? anchorFnCallback : anchor;
  const anchorValueRef = useValueAsRef(anchor);
  const mountedRef = useValueAsRef(mounted);
  const direction = useDirection();
  const isRtl = direction === "rtl";
  const side = mountSide || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": isRtl ? "left" : "right",
    "inline-start": isRtl ? "right" : "left"
  }[sideParam];
  const placement = align === "center" ? side : `${side}-${align}`;
  let collisionPadding = collisionPaddingParam;
  const bias = 1;
  const biasTop = sideParam === "bottom" ? bias : 0;
  const biasBottom = sideParam === "top" ? bias : 0;
  const biasLeft = sideParam === "right" ? bias : 0;
  const biasRight = sideParam === "left" ? bias : 0;
  if (typeof collisionPadding === "number") {
    collisionPadding = {
      top: collisionPadding + biasTop,
      right: collisionPadding + biasRight,
      bottom: collisionPadding + biasBottom,
      left: collisionPadding + biasLeft
    };
  } else if (collisionPadding) {
    collisionPadding = {
      top: (collisionPadding.top || 0) + biasTop,
      right: (collisionPadding.right || 0) + biasRight,
      bottom: (collisionPadding.bottom || 0) + biasBottom,
      left: (collisionPadding.left || 0) + biasLeft
    };
  }
  const commonCollisionProps = {
    boundary: collisionBoundary === "clipping-ancestors" ? "clippingAncestors" : collisionBoundary,
    padding: collisionPadding
  };
  const arrowRef = reactExports.useRef(null);
  const sideOffsetRef = useValueAsRef(sideOffset);
  const alignOffsetRef = useValueAsRef(alignOffset);
  const sideOffsetDep = typeof sideOffset !== "function" ? sideOffset : 0;
  const alignOffsetDep = typeof alignOffset !== "function" ? alignOffset : 0;
  const middleware = [];
  if (inlineMiddleware) {
    middleware.push(inlineMiddleware);
  }
  middleware.push(offset((state) => {
    const data = getOffsetData(state, sideParam, isRtl);
    const sideAxis = typeof sideOffsetRef.current === "function" ? sideOffsetRef.current(data) : sideOffsetRef.current;
    const alignAxis = typeof alignOffsetRef.current === "function" ? alignOffsetRef.current(data) : alignOffsetRef.current;
    return {
      mainAxis: sideAxis,
      crossAxis: alignAxis,
      alignmentAxis: alignAxis
    };
  }, [sideOffsetDep, alignOffsetDep, isRtl, sideParam]));
  const shiftDisabled = collisionAvoidanceAlign === "none" && collisionAvoidanceSide !== "shift";
  const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === "shift");
  const flipMiddleware = collisionAvoidanceSide === "none" ? null : flip({
    ...commonCollisionProps,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: collisionPadding.top + bias,
      right: collisionPadding.right + bias,
      bottom: collisionPadding.bottom + bias,
      left: collisionPadding.left + bias
    },
    mainAxis: !shiftCrossAxis && collisionAvoidanceSide === "flip",
    crossAxis: collisionAvoidanceAlign === "flip" ? "alignment" : false,
    fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide
  });
  const shiftMiddleware = shiftDisabled ? null : shift((data) => {
    const html = ownerDocument(data.elements.floating).documentElement;
    return {
      ...commonCollisionProps,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: shiftCrossAxis ? {
        x: 0,
        y: 0,
        width: html.clientWidth,
        height: html.clientHeight
      } : void 0,
      mainAxis: collisionAvoidanceAlign !== "none",
      crossAxis: crossAxisShiftEnabled,
      limiter: sticky || shiftCrossAxis ? void 0 : limitShift((limitData) => {
        if (!arrowRef.current) {
          return {};
        }
        const {
          width,
          height
        } = arrowRef.current.getBoundingClientRect();
        const sideAxis = getSideAxis(getSide(limitData.placement));
        const arrowSize = sideAxis === "y" ? width : height;
        const offsetAmount = sideAxis === "y" ? collisionPadding.left + collisionPadding.right : collisionPadding.top + collisionPadding.bottom;
        return {
          offset: arrowSize / 2 + offsetAmount / 2
        };
      })
    };
  }, [commonCollisionProps, sticky, shiftCrossAxis, collisionPadding, collisionAvoidanceAlign]);
  if (collisionAvoidanceSide === "shift" || collisionAvoidanceAlign === "shift" || align === "center") {
    middleware.push(shiftMiddleware, flipMiddleware);
  } else {
    middleware.push(flipMiddleware, shiftMiddleware);
  }
  middleware.push(size({
    ...commonCollisionProps,
    apply({
      elements: {
        floating
      },
      availableWidth,
      availableHeight,
      rects
    }) {
      if (!mountedRef.current) {
        return;
      }
      const floatingStyle = floating.style;
      floatingStyle.setProperty("--available-width", `${availableWidth}px`);
      floatingStyle.setProperty("--available-height", `${availableHeight}px`);
      const dpr = getWindow(floating).devicePixelRatio || 1;
      const {
        x: x2,
        y: y2,
        width,
        height
      } = rects.reference;
      const anchorWidth = (Math.round((x2 + width) * dpr) - Math.round(x2 * dpr)) / dpr;
      const anchorHeight = (Math.round((y2 + height) * dpr) - Math.round(y2 * dpr)) / dpr;
      floatingStyle.setProperty("--anchor-width", `${anchorWidth}px`);
      floatingStyle.setProperty("--anchor-height", `${anchorHeight}px`);
    }
  }), arrow((state) => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: arrowRef.current || ownerDocument(state.elements.floating).createElement("div"),
    padding: arrowPadding,
    offsetParent: "floating"
  }), [arrowPadding]), {
    name: "transformOrigin",
    fn(state) {
      const {
        elements: elements2,
        middlewareData: middlewareData2,
        placement: renderedPlacement2,
        rects,
        y: y2
      } = state;
      const currentRenderedSide = getSide(renderedPlacement2);
      const currentRenderedAxis = getSideAxis(currentRenderedSide);
      const arrowEl = arrowRef.current;
      const arrowX = middlewareData2.arrow?.x || 0;
      const arrowY = middlewareData2.arrow?.y || 0;
      const arrowWidth = arrowEl?.clientWidth || 0;
      const arrowHeight = arrowEl?.clientHeight || 0;
      const transformX = arrowX + arrowWidth / 2;
      const transformY = arrowY + arrowHeight / 2;
      const shiftY = Math.abs(middlewareData2.shift?.y || 0);
      const halfAnchorHeight = rects.reference.height / 2;
      const sideOffsetValue = typeof sideOffset === "function" ? sideOffset(getOffsetData(state, sideParam, isRtl)) : sideOffset;
      const isOverlappingAnchor = shiftY > sideOffsetValue;
      const adjacentTransformOrigin = {
        top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
        bottom: `${transformX}px ${-sideOffsetValue}px`,
        left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
        right: `${-sideOffsetValue}px ${transformY}px`
      }[currentRenderedSide];
      const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y2}px`;
      elements2.floating.style.setProperty("--transform-origin", crossAxisShiftEnabled && currentRenderedAxis === "y" && isOverlappingAnchor ? overlapTransformOrigin : adjacentTransformOrigin);
      return {};
    }
  }, hide, adaptiveOrigin2);
  useIsoLayoutEffect(() => {
    if (!mounted && floatingRootContext) {
      floatingRootContext.update({
        referenceElement: null,
        floatingElement: null,
        domReferenceElement: null,
        positionReference: null
      });
    }
  }, [mounted, floatingRootContext]);
  const autoUpdateOptions = reactExports.useMemo(() => ({
    elementResize: !disableAnchorTracking && typeof ResizeObserver !== "undefined",
    layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== "undefined"
  }), [disableAnchorTracking]);
  const {
    refs,
    elements,
    x,
    y,
    middlewareData,
    update,
    placement: renderedPlacement,
    context,
    isPositioned,
    floatingStyles: originalFloatingStyles
  } = useFloating({
    rootContext: floatingRootContext,
    open: keepMounted ? mounted : void 0,
    placement,
    middleware,
    strategy: positionMethod,
    whileElementsMounted: keepMounted ? void 0 : (...args) => autoUpdate(...args, autoUpdateOptions),
    nodeId,
    externalTree
  });
  const {
    sideX,
    sideY
  } = middlewareData.adaptiveOrigin || DEFAULT_SIDES;
  const resolvedPosition = isPositioned ? positionMethod : "fixed";
  const floatingStyles = reactExports.useMemo(() => {
    const base = adaptiveOrigin2 ? {
      position: resolvedPosition,
      [sideX]: x,
      [sideY]: y
    } : {
      position: resolvedPosition,
      ...originalFloatingStyles
    };
    if (!isPositioned) {
      base.opacity = 0;
    }
    return base;
  }, [adaptiveOrigin2, resolvedPosition, sideX, x, sideY, y, originalFloatingStyles, isPositioned]);
  const registeredPositionReferenceRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    const resolvedAnchor = typeof anchorValue === "function" ? anchorValue() : anchorValue;
    const unwrappedElement = (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
    const finalAnchor = unwrappedElement || null;
    if (finalAnchor !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(finalAnchor);
      registeredPositionReferenceRef.current = finalAnchor;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  reactExports.useEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    if (typeof anchorValue === "function") {
      return;
    }
    if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(anchorValue.current);
      registeredPositionReferenceRef.current = anchorValue.current;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  reactExports.useEffect(() => {
    if (keepMounted && mounted && elements.reference && elements.floating) {
      return autoUpdate(elements.reference, elements.floating, update, autoUpdateOptions);
    }
    return void 0;
  }, [keepMounted, mounted, elements, update, autoUpdateOptions]);
  const renderedSide = getSide(renderedPlacement);
  const logicalRenderedSide = getLogicalSide(sideParam, renderedSide, isRtl);
  const renderedAlign = getAlignment(renderedPlacement) || "center";
  const anchorHidden = Boolean(middlewareData.hide?.referenceHidden);
  useIsoLayoutEffect(() => {
    if (lazyFlip && mounted && isPositioned) {
      setMountSide(renderedSide);
    }
  }, [lazyFlip, mounted, isPositioned, renderedSide]);
  const arrowStyles = reactExports.useMemo(() => ({
    position: "absolute",
    top: middlewareData.arrow?.y,
    left: middlewareData.arrow?.x
  }), [middlewareData.arrow]);
  const arrowUncentered = middlewareData.arrow?.centerOffset !== 0;
  return reactExports.useMemo(() => ({
    positionerStyles: floatingStyles,
    arrowStyles,
    arrowRef,
    arrowUncentered,
    side: logicalRenderedSide,
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden,
    refs,
    context,
    isPositioned,
    update
  }), [floatingStyles, arrowStyles, arrowRef, arrowUncentered, logicalRenderedSide, renderedAlign, renderedSide, anchorHidden, refs, context, isPositioned, update]);
}
function isRef(param) {
  return param != null && "current" in param;
}
function getDisabledMountTransitionStyles(transitionStatus) {
  return transitionStatus === "starting" ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}
function usePositioner(componentProps, state, {
  styles,
  transitionStatus,
  props,
  refs,
  hidden,
  inert = false
}) {
  const style = {
    ...styles
  };
  if (inert) {
    style.pointerEvents = "none";
  }
  return useRenderElement("div", componentProps, {
    state,
    ref: refs,
    props: [{
      role: "presentation",
      hidden,
      style
    }, getDisabledMountTransitionStyles(transitionStatus), props],
    stateAttributesMapping: popupStateMapping
  });
}
const VIEWPORT_WIDTH_TOLERANCE_PX = 20;
function useAnchoredPopupScrollLock(enabled, touchOpen, positionerElement, referenceElement) {
  const [touchOpenShouldLockScroll, setTouchOpenShouldLockScroll] = reactExports.useState(false);
  useIsoLayoutEffect(() => {
    if (!enabled || !touchOpen || positionerElement == null) {
      setTouchOpenShouldLockScroll(false);
      return;
    }
    const viewportWidth = ownerDocument(positionerElement).documentElement.clientWidth;
    const popupWidth = positionerElement.offsetWidth;
    setTouchOpenShouldLockScroll(viewportWidth > 0 && popupWidth > 0 && popupWidth >= viewportWidth - VIEWPORT_WIDTH_TOLERANCE_PX);
  }, [enabled, touchOpen, positionerElement]);
  useScrollLock(enabled && (!touchOpen || touchOpenShouldLockScroll), referenceElement);
}
const PopoverPositioner = /* @__PURE__ */ reactExports.forwardRef(function PopoverPositioner2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    anchor,
    positionMethod = "absolute",
    side = "bottom",
    align = "center",
    sideOffset = 0,
    alignOffset = 0,
    collisionBoundary = "clipping-ancestors",
    collisionPadding = 5,
    arrowPadding = 5,
    sticky = false,
    disableAnchorTracking = false,
    collisionAvoidance = POPUP_COLLISION_AVOIDANCE,
    ...elementProps
  } = componentProps;
  const {
    store
  } = usePopoverRootContext();
  const keepMounted = usePopoverPortalContext();
  const nodeId = useFloatingNodeId();
  const floatingRootContext = store.useState("floatingRootContext");
  const mounted = store.useState("mounted");
  const open = store.useState("open");
  const openReason = store.useState("openChangeReason");
  const triggerElement = store.useState("activeTriggerElement");
  const modal = store.useState("modal");
  const openMethod = store.useState("openMethod");
  const positionerElement = store.useState("positionerElement");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const hasViewport = store.useState("hasViewport");
  const prevTriggerElementRef = reactExports.useRef(null);
  const runOnceAnimationsFinish = useAnimationsFinished(positionerElement, false, false);
  const positioning = useAnchorPositioning({
    anchor,
    floatingRootContext,
    positionMethod,
    mounted,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    disableAnchorTracking,
    keepMounted,
    nodeId,
    collisionAvoidance,
    adaptiveOrigin: hasViewport ? adaptiveOrigin : void 0
  });
  const domReference = floatingRootContext.useState("domReferenceElement");
  useIsoLayoutEffect(() => {
    const currentTriggerElement = domReference;
    const prevTriggerElement = prevTriggerElementRef.current;
    if (currentTriggerElement) {
      prevTriggerElementRef.current = currentTriggerElement;
    }
    if (prevTriggerElement && currentTriggerElement && currentTriggerElement !== prevTriggerElement) {
      store.set("instantType", void 0);
      const ac = new AbortController();
      runOnceAnimationsFinish(() => {
        store.set("instantType", "trigger-change");
      }, ac.signal);
      return () => {
        ac.abort();
      };
    }
    return void 0;
  }, [domReference, runOnceAnimationsFinish, store]);
  useAnchoredPopupScrollLock(open && modal === true && openReason !== triggerHover, openMethod === "touch", positionerElement, triggerElement);
  const setPositionerElement = reactExports.useCallback((element2) => {
    store.set("positionerElement", element2);
  }, [store]);
  const state = {
    open,
    side: positioning.side,
    align: positioning.align,
    anchorHidden: positioning.anchorHidden,
    instant: instantType
  };
  const element = usePositioner(componentProps, state, {
    styles: positioning.positionerStyles,
    transitionStatus,
    props: elementProps,
    refs: [forwardedRef, setPositionerElement],
    hidden: !mounted,
    inert: !open
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(PopoverPositionerContext.Provider, {
    value: positioning,
    children: [mounted && modal === true && openReason !== triggerHover && /* @__PURE__ */ jsxRuntimeExports.jsx(InternalBackdrop, {
      ref: store.context.internalBackdropRef,
      inert: inertValue(!open),
      cutout: triggerElement
    }), /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingNode, {
      id: nodeId,
      children: element
    })]
  });
});
const ToolbarRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useToolbarRootContext(optional) {
  const context = reactExports.useContext(ToolbarRootContext);
  return context;
}
const ClosePartContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useClosePartCount() {
  const [closePartCount, setClosePartCount] = reactExports.useState(0);
  const register = useStableCallback(() => {
    setClosePartCount((count) => count + 1);
    return () => {
      setClosePartCount((count) => Math.max(0, count - 1));
    };
  });
  const context = reactExports.useMemo(() => ({
    register
  }), [register]);
  return {
    context,
    hasClosePart: closePartCount > 0
  };
}
function ClosePartProvider(props) {
  const {
    value,
    children
  } = props;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ClosePartContext.Provider, {
    value,
    children
  });
}
const stateAttributesMapping$1 = {
  ...popupStateMapping,
  ...transitionStatusMapping
};
const PopoverPopup = /* @__PURE__ */ reactExports.forwardRef(function PopoverPopup2(componentProps, forwardedRef) {
  const {
    render,
    className,
    style,
    initialFocus,
    finalFocus,
    ...elementProps
  } = componentProps;
  const {
    store
  } = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const insideToolbar = useToolbarRootContext() != null;
  const {
    context: closePartContext,
    hasClosePart
  } = useClosePartCount();
  const open = store.useState("open");
  const openMethod = store.useState("openMethod");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const popupProps = store.useState("popupProps");
  const titleId = store.useState("titleElementId");
  const descriptionId = store.useState("descriptionElementId");
  const modal = store.useState("modal");
  const mounted = store.useState("mounted");
  const openReason = store.useState("openChangeReason");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const floatingContext = store.useState("floatingRootContext");
  const floatingId = floatingContext.useState("floatingId");
  const disabled = store.useState("disabled");
  const openOnHover = store.useState("openOnHover");
  const closeDelay = store.useState("closeDelay");
  const popupId = elementProps.id ?? floatingId;
  useOpenChangeComplete({
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (open) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  useHoverFloatingInteraction(floatingContext, {
    enabled: openOnHover && !disabled,
    closeDelay
  });
  const resolvedInitialFocus = initialFocus === void 0 ? createDefaultInitialFocus(store.context.popupRef) : initialFocus;
  const focusManagerModal = modal !== false && hasClosePart;
  store.useSyncedValue("focusManagerModal", focusManagerModal);
  const setPopupElement = reactExports.useCallback((element2) => {
    store.set("popupElement", element2);
  }, [store]);
  const state = {
    open,
    side: positioner.side,
    align: positioner.align,
    instant: instantType,
    transitionStatus
  };
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, store.context.popupRef, setPopupElement],
    props: [popupProps, {
      id: popupId,
      role: "dialog",
      ...FOCUSABLE_POPUP_PROPS,
      "aria-labelledby": titleId,
      "aria-describedby": descriptionId,
      onKeyDown(event) {
        if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }
    }, getDisabledMountTransitionStyles(transitionStatus), elementProps],
    stateAttributesMapping: stateAttributesMapping$1
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingFocusManager, {
    context: floatingContext,
    openInteractionType: openMethod,
    modal: focusManagerModal,
    disabled: !mounted || openReason === triggerHover,
    initialFocus: resolvedInitialFocus,
    returnFocus: finalFocus,
    restoreFocus: "popup",
    previousFocusableElement: isHTMLElement(activeTriggerElement) ? activeTriggerElement : void 0,
    nextFocusableElement: store.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(ClosePartProvider, {
      value: closePartContext,
      children: element
    })
  });
});
const AvatarRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useAvatarRootContext() {
  const context = reactExports.useContext(AvatarRootContext);
  if (context === void 0) {
    throw new Error(formatErrorMessage(13));
  }
  return context;
}
const avatarStateAttributesMapping = {
  imageLoadingStatus: () => null
};
const AvatarRoot = /* @__PURE__ */ reactExports.forwardRef(function AvatarRoot2(componentProps, forwardedRef) {
  const {
    className,
    render,
    style,
    ...elementProps
  } = componentProps;
  const [imageLoadingStatus, setImageLoadingStatus] = reactExports.useState("idle");
  const state = {
    imageLoadingStatus
  };
  const contextValue = reactExports.useMemo(() => ({
    imageLoadingStatus,
    setImageLoadingStatus
  }), [imageLoadingStatus, setImageLoadingStatus]);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: avatarStateAttributesMapping
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarRootContext.Provider, {
    value: contextValue,
    children: element
  });
});
function useImageLoadingStatus(src, {
  referrerPolicy,
  crossOrigin,
  sizes,
  srcSet
}) {
  const [loadingStatus, setLoadingStatus] = reactExports.useState("idle");
  useIsoLayoutEffect(() => {
    if (!src && !srcSet) {
      setLoadingStatus("error");
      return NOOP;
    }
    let isMounted = true;
    const image = new window.Image();
    const updateStatus = (status) => () => {
      if (!isMounted) {
        return;
      }
      setLoadingStatus(status);
    };
    setLoadingStatus("loading");
    image.onload = updateStatus("loaded");
    image.onerror = updateStatus("error");
    if (referrerPolicy) {
      image.referrerPolicy = referrerPolicy;
    }
    image.crossOrigin = crossOrigin ?? null;
    if (sizes) {
      image.sizes = sizes;
    }
    if (srcSet) {
      image.srcset = srcSet;
    }
    if (src) {
      image.src = src;
    }
    if (image.complete) {
      setLoadingStatus(image.naturalWidth > 0 ? "loaded" : "error");
    }
    return () => {
      isMounted = false;
    };
  }, [src, srcSet, sizes, crossOrigin, referrerPolicy]);
  return loadingStatus;
}
const stateAttributesMapping = {
  ...avatarStateAttributesMapping,
  ...transitionStatusMapping
};
const AvatarImage = /* @__PURE__ */ reactExports.forwardRef(function AvatarImage2(componentProps, forwardedRef) {
  const {
    className,
    render,
    onLoadingStatusChange: onLoadingStatusChangeProp,
    style,
    ...elementProps
  } = componentProps;
  const {
    setImageLoadingStatus
  } = useAvatarRootContext();
  const imageLoadingStatus = useImageLoadingStatus(elementProps.src, elementProps);
  const isVisible = imageLoadingStatus === "loaded";
  const {
    mounted,
    transitionStatus,
    setMounted
  } = useTransitionStatus(isVisible);
  const imageRef = reactExports.useRef(null);
  const handleLoadingStatusChange = useStableCallback((status) => {
    onLoadingStatusChangeProp?.(status);
    setImageLoadingStatus(status);
  });
  useIsoLayoutEffect(() => {
    if (imageLoadingStatus !== "idle") {
      handleLoadingStatusChange(imageLoadingStatus);
    }
  }, [imageLoadingStatus, handleLoadingStatusChange]);
  useIsoLayoutEffect(() => {
    return () => setImageLoadingStatus("idle");
  }, [setImageLoadingStatus]);
  useOpenChangeComplete({
    open: isVisible,
    ref: imageRef,
    onComplete() {
      if (!isVisible) {
        setMounted(false);
      }
    }
  });
  const state = {
    imageLoadingStatus,
    transitionStatus
  };
  const element = useRenderElement("img", componentProps, {
    state,
    ref: [forwardedRef, imageRef],
    props: elementProps,
    stateAttributesMapping,
    enabled: mounted
  });
  if (!mounted) {
    return null;
  }
  return element;
});
const AvatarFallback = /* @__PURE__ */ reactExports.forwardRef(function AvatarFallback2(componentProps, forwardedRef) {
  const {
    className,
    render,
    delay,
    style,
    ...elementProps
  } = componentProps;
  const {
    imageLoadingStatus
  } = useAvatarRootContext();
  const [delayPassed, setDelayPassed] = reactExports.useState(delay === void 0);
  const timeout = useTimeout();
  reactExports.useEffect(() => {
    if (delay !== void 0) {
      timeout.start(delay, () => setDelayPassed(true));
    } else {
      setDelayPassed(true);
    }
    return timeout.clear;
  }, [timeout, delay]);
  const state = {
    imageLoadingStatus
  };
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: avatarStateAttributesMapping,
    enabled: imageLoadingStatus !== "loaded" && (delay === void 0 || delayPassed)
  });
  return element;
});
let FieldControlDataAttributes = /* @__PURE__ */ (function(FieldControlDataAttributes2) {
  FieldControlDataAttributes2["disabled"] = "data-disabled";
  FieldControlDataAttributes2["valid"] = "data-valid";
  FieldControlDataAttributes2["invalid"] = "data-invalid";
  FieldControlDataAttributes2["touched"] = "data-touched";
  FieldControlDataAttributes2["dirty"] = "data-dirty";
  FieldControlDataAttributes2["filled"] = "data-filled";
  FieldControlDataAttributes2["focused"] = "data-focused";
  return FieldControlDataAttributes2;
})({});
const DEFAULT_VALIDITY_STATE = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: null,
  valueMissing: false
};
const DEFAULT_FIELD_STATE_ATTRIBUTES = {
  valid: null,
  touched: false,
  dirty: false,
  filled: false,
  focused: false
};
const DEFAULT_FIELD_ROOT_STATE = {
  disabled: false,
  ...DEFAULT_FIELD_STATE_ATTRIBUTES
};
const fieldValidityMapping = {
  valid(value) {
    if (value === null) {
      return null;
    }
    if (value) {
      return {
        [FieldControlDataAttributes.valid]: ""
      };
    }
    return {
      [FieldControlDataAttributes.invalid]: ""
    };
  }
};
const DEFAULT_FIELD_ROOT_CONTEXT = {
  invalid: void 0,
  name: void 0,
  validityData: {
    state: DEFAULT_VALIDITY_STATE,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: NOOP,
  disabled: void 0,
  touched: DEFAULT_FIELD_STATE_ATTRIBUTES.touched,
  setTouched: NOOP,
  dirty: DEFAULT_FIELD_STATE_ATTRIBUTES.dirty,
  setDirty: NOOP,
  filled: DEFAULT_FIELD_STATE_ATTRIBUTES.filled,
  setFilled: NOOP,
  focused: DEFAULT_FIELD_STATE_ATTRIBUTES.focused,
  setFocused: NOOP,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => false,
  state: DEFAULT_FIELD_ROOT_STATE,
  markedDirtyRef: {
    current: false
  },
  registerFieldControl: NOOP,
  validation: {
    getValidationProps: (_disabled, props = EMPTY_OBJECT) => props,
    inputRef: {
      current: null
    },
    registerInput: NOOP,
    commit: async () => {
    },
    change: NOOP
  }
};
const FieldRootContext = /* @__PURE__ */ reactExports.createContext(DEFAULT_FIELD_ROOT_CONTEXT);
function useFieldRootContext(optional = true) {
  const context = reactExports.useContext(FieldRootContext);
  if (context.setValidityData === NOOP && !optional) {
    throw new Error(formatErrorMessage(28));
  }
  return context;
}
const FormContext = /* @__PURE__ */ reactExports.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: NOOP,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: false
  }
});
function useFormContext() {
  return reactExports.useContext(FormContext);
}
const LabelableContext = /* @__PURE__ */ reactExports.createContext({
  controlId: void 0,
  registerControlId: NOOP,
  labelId: void 0,
  setLabelId: NOOP,
  messageIds: [],
  setMessageIds: NOOP,
  getDescriptionProps: (externalProps) => externalProps
});
function useLabelableContext() {
  return reactExports.useContext(LabelableContext);
}
function useLabelableId(params = {}) {
  const {
    id,
    implicit = false,
    controlRef
  } = params;
  const {
    controlId,
    registerControlId
  } = useLabelableContext();
  const defaultId = useBaseUiId(id);
  const controlIdForEffect = implicit ? controlId : void 0;
  const controlSourceRef = useRefWithInit(() => /* @__PURE__ */ Symbol("labelable-control"));
  const hasRegisteredRef = reactExports.useRef(false);
  const hadExplicitIdRef = reactExports.useRef(id != null);
  const unregisterControlId = useStableCallback(() => {
    if (!hasRegisteredRef.current || registerControlId === NOOP) {
      return;
    }
    hasRegisteredRef.current = false;
    registerControlId(controlSourceRef.current, void 0);
  });
  useIsoLayoutEffect(() => {
    if (registerControlId === NOOP) {
      return void 0;
    }
    let nextId;
    if (implicit) {
      const elem = controlRef?.current;
      if (isElement(elem) && elem.closest("label") != null) {
        nextId = id ?? null;
      } else {
        nextId = controlIdForEffect ?? defaultId;
      }
    } else if (id != null) {
      hadExplicitIdRef.current = true;
      nextId = id;
    } else if (hadExplicitIdRef.current) {
      nextId = defaultId;
    } else {
      unregisterControlId();
      return void 0;
    }
    if (nextId === void 0) {
      unregisterControlId();
      return void 0;
    }
    hasRegisteredRef.current = true;
    registerControlId(controlSourceRef.current, nextId);
    return void 0;
  }, [id, controlRef, controlIdForEffect, registerControlId, implicit, defaultId, controlSourceRef, unregisterControlId]);
  reactExports.useEffect(() => {
    return unregisterControlId;
  }, [unregisterControlId]);
  return controlId ?? defaultId;
}
function useRegisterFieldControl(controlRef, id, value, getFormValueOverride, enabled = true, name) {
  const {
    registerFieldControl
  } = useFieldRootContext();
  const sourceRef = reactExports.useRef(null);
  if (!sourceRef.current) {
    sourceRef.current = /* @__PURE__ */ Symbol();
  }
  useIsoLayoutEffect(() => {
    const source = sourceRef.current;
    if (!source || !enabled) {
      return void 0;
    }
    const registration = {
      controlRef,
      getValue: getFormValueOverride,
      id,
      name,
      value
    };
    registerFieldControl(source, registration);
    return () => {
      registerFieldControl(source, void 0);
    };
  }, [controlRef, enabled, getFormValueOverride, id, name, registerFieldControl, value]);
}
const FieldControl = /* @__PURE__ */ reactExports.forwardRef(function FieldControl2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    name: nameProp,
    value: valueProp,
    disabled: disabledProp = false,
    onValueChange,
    defaultValue,
    autoFocus = false,
    style,
    ...elementProps
  } = componentProps;
  const {
    state: fieldState,
    name: fieldName,
    disabled: fieldDisabled,
    setTouched,
    setDirty,
    validityData,
    setFocused,
    setFilled,
    validationMode,
    validation
  } = useFieldRootContext();
  const {
    clearErrors
  } = useFormContext();
  const disabled = fieldDisabled || disabledProp;
  const name = fieldName ?? nameProp;
  const state = {
    ...fieldState,
    disabled
  };
  const {
    labelId
  } = useLabelableContext();
  const id = useLabelableId({
    id: idProp
  });
  useIsoLayoutEffect(() => {
    const hasExternalValue = valueProp != null;
    if (validation.inputRef.current?.value || hasExternalValue && valueProp !== "") {
      setFilled(true);
    } else if (hasExternalValue && valueProp === "") {
      setFilled(false);
    }
  }, [validation.inputRef, setFilled, valueProp]);
  const inputRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (autoFocus && inputRef.current === activeElement(ownerDocument(inputRef.current))) {
      setFocused(true);
    }
  }, [autoFocus, setFocused]);
  const [valueUnwrapped] = useControlled({
    controlled: valueProp,
    default: defaultValue,
    name: "FieldControl",
    state: "value"
  });
  const isControlled = valueProp !== void 0;
  const value = isControlled ? valueUnwrapped : void 0;
  const getValueFromInput = useStableCallback(() => validation.inputRef.current?.value);
  useRegisterFieldControl(validation.inputRef, id, value, getValueFromInput, !disabled, nameProp);
  const element = useRenderElement("input", componentProps, {
    ref: [forwardedRef, inputRef],
    state,
    props: [{
      id,
      disabled,
      name,
      ref: validation.inputRef,
      "aria-labelledby": labelId,
      autoFocus,
      ...isControlled ? {
        value
      } : {
        defaultValue
      },
      onChange(event) {
        const inputValue = event.currentTarget.value;
        onValueChange?.(inputValue, createChangeEventDetails(none, event.nativeEvent));
        setDirty(inputValue !== validityData.initialValue);
        setFilled(inputValue !== "");
        if (!event.nativeEvent.defaultPrevented) {
          clearErrors(name);
          validation.change(inputValue);
        }
      },
      onFocus() {
        setFocused(true);
      },
      onBlur(event) {
        setTouched(true);
        setFocused(false);
        if (validationMode === "onBlur") {
          validation.commit(event.currentTarget.value);
        }
      },
      onKeyDown(event) {
        if (event.currentTarget.tagName === "INPUT" && event.key === "Enter") {
          setTouched(true);
          validation.commit(event.currentTarget.value);
        }
      }
    }, elementProps, (props) => validation.getValidationProps(disabled, props)],
    stateAttributesMapping: fieldValidityMapping
  });
  return element;
});
const Input = /* @__PURE__ */ reactExports.forwardRef(function Input2(props, forwardedRef) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FieldControl, {
    ref: forwardedRef,
    ...props
  });
});
export {
  AvatarRoot as A,
  Button as B,
  DialogRoot as D,
  Input as I,
  PopoverRoot as P,
  PopoverTrigger as a,
  PopoverPortal as b,
  PopoverPositioner as c,
  PopoverPopup as d,
  AvatarImage as e,
  AvatarFallback as f,
  DialogPopup as g,
  DialogClose as h,
  DialogTitle as i,
  DialogDescription as j,
  DialogPortal as k,
  DialogBackdrop as l,
  mergeProps as m,
  useRender as u
};
