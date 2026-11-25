import React from 'react';
import { recordAudit } from './AuditTrail';

// Records every tap, switch, swipe and field filled anywhere in the app for the audit trail (services/AuditTrail.js),
// without touching each screen: the JSX functions every component is created with are wrapped once, and the handlers
// people trigger (onPress, onLongPress, onValueChange, onSwipeComplete, onSubmitEditing, onChangeText, onRefresh)
// get a thin wrapper that records the event and then calls the real handler exactly as before.
//
//   - A handler gets the same wrapper every time (WeakMap), so memoised components (React.memo) still see an
//     unchanged prop and don't re-render.
//   - A handler that is already a wrapper (passed on from a parent to a child) is not wrapped again: one tap, one entry.
//   - What was tapped is read only when it is tapped: the element's accessibilityLabel / title / label /
//     placeholder, else the text inside it, else its icon's name.
//   - Fields: one entry per field once typing stops (TYPING_PAUSE_MS), with the value — never for a password / PIN /
//     OTP field (secureTextEntry, or such a name): those say only "(hidden)".
//   - Recording must never break a tap: every step of it is wrapped in try / catch, and the real handler always runs.
// Imported once, first thing in App.js.

const TAP_PROPS = { onPress: 'tapped', onLongPress: 'long-pressed', onSwipeComplete: 'swiped', onSubmitEditing: 'submitted', onRefresh: 'pulled to refresh' };
const TYPING_PAUSE_MS = 1500;
// Identity numbers (Aadhaar, the number on a joining document) are never put into the audit trail either
const SECRET = /pass|pin\b|pincode|otp|cvv|secret|security code|verification code|aadha+r|document number/i;
const MARK = '__auditWrapped';

const handlers = new WeakMap(); // real handler -> { wrapper, meta: { type, props } }

const typeName = (type) => (typeof type === 'string' ? type : type?.displayName || type?.name || '');
const prettyName = (name) => String(name || '').replace(/Icon$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

// Text inside an element (strings, numbers, nested elements), first MAX_TEXT characters
const MAX_TEXT = 80;
const textOf = (node, out = [], depth = 0) => {
  if (node == null || typeof node === 'boolean' || depth > 12 || out.join(' ').length > MAX_TEXT) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    const t = String(node).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  } else if (Array.isArray(node)) {
    node.forEach((n) => textOf(n, out, depth + 1));
  } else if (node.props) {
    textOf(node.props.children, out, depth + 1);
  }
  return out;
};
// First icon (or other component) inside, when there is no text: "tapped a button (Chevron Left)"
const iconOf = (node, depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 6) return '';
  if (Array.isArray(node)) { for (const n of node) { const r = iconOf(n, depth + 1); if (r) return r; } return ''; }
  const name = typeName(node.type);
  if (name && !/^(View|Text|RCT|Animated|Fragment)/.test(name) && typeof node.type !== 'string') return prettyName(name);
  return iconOf(node.props?.children, depth + 1);
};

// Its own name (accessibilityLabel, title …) or the text inside it; '' when it has neither
const namedOf = (props) => {
  const own = props.accessibilityLabel || props.title || props.label || props.placeholder || props.name;
  if (own && typeof own === 'string') return own.trim().slice(0, MAX_TEXT);
  return textOf(props.children).join(' ').slice(0, MAX_TEXT);
};

const labelOf = ({ type, props }) => {
  const named = namedOf(props);
  if (named) return named;
  const icon = iconOf(props.children);
  const comp = prettyName(typeName(type));
  return icon ? `a button (${icon})` : comp && !/^(Touchable|Pressable|Button)/.test(comp) ? comp : 'a button';
};

const secretField = (props) => !!props.secureTextEntry
  || [props.placeholder, props.accessibilityLabel, props.label, props.name, props.textContentType, props.autoComplete]
    .some((v) => typeof v === 'string' && SECRET.test(v));

const wrapperFor = (fn, prop, meta) => {
  const known = handlers.get(fn);
  if (known) { known.meta.current = meta; return known.wrapper; }
  const box = { current: meta };
  let typingTimer = null;
  let lastValue = '';
  const wrapper = function auditWrapped(...args) {
    try {
      const m = box.current;
      if (prop === 'onChangeText') {
        lastValue = String(args[0] ?? '');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          try {
            recordAudit(`filled "${namedOf(m.props) || 'a field'}"`, { Value: secretField(m.props) ? '(hidden)' : lastValue.slice(0, 300) });
          } catch (_) { /* never breaks typing */ }
        }, TYPING_PAUSE_MS);
      } else if (prop === 'onValueChange') {
        const v = args[0];
        recordAudit(`changed "${labelOf(m)}"`, { Value: typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v ?? '').slice(0, 300) });
      } else {
        recordAudit(`${TAP_PROPS[prop]} "${labelOf(m)}"`);
      }
    } catch (_) { /* never breaks the tap */ }
    return fn.apply(this, args);
  };
  wrapper[MARK] = true;
  handlers.set(fn, { wrapper, meta: box });
  return wrapper;
};

const WATCHED = [...Object.keys(TAP_PROPS), 'onValueChange', 'onChangeText'];

const withAudit = (type, props) => {
  if (!props || typeof props !== 'object') return props;
  let out = props;
  for (const prop of WATCHED) {
    const fn = props[prop];
    if (typeof fn !== 'function' || fn[MARK]) continue;
    if (out === props) out = { ...props };
    out[prop] = wrapperFor(fn, prop, { type, props });
  }
  return out;
};

let installed = false;
export const installTapRecorder = () => {
  if (installed) return;
  installed = true;
  const patch = (mod, names) => {
    if (!mod) return;
    for (const name of names) {
      const real = mod[name];
      if (typeof real !== 'function' || real[MARK]) continue;
      const patched = function (type, props, ...rest) {
        let p = props;
        try { p = withAudit(type, props); } catch (_) { p = props; }
        return real.call(this, type, p, ...rest);
      };
      patched[MARK] = true;
      try { mod[name] = patched; } catch (_) { /* read-only: that path is not recorded */ }
    }
  };
  try { patch(require('react/jsx-runtime'), ['jsx', 'jsxs']); } catch (_) {}
  try { patch(require('react/jsx-dev-runtime'), ['jsxDEV']); } catch (_) {}
  try { patch(React, ['createElement']); } catch (_) {}
};

// For tests
export const __withAudit = withAudit;
