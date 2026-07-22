let ReactiveFlags = /* @__PURE__ */ (function(ReactiveFlags2) {
  ReactiveFlags2[ReactiveFlags2["None"] = 0] = "None";
  ReactiveFlags2[ReactiveFlags2["Mutable"] = 1] = "Mutable";
  ReactiveFlags2[ReactiveFlags2["Watching"] = 2] = "Watching";
  ReactiveFlags2[ReactiveFlags2["RecursedCheck"] = 4] = "RecursedCheck";
  ReactiveFlags2[ReactiveFlags2["Recursed"] = 8] = "Recursed";
  ReactiveFlags2[ReactiveFlags2["Dirty"] = 16] = "Dirty";
  ReactiveFlags2[ReactiveFlags2["Pending"] = 32] = "Pending";
  return ReactiveFlags2;
})({});
// @__NO_SIDE_EFFECTS__
function createReactiveSystem({ update, notify, unwatched }) {
  return {
    link: link2,
    unlink: unlink2,
    propagate: propagate2,
    checkDirty: checkDirty2,
    shallowPropagate: shallowPropagate2
  };
  function link2(dep, sub, version) {
    const prevDep = sub.depsTail;
    if (prevDep !== void 0 && prevDep.dep === dep) return;
    const nextDep = prevDep !== void 0 ? prevDep.nextDep : sub.deps;
    if (nextDep !== void 0 && nextDep.dep === dep) {
      nextDep.version = version;
      sub.depsTail = nextDep;
      return;
    }
    const prevSub = dep.subsTail;
    if (prevSub !== void 0 && prevSub.version === version && prevSub.sub === sub) return;
    const newLink = sub.depsTail = dep.subsTail = {
      version,
      dep,
      sub,
      prevDep,
      nextDep,
      prevSub,
      nextSub: void 0
    };
    if (nextDep !== void 0) nextDep.prevDep = newLink;
    if (prevDep !== void 0) prevDep.nextDep = newLink;
    else sub.deps = newLink;
    if (prevSub !== void 0) prevSub.nextSub = newLink;
    else dep.subs = newLink;
  }
  function unlink2(link3, sub = link3.sub) {
    const dep = link3.dep;
    const prevDep = link3.prevDep;
    const nextDep = link3.nextDep;
    const nextSub = link3.nextSub;
    const prevSub = link3.prevSub;
    if (nextDep !== void 0) nextDep.prevDep = prevDep;
    else sub.depsTail = prevDep;
    if (prevDep !== void 0) prevDep.nextDep = nextDep;
    else sub.deps = nextDep;
    if (nextSub !== void 0) nextSub.prevSub = prevSub;
    else dep.subsTail = prevSub;
    if (prevSub !== void 0) prevSub.nextSub = nextSub;
    else if ((dep.subs = nextSub) === void 0) unwatched(dep);
    return nextDep;
  }
  function propagate2(link3) {
    let next = link3.nextSub;
    let stack;
    top: do {
      const sub = link3.sub;
      let flags = sub.flags;
      if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed | ReactiveFlags.Dirty | ReactiveFlags.Pending))) sub.flags = flags | ReactiveFlags.Pending;
      else if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed))) flags = ReactiveFlags.None;
      else if (!(flags & ReactiveFlags.RecursedCheck)) sub.flags = flags & ~ReactiveFlags.Recursed | ReactiveFlags.Pending;
      else if (!(flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)) && isValidLink(link3, sub)) {
        sub.flags = flags | (ReactiveFlags.Recursed | ReactiveFlags.Pending);
        flags &= ReactiveFlags.Mutable;
      } else flags = ReactiveFlags.None;
      if (flags & ReactiveFlags.Watching) notify(sub);
      if (flags & ReactiveFlags.Mutable) {
        const subSubs = sub.subs;
        if (subSubs !== void 0) {
          const nextSub = (link3 = subSubs).nextSub;
          if (nextSub !== void 0) {
            stack = {
              value: next,
              prev: stack
            };
            next = nextSub;
          }
          continue;
        }
      }
      if ((link3 = next) !== void 0) {
        next = link3.nextSub;
        continue;
      }
      while (stack !== void 0) {
        link3 = stack.value;
        stack = stack.prev;
        if (link3 !== void 0) {
          next = link3.nextSub;
          continue top;
        }
      }
      break;
    } while (true);
  }
  function checkDirty2(link3, sub) {
    let stack;
    let checkDepth = 0;
    let dirty = false;
    top: do {
      const dep = link3.dep;
      const flags = dep.flags;
      if (sub.flags & ReactiveFlags.Dirty) dirty = true;
      else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) === (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) {
        if (update(dep)) {
          const subs = dep.subs;
          if (subs.nextSub !== void 0) shallowPropagate2(subs);
          dirty = true;
        }
      } else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Pending)) === (ReactiveFlags.Mutable | ReactiveFlags.Pending)) {
        if (link3.nextSub !== void 0 || link3.prevSub !== void 0) stack = {
          value: link3,
          prev: stack
        };
        link3 = dep.deps;
        sub = dep;
        ++checkDepth;
        continue;
      }
      if (!dirty) {
        const nextDep = link3.nextDep;
        if (nextDep !== void 0) {
          link3 = nextDep;
          continue;
        }
      }
      while (checkDepth--) {
        const firstSub = sub.subs;
        const hasMultipleSubs = firstSub.nextSub !== void 0;
        if (hasMultipleSubs) {
          link3 = stack.value;
          stack = stack.prev;
        } else link3 = firstSub;
        if (dirty) {
          if (update(sub)) {
            if (hasMultipleSubs) shallowPropagate2(firstSub);
            sub = link3.sub;
            continue;
          }
          dirty = false;
        } else sub.flags &= ~ReactiveFlags.Pending;
        sub = link3.sub;
        const nextDep = link3.nextDep;
        if (nextDep !== void 0) {
          link3 = nextDep;
          continue top;
        }
      }
      return dirty;
    } while (true);
  }
  function shallowPropagate2(link3) {
    do {
      const sub = link3.sub;
      const flags = sub.flags;
      if ((flags & (ReactiveFlags.Pending | ReactiveFlags.Dirty)) === ReactiveFlags.Pending) {
        sub.flags = flags | ReactiveFlags.Dirty;
        if ((flags & (ReactiveFlags.Watching | ReactiveFlags.RecursedCheck)) === ReactiveFlags.Watching) notify(sub);
      }
    } while ((link3 = link3.nextSub) !== void 0);
  }
  function isValidLink(checkLink, sub) {
    let link3 = sub.depsTail;
    while (link3 !== void 0) {
      if (link3 === checkLink) return true;
      link3 = link3.prevDep;
    }
    return false;
  }
}
function toObserver(nextHandler, errorHandler, completionHandler) {
  const isObserver = typeof nextHandler === "object";
  const self = isObserver ? nextHandler : void 0;
  return {
    next: (isObserver ? nextHandler.next : nextHandler)?.bind(self),
    error: (isObserver ? nextHandler.error : errorHandler)?.bind(self),
    complete: (isObserver ? nextHandler.complete : completionHandler)?.bind(self)
  };
}
const queuedEffects = [];
let cycle = 0;
const { link, unlink, propagate, checkDirty, shallowPropagate } = /* @__PURE__ */ createReactiveSystem({
  update(atom) {
    return atom._update();
  },
  notify(effect2) {
    queuedEffects[queuedEffectsLength++] = effect2;
    effect2.flags &= ~ReactiveFlags.Watching;
  },
  unwatched(atom) {
    if (atom.depsTail !== void 0) {
      atom.depsTail = void 0;
      atom.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
      purgeDeps(atom);
    }
  }
});
let notifyIndex = 0;
let queuedEffectsLength = 0;
let activeSub;
let batchDepth = 0;
function batch(fn) {
  try {
    ++batchDepth;
    fn();
  } finally {
    if (!--batchDepth) flush();
  }
}
function purgeDeps(sub) {
  const depsTail = sub.depsTail;
  let dep = depsTail !== void 0 ? depsTail.nextDep : sub.deps;
  while (dep !== void 0) dep = unlink(dep, sub);
}
function flush() {
  if (batchDepth > 0) return;
  while (notifyIndex < queuedEffectsLength) {
    const effect2 = queuedEffects[notifyIndex];
    queuedEffects[notifyIndex++] = void 0;
    effect2.notify();
  }
  notifyIndex = 0;
  queuedEffectsLength = 0;
}
function createAtom(valueOrFn, options) {
  const isComputed = typeof valueOrFn === "function";
  const getter = valueOrFn;
  const atom = {
    _snapshot: isComputed ? void 0 : valueOrFn,
    subs: void 0,
    subsTail: void 0,
    deps: void 0,
    depsTail: void 0,
    flags: isComputed ? ReactiveFlags.None : ReactiveFlags.Mutable,
    get() {
      if (activeSub !== void 0) link(atom, activeSub, cycle);
      return atom._snapshot;
    },
    subscribe(observerOrFn) {
      const obs = toObserver(observerOrFn);
      const observed = { current: false };
      const e = effect(() => {
        atom.get();
        if (!observed.current) observed.current = true;
        else obs.next?.(atom._snapshot);
      });
      return { unsubscribe: () => {
        e.stop();
      } };
    },
    _update(getValue) {
      const prevSub = activeSub;
      const compare = Object.is;
      if (isComputed) {
        activeSub = atom;
        ++cycle;
        atom.depsTail = void 0;
      } else if (getValue === void 0) return false;
      if (isComputed) atom.flags = ReactiveFlags.Mutable | ReactiveFlags.RecursedCheck;
      try {
        const oldValue = atom._snapshot;
        const newValue = typeof getValue === "function" ? getValue(oldValue) : getValue === void 0 && isComputed ? getter(oldValue) : getValue;
        if (oldValue === void 0 || !compare(oldValue, newValue)) {
          atom._snapshot = newValue;
          return true;
        }
        return false;
      } finally {
        activeSub = prevSub;
        if (isComputed) atom.flags &= ~ReactiveFlags.RecursedCheck;
        purgeDeps(atom);
      }
    }
  };
  if (isComputed) {
    atom.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    atom.get = function() {
      const flags = atom.flags;
      if (flags & ReactiveFlags.Dirty || flags & ReactiveFlags.Pending && checkDirty(atom.deps, atom)) {
        if (atom._update()) {
          const subs = atom.subs;
          if (subs !== void 0) shallowPropagate(subs);
        }
      } else if (flags & ReactiveFlags.Pending) atom.flags = flags & ~ReactiveFlags.Pending;
      if (activeSub !== void 0) link(atom, activeSub, cycle);
      return atom._snapshot;
    };
  } else atom.set = function(valueOrFn2) {
    if (atom._update(valueOrFn2)) {
      const subs = atom.subs;
      if (subs !== void 0) {
        propagate(subs);
        shallowPropagate(subs);
        flush();
      }
    }
  };
  return atom;
}
function effect(fn) {
  const run = () => {
    const prevSub = activeSub;
    activeSub = effectObj;
    ++cycle;
    effectObj.depsTail = void 0;
    effectObj.flags = ReactiveFlags.Watching | ReactiveFlags.RecursedCheck;
    try {
      return fn();
    } finally {
      activeSub = prevSub;
      effectObj.flags &= ~ReactiveFlags.RecursedCheck;
      purgeDeps(effectObj);
    }
  };
  const effectObj = {
    deps: void 0,
    depsTail: void 0,
    subs: void 0,
    subsTail: void 0,
    flags: ReactiveFlags.Watching | ReactiveFlags.RecursedCheck,
    notify() {
      const flags = this.flags;
      if (flags & ReactiveFlags.Dirty || flags & ReactiveFlags.Pending && checkDirty(this.deps, this)) run();
      else this.flags = ReactiveFlags.Watching;
    },
    stop() {
      this.flags = ReactiveFlags.None;
      this.depsTail = void 0;
      purgeDeps(this);
    }
  };
  run();
  return effectObj;
}
var Store = class {
  constructor(valueOrFn, actionsFactory) {
    this.atom = createAtom(valueOrFn);
    this.get = this.get.bind(this);
    this.setState = this.setState.bind(this);
    this.subscribe = this.subscribe.bind(this);
    if (actionsFactory) this.actions = actionsFactory(this);
  }
  setState(updater) {
    this.atom.set(updater);
  }
  get state() {
    return this.atom.get();
  }
  get() {
    return this.state;
  }
  subscribe(observerOrFn) {
    return this.atom.subscribe(toObserver(observerOrFn));
  }
};
var ReadonlyStore = class {
  constructor(valueOrFn) {
    this.atom = createAtom(valueOrFn);
  }
  get state() {
    return this.atom.get();
  }
  get() {
    return this.state;
  }
  subscribe(observerOrFn) {
    return this.atom.subscribe(toObserver(observerOrFn));
  }
};
function createStore(valueOrFn, actions) {
  if (typeof valueOrFn === "function") return new ReadonlyStore(valueOrFn);
  return new Store(valueOrFn);
}
export {
  batch as b,
  createStore as c
};
