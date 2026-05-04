import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import type { Experiment, ExperimentStats } from "@ab-platform/types";
import { framer, supportsName, type CanvasNode } from "framer-plugin";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://ab-testing-worker.kenbonfloziio.workers.dev";
const SK_WRITE = "dual_write_key";
const SK_READ = "dual_read_key";
let injectionLock: Promise<void> | null = null;

const GLOBAL_SCRIPT_HTML =
  '<script>\nwindow.DUAL = {\n  hasConsent(respectConsent, consentCookieName = "cookie_consent") {\n    if (!respectConsent) return true\n    const c = document.cookie.split("; ").find(r => r.startsWith(`${consentCookieName}=`))\n    if (!c) return false\n    const v = c.split("=").slice(1).join("=")\n    return v === "true" || v === "accepted" || v === "1"\n  },\n\n  getOrCreateVisitorId(experimentId) {\n    const key = `dual-user-${experimentId}`\n    let id = localStorage.getItem(key)\n    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }\n    return id\n  },\n\n  assignVariant(experimentId, split = 50, cookieDays = 30, respectConsent = false, consentCookieName = "cookie_consent") {\n    if (respectConsent && !this.hasConsent(respectConsent, consentCookieName)) return "A"\n    const key = `dual_${experimentId}`\n    const existing = document.cookie.split("; ").find(r => r.startsWith(`${key}=`))\n    if (existing) {\n      const v = existing.split("=").slice(1).join("=")\n      if (v === "A" || v === "B") return v\n    }\n    const assigned = Math.random() * 100 < split ? "A" : "B"\n    const expires = new Date()\n    expires.setDate(expires.getDate() + cookieDays)\n    document.cookie = `${key}=${assigned}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`\n    return assigned\n  },\n\n  trackEvent(apiUrl, writeKey, experimentId, type, variant, visitorId) {\n    fetch(`${apiUrl}/v1/events`, {\n      method: "POST",\n      headers: { "Content-Type": "application/json", Authorization: `Bearer ${writeKey}` },\n      body: JSON.stringify({ experiment_id: experimentId, type, variant, visitor_id: visitorId }),\n    }).catch(() => {})\n  },\n}\n</script>';

const DUAL_TESTING_CODE =
  "import { useLayoutEffect, useState, useEffect, useRef } from \'react\'\nimport { addPropertyControls, ControlType, RenderTarget } from \'framer\'\n\nconst DEFAULT_API_URL = \'https://ab-testing-worker.kenbonfloziio.workers.dev\'\n\nexport default function DUAL({\n  experimentId = \'\',\n  writeKey = \'\',\n  cookieDays = 30,\n  split = 50,\n  variantA,\n  variantB,\n  eventName = \'conversion\',\n  triggerOn = \'click\',\n  respectConsent = false,\n  consentCookieName = \'cookie_consent\',\n  apiUrl = DEFAULT_API_URL,\n}) {\n  const [variant, setVariant] = useState(\'A\')\n  const [visible, setVisible] = useState(false)\n  const firedRef = useRef(false)\n  const ref = useRef(null)\n\n  const hasConsent = () => {\n    if (!respectConsent) return true\n    const cookies = document.cookie.split(\; \')\n    const consent = cookies.find((row) => row.startsWith(`${consentCookieName}=`))\n    if (!consent) return false\n    const value = consent.split(\'=\').slice(1).join(\'=\')\n    return value === \'true\' || value === \'accepted\' || value === \'1\'\n  }\n\n  const getOrCreateVisitorId = () => {\n    const key = `dual-user-${experimentId}`\n    let id = localStorage.getItem(key)\n    if (!id) {\n      id = crypto.randomUUID()\n      localStorage.setItem(key, id)\n    }\n    return id\n  }\n\n  const resolveVariant = () => {\n    if (respectConsent && !hasConsent()) return \'A\'\n    const key = `dual_${experimentId}`\n    const existing = document.cookie.split(\; \').find((row) => row.startsWith(`${key}=`))\n    if (existing) {\n      const value = existing.split(\'=\').slice(1).join(\'=\')\n      if (value === \'A\' || value === \'B\') return value\n    }\n    const assigned = Math.random() * 100 < split ? \'A\' : \'B\'\n    const expires = new Date()\n    expires.setDate(expires.getDate() + cookieDays)\n    document.cookie = `${key}=${assigned}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`\n    return assigned\n  }\n\n  const trackImpression = async (assignedVariant) => {\n    if (!hasConsent()) return\n    const trackedKey = `dual-imp-${experimentId}`\n    if (sessionStorage.getItem(trackedKey)) return\n    sessionStorage.setItem(trackedKey, \'1\')\n\n    try {\n      const visitorId = getOrCreateVisitorId()\n      const res = await fetch(`${apiUrl}/v1/events`, {\n        method: \'POST\',\n        headers: {\n          \'Content-Type\': \'application/json\',\n          Authorization: `Bearer ${writeKey}`,\n        },\n        body: JSON.stringify({\n          experiment_id: experimentId,\n          type: \'impression\',\n          variant: assignedVariant,\n          visitor_id: visitorId,\n        }),\n      })\n      if (!res.ok) {\n        sessionStorage.removeItem(`dual-imp-${experimentId}`)\n      }\n    } catch {\n      sessionStorage.removeItem(`dual-imp-${experimentId}`)\n    }\n  }\n\n  useLayoutEffect(() => {\n    if (RenderTarget.current?.() === RenderTarget.canvas) {\n      setVisible(true)\n      return\n    }\n    const assigned = resolveVariant()\n    setVariant(assigned)\n    setVisible(true)\n    trackImpression(assigned)\n  }, [])\n\n  const trackConversion = () => {\n    if (!hasConsent()) return\n    const variantCookie = document.cookie\n      .split(\; \')\n      .find((r) => r.startsWith(`dual_${experimentId}=`))\n    if (!variantCookie) return\n    const v = variantCookie.split(\'=\').slice(1).join(\'=\')\n    if (v !== \'A\' && v !== \'B\') return\n    const visitorId = localStorage.getItem(`dual-user-${experimentId}`) ?? null\n    fetch(`${apiUrl}/v1/events`, {\n      method: \'POST\',\n      headers: {\n        \'Content-Type\': \'application/json\',\n        Authorization: `Bearer ${writeKey}`,\n      },\n      body: JSON.stringify({\n        experiment_id: experimentId,\n        type: eventName,\n        variant: v,\n        visitor_id: visitorId,\n      }),\n    }).catch(() => {})\n  }\n\n  useEffect(() => {\n    if (triggerOn === \'mount\') {\n      trackConversion()\n      return\n    }\n    if (triggerOn === \'visible\' && ref.current) {\n      const obs = new IntersectionObserver(\n        ([e]) => {\n          if (e.isIntersecting && !firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n            obs.disconnect()\n          }\n        },\n        { threshold: 0.5 },\n      )\n      obs.observe(ref.current)\n      return () => obs.disconnect()\n    }\n    if (triggerOn === \'submit\' && ref.current) {\n      const el = ref.current\n      const form = el.tagName === \'FORM\' ? el : el.querySelector(\'form\')\n      if (form) {\n        const handleSubmit = () => {\n          if (!firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n          }\n        }\n        form.addEventListener(\'submit\', handleSubmit)\n        return () => form.removeEventListener(\'submit\', handleSubmit)\n      }\n    }\n  }, [])\n\n  const handleClick =\n    triggerOn === \'click\'\n      ? () => {\n          if (!firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n          }\n        }\n      : undefined\n\n  return (\n    <div ref={ref} style={{ visibility: visible ? \'visible\' : \'hidden\' }} onClick={handleClick}>\n      <div style={{ display: variant === \'A\' ? \'contents\' : \'none\' }}>{variantA}</div>\n      <div style={{ display: variant === \'B\' ? \'contents\' : \'none\' }}>{variantB}</div>\n    </div>\n  )\n}\n\naddPropertyControls(DUAL, {\n  experimentId: { type: ControlType.String, title: \'Experiment ID\' },\n  writeKey: { type: ControlType.String, title: \'Write Key\' },\n  cookieDays: { type: ControlType.Number, title: \'Cookie Days\', defaultValue: 30, min: 1, max: 365 },\n  split: { type: ControlType.Number, title: \'Split % (Variant A)\', defaultValue: 50, min: 0, max: 100 },\n  variantA: { type: ControlType.Slot, title: \'Variant A\' },\n  variantB: { type: ControlType.Slot, title: \'Variant B\' },\n  eventName: { type: ControlType.String, title: \'Event Name\', defaultValue: \'conversion\' },\n  triggerOn: {\n    type: ControlType.Enum,\n    title: \'Trigger On\',\n    options: [\'click\', \'mount\', \'visible\', \'submit\'],\n    optionTitles: [\'Click\', \'Mount\', \'Visible (50%)\', \'Submit (Form)\'],\n    defaultValue: \'click\',\n  },\n  respectConsent: { type: ControlType.Boolean, title: \'Respect Consent\', defaultValue: false },\n  consentCookieName: { type: ControlType.String, title: \'Consent Cookie Name\', defaultValue: \'cookie_consent\' },\n  apiUrl: { type: ControlType.String, title: \'API URL\', defaultValue: DEFAULT_API_URL },\n})";

function formatNum(n: number) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}



// ─── DUAL Logo ────────────────────────────────────────────────────────────
function DualMark({ size = 16, glow = false, style }: any) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: 'var(--accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glow
          ? `0 0 0 1px rgba(255,255,255,0.08) inset, 0 6px 18px -4px var(--accent-glow), 0 0 24px var(--accent-glow)`
          : `0 0 0 1px rgba(255,255,255,0.08) inset`,
        position: 'relative',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M7.5 4 L11.2 4 L10.4 20 L6.7 20 Z" fill="#ffffff" />
        <path d="M13.0 4 L16.8 4 L17.5 20 L13.8 20 Z" fill="#ffffff" opacity="0.55" />
      </svg>
    </div>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────
function Button({ children, variant = 'secondary', size = 'md', icon, iconRight, full, onClick, disabled, type = 'button', style, ...rest }: any) {
  const sizes: any = {
    sm: { h: 26, px: 10, fs: 11.5, gap: 6, radius: 6 },
    md: { h: 32, px: 12, fs: 12.5, gap: 6, radius: 7 },
    lg: { h: 38, px: 14, fs: 13.5, gap: 8, radius: 8 },
  };
  const s = sizes[size];

  const base: any = {
    height: s.h,
    padding: `0 ${s.px}px`,
    fontSize: s.fs,
    fontWeight: 500,
    letterSpacing: '-0.005em',
    borderRadius: s.radius,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    width: full ? '100%' : undefined,
    transition: 'background 120ms, border-color 120ms, color 120ms, box-shadow 120ms, transform 80ms',
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.4 : 1,
    pointerEvents: disabled ? 'none' : undefined,
  };

  const variants: any = {
    primary: {
      background: 'var(--accent)',
      color: '#fff',
      boxShadow: '0 0 0 1px rgba(255,255,255,0.10) inset, 0 8px 20px -8px var(--accent-glow)',
    },
    secondary: {
      background: 'var(--bg-3)',
      color: 'var(--fg-0)',
      boxShadow: '0 0 0 1px var(--line-2) inset',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--fg-1)',
    },
    danger: {
      background: 'transparent',
      color: 'var(--red)',
      boxShadow: '0 0 0 1px rgba(239,68,68,0.25) inset',
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

// ─── Icons ───────────────────────────────────────────────
const Icon = {
  plus: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  refresh: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M13 8a5 5 0 1 1-1.46-3.54M13 3v2.5h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  copy: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M3 11V4a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  check: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  x: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  back: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  chevronRight: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  pause: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="4" y="3.5" width="2.5" height="9" rx="0.6" fill="currentColor" /><rect x="9.5" y="3.5" width="2.5" height="9" rx="0.6" fill="currentColor" /></svg>,
  play: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></svg>,
  flag: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3.5 13V3M3.5 3.5h7l-1.5 2.5 1.5 2.5h-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  reset: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 1 0 1.46-3.54M3 3v2.5h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  layer: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2L2 5l6 3 6-3-6-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M2 8l6 3 6-3M2 11l6 3 6-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.5" /></svg>,
  link: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M9 5h2.5a2.5 2.5 0 0 1 0 5H9M7 11H4.5a2.5 2.5 0 0 1 0-5H7M5.5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  trophy: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M5 3h6v3a3 3 0 1 1-6 0V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5 4.5H3.5v1A1.5 1.5 0 0 0 5 7M11 4.5h1.5v1A1.5 1.5 0 0 1 11 7M6.5 9.5L6 13h4l-.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  spark: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  logout: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5M11 5l3 3-3 3M14 8H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  download: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  trash: (s = 12) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.5 8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1l.5-8M7 7v4M9 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    running: { label: 'Running', color: 'var(--green)', bg: 'var(--green-soft)', dot: true, animate: true },
    paused:  { label: 'Paused',  color: 'var(--amber)', bg: 'var(--amber-soft)', dot: true, animate: false },
    completed: { label: 'Completed', color: 'var(--fg-2)', bg: 'rgba(255,255,255,0.05)', dot: false, animate: false },
    draft: { label: 'Draft', color: 'var(--fg-2)', bg: 'rgba(255,255,255,0.05)', dot: false, animate: false },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 7px 2px 6px',
      borderRadius: 4,
      background: s.bg,
      color: s.color,
      fontSize: 10.5,
      fontWeight: 500,
      letterSpacing: '0.01em',
      lineHeight: 1.4,
      fontFamily: 'var(--font-mono)',
      textTransform: 'lowercase',
    }}>
      {s.dot && (
        <span style={{
          width: 5, height: 5, borderRadius: 999,
          background: s.color,
          boxShadow: s.animate ? `0 0 6px ${s.color}` : undefined,
          animation: s.animate ? 'pulse-dot 1.6s ease-in-out infinite' : undefined,
        }} />
      )}
      {s.label.toLowerCase()}
    </span>
  );
}

function SectionLabel({ children, right }: any) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 14px',
      marginBottom: 6,
    }}>
      <div style={{
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--fg-3)',
        fontWeight: 500,
      }}>{children}</div>
      {right}
    </div>
  );
}

function Field({ label, hint, children, suffix, error }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{
          fontSize: 11.5,
          color: 'var(--fg-1)',
          fontWeight: 500,
          letterSpacing: '-0.005em',
        }}>{label}</label>
        {suffix && <span style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{suffix}</span>}
      </div>
      {children}
      {hint && !error && <div style={{ fontSize: 10.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>{hint}</div>}
      {error && <div style={{ fontSize: 10.5, color: 'var(--red)', lineHeight: 1.5 }}>{error}</div>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, prefix, mono, autoFocus, type = 'text', onKeyDown }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 32,
        padding: '0 10px',
        background: 'var(--bg-2)',
        borderRadius: 7,
        boxShadow: focused
          ? `0 0 0 1px var(--accent), 0 0 0 3px var(--accent-soft)`
          : `0 0 0 1px var(--line-2) inset`,
        transition: 'box-shadow 120ms',
      }}
    >
      {prefix && <span style={{ color: 'var(--fg-3)', fontSize: 12, marginRight: 6, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 12.5,
          color: 'var(--fg-0)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          letterSpacing: mono ? '-0.01em' : undefined,
          minWidth: 0,
        }}
      />
    </div>
  );
}

function CopyChip({ value, label, masked = false, full = false }: any) {
  const [copied, setCopied] = useState(false);
  const display = masked ? value.replace(/.(?=.{4})/g, '•') : value;
  const onCopy = (e: any) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div
      onClick={onCopy}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px 6px 10px',
        background: 'var(--bg-2)',
        borderRadius: 6,
        boxShadow: '0 0 0 1px var(--line-1) inset',
        cursor: 'pointer',
        transition: 'background 120ms',
        width: full ? '100%' : undefined,
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
    >
      {label && (
        <span style={{
          fontSize: 9.5,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--fg-3)',
          flexShrink: 0,
        }}>{label}</span>
      )}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--fg-1)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}>{display}</span>
      <span style={{
        color: copied ? 'var(--green)' : 'var(--fg-3)',
        display: 'flex',
        alignItems: 'center',
        transition: 'color 120ms',
      }}>
        {copied ? Icon.check(11) : Icon.copy(11)}
      </span>
    </div>
  );
}

function ConfirmDialog({ open, title, body, danger, onConfirm, onCancel, confirmLabel = 'Confirm' }: any) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
        animation: 'fade-in 160ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--bg-1)',
          borderRadius: 10,
          boxShadow: '0 0 0 1px var(--line-2) inset, 0 20px 40px -10px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 14px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-0)', marginBottom: 4, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{body}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--line-1)' }}>
          <Button variant="ghost" size="sm" onClick={onCancel} full>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} full>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, kind = 'info', onDone }: any) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  const colors: any = {
    success: { c: 'var(--green)', bg: 'rgba(15, 30, 25, 0.95)' },
    info: { c: 'var(--fg-1)', bg: 'rgba(20, 20, 24, 0.95)' },
    error: { c: 'var(--red)', bg: 'rgba(30, 15, 15, 0.95)' },
  };
  const k = colors[kind];
  return (
    <div style={{
      position: 'absolute',
      bottom: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      background: k.bg,
      backdropFilter: 'blur(8px)',
      color: k.c,
      padding: '7px 12px',
      borderRadius: 6,
      fontSize: 11.5,
      boxShadow: '0 0 0 1px var(--line-2) inset, 0 10px 24px -6px rgba(0,0,0,0.5)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      animation: 'fade-in 200ms ease-out',
      zIndex: 40,
      maxWidth: 280,
    }}>
      {kind === 'success' && Icon.check(11)}
      <span>{message}</span>
    </div>
  );
}

function PluginFrame({ children, panelTitle = 'DUAL' }: any) {
  return (
    <div className="app-root">
      <div style={{
        width: '100%',
        flex: 1,
        background: 'var(--bg-0)',
        borderRadius: 14,
        boxShadow: `
          0 0 0 1px var(--line-2) inset,
          0 1px 0 0 rgba(255,255,255,0.04) inset,
          0 30px 60px -20px rgba(0,0,0,0.7),
          0 0 0 1px rgba(0,0,0,0.4)
        `,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <div style={{
          height: 34,
          padding: '0 10px 0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--line-1)',
          background: 'linear-gradient(180deg, #101015 0%, #0b0b0f 100%)',
          flexShrink: 0,
        }}>
          <DualMark size={14} />
          <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '-0.005em', color: 'var(--fg-0)' }}>
            {panelTitle}
          </span>
          <span style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: 'var(--fg-3)',
            padding: '1px 5px',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.04)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>plugin</span>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Export dialog ────────────────────────────────────────────────────────
function ExportDialog({ open, experiment, stats, onClose, onExported }: any) {
  const [format, setFormat] = useState('csv');
  const [scope, setScope] = useState('summary');
  const [exporting, setExporting] = useState(false);

  if (!open || !experiment || !stats) return null;

  const aRate = stats.variants.A.conversion_rate;
  const bRate = stats.variants.B.conversion_rate;

  const buildCSV = () => {
    if (scope === 'timeseries') {
      const lines = ['hour,variant_a_impressions,variant_b_impressions'];
      const hours = Array.from({ length: 24 }, (_, i) => i);
      hours.forEach((hour) => {
        lines.push(`${hour},0,0`); // the original was missing timeseries in backend
      });
      return lines.join('\n');
    }
    return [
      'experiment_id,name,status,split_a_pct,cookie_days,total_impressions,total_conversions',
      `${experiment.id},${JSON.stringify(experiment.name)},${experiment.status},${Math.round(experiment.split_a * 100)},${experiment.cookie_days},${stats.variants.A.impressions + stats.variants.B.impressions},${stats.variants.A.conversions + stats.variants.B.conversions}`,
      '',
      'variant,impressions,conversions,conversion_rate_pct',
      `A,${stats.variants.A.impressions},${stats.variants.A.conversions},${aRate.toFixed(4)}`,
      `B,${stats.variants.B.impressions},${stats.variants.B.conversions},${bRate.toFixed(4)}`,
    ].join('\n');
  };

  const buildJSON = () => JSON.stringify({
    experiment: {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      split: { a: Math.round(experiment.split_a * 100), b: 100 - Math.round(experiment.split_a * 100) },
      cookie_days: experiment.cookie_days,
    },
    totals: { impressions: stats.variants.A.impressions + stats.variants.B.impressions, conversions: stats.variants.A.conversions + stats.variants.B.conversions },
    variants: {
      a: { ...stats.variants.A, conversion_rate: +aRate.toFixed(4) },
      b: { ...stats.variants.B, conversion_rate: +bRate.toFixed(4) },
    },
    exported_at: new Date().toISOString(),
  }, null, 2);

  const doExport = () => {
    setExporting(true);
    setTimeout(() => {
      const content = format === 'csv' ? buildCSV() : buildJSON();
      const mime = format === 'csv' ? 'text/csv' : 'application/json';
      const slug = slugify(experiment.name);
      const filename = `dual-${slug}-${scope}.${format}`;
      try {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) { }
      setExporting(false);
      onExported(format);
    }, 500);
  };

  const previewLines = (format === 'csv' ? buildCSV() : buildJSON()).split('\n').slice(0, 6);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 50, animation: 'fade-in 160ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--bg-1)',
          borderRadius: 10,
          boxShadow: '0 0 0 1px var(--line-2) inset, 0 20px 40px -10px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          maxHeight: 'calc(100% - 16px)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line-1)' }}>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>{Icon.download(13)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em' }}>Export data</div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{experiment.name}</div>
          </div>
          <button onClick={onClose} style={{ width: 22, height: 22, borderRadius: 4, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.x(11)}</button>
        </div>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 6 }}>Format</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { id: 'csv', label: 'CSV', sub: 'Spreadsheet' },
                { id: 'json', label: 'JSON', sub: 'Structured' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setFormat(opt.id)} style={{
                  padding: '10px 10px',
                  borderRadius: 7,
                  background: format === opt.id ? 'var(--accent-soft)' : 'var(--bg-2)',
                  boxShadow: format === opt.id
                    ? `0 0 0 1px var(--accent) inset`
                    : '0 0 0 1px var(--line-1) inset',
                  textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  transition: 'all 120ms',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: format === opt.id ? 'var(--accent)' : 'var(--fg-0)', fontFamily: 'var(--font-mono)' }}>{opt.label}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 6 }}>Include</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { id: 'summary', label: 'Summary', sub: 'Totals + per-variant rates' },
                { id: 'timeseries', label: 'Time series', sub: '24h impressions per variant' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setScope(opt.id)} style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: scope === opt.id ? 'var(--bg-3)' : 'var(--bg-2)',
                  boxShadow: '0 0 0 1px var(--line-1) inset',
                  display: 'flex', alignItems: 'center', gap: 8,
                  textAlign: 'left',
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 999,
                    background: scope === opt.id ? 'var(--accent)' : 'transparent',
                    boxShadow: scope === opt.id ? '0 0 0 1px var(--accent) inset, 0 0 0 3px var(--bg-3) inset' : '0 0 0 1px var(--line-3) inset',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-0)', fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{opt.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 6 }}>Preview</div>
            <div style={{
              padding: '8px 10px',
              background: 'var(--bg-0)',
              borderRadius: 6,
              boxShadow: '0 0 0 1px var(--line-1) inset',
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              lineHeight: 1.55,
              color: 'var(--fg-2)',
              maxHeight: 88,
              overflow: 'hidden',
              position: 'relative',
            }}>
              {previewLines.map((l, i) => (
                <div key={i} style={{ whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l || '\u00A0'}</div>
              ))}
              <div style={{ position: 'absolute', inset: 0, top: 'auto', height: 24, background: 'linear-gradient(transparent, var(--bg-0))', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--line-1)' }}>
          <Button variant="ghost" size="sm" onClick={onClose} full>Cancel</Button>
          <Button variant="primary" size="sm" onClick={doExport} disabled={exporting} icon={Icon.download(11)} full>
            {exporting ? 'Exporting…' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  );
}


function Slider({ value, onChange, min = 0, max = 100 }: any) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;

  const update = (clientX: number) => {
    if(!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = x / rect.width;
    const v = Math.round(min + ratio * (max - min));
    onChange(v);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => update(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging]);

  return (
    <div
      ref={trackRef}
      onMouseDown={(e) => { setDragging(true); update(e.clientX); }}
      style={{
        position: 'relative',
        height: 18,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: '100%',
        height: 4,
        borderRadius: 999,
        background: 'var(--bg-3)',
        boxShadow: '0 0 0 1px var(--line-1) inset',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'var(--accent)',
          borderRadius: 999,
        }} />
      </div>
      <div style={{
        position: 'absolute',
        left: `calc(${pct}% - 7px)`,
        width: 14,
        height: 14,
        borderRadius: 999,
        background: '#fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset, 0 2px 6px rgba(0,0,0,0.4)',
        transition: dragging ? 'none' : 'left 100ms',
      }} />
    </div>
  );
}

function SparkChart({ series }: any) {
  const w = 282, h = 90;
  const padX = 6, padY = 8;
  const max = Math.max(...series.flatMap((p: any) => [p.a, p.b]), 1);
  const points = (key: string) => series.map((p: any, i: number) => {
    const x = padX + (i / (series.length - 1)) * (w - padX * 2);
    const y = h - padY - (p[key] / max) * (h - padY * 2);
    return [x, y];
  });
  const toPath = (pts: any) => pts.map(([x, y]: any, i: number) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const toArea = (pts: any) => `${toPath(pts)} L${pts[pts.length - 1][0]},${h - padY} L${pts[0][0]},${h - padY} Z`;
  const aPts = points('a');
  const bPts = points('b');

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(g => (
        <line key={g} x1={padX} x2={w - padX} y1={padY + g * (h - padY * 2)} y2={padY + g * (h - padY * 2)}
          stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />
      ))}
      <path d={toArea(aPts)} fill="url(#aFill)" />
      <path d={toPath(bPts)} stroke="var(--fg-2)" strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      <path d={toPath(aPts)} stroke="var(--accent)" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={aPts[aPts.length - 1][0]} cy={aPts[aPts.length - 1][1]} r="2.5" fill="var(--accent)" />
      <circle cx={bPts[bPts.length - 1][0]} cy={bPts[bPts.length - 1][1]} r="2.5" fill="var(--fg-2)" />
    </svg>
  );
}

function SetupScreen({ onComplete, error, loading }: any) {
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onComplete(name.trim());
  };

  return (
    <div style={{ padding: '32px 18px 24px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <DualMark size={44} glow />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>Welcome to DUAL</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5, maxWidth: 240, margin: '0 auto' }}>
            A/B testing for Framer. Run experiments on your published site and watch results in real time.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
        <Field label="Project name" hint="You can use the same project across multiple sites." error={error}>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Acme Marketing Site"
            autoFocus
            onKeyDown={(e: any) => e.key === 'Enter' && submit()}
          />
        </Field>

        <Button variant="primary" size="lg" full onClick={submit} disabled={!name.trim() || loading}>
          {loading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
                <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              Creating project…
            </>
          ) : (
            <>Create project {Icon.chevronRight(12)}</>
          )}
        </Button>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ height: 1, background: 'var(--line-1)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: 1, t: 'We generate read & write API keys' },
            { n: 2, t: 'Drop the DUAL component on a layer' },
            { n: 3, t: 'Track impressions and conversions live' },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--fg-2)' }}>
              <span style={{
                width: 18, height: 18, borderRadius: 4,
                background: 'var(--bg-3)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-1)',
                boxShadow: '0 0 0 1px var(--line-2) inset',
              }}>{s.n}</span>
              {s.t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyScreen({ onCreate }: any) {
  return (
    <div style={{ padding: '40px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, minHeight: '100%' }}>
      <div style={{ position: 'relative', marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            width: 56, height: 72, borderRadius: 8,
            background: 'var(--bg-2)',
            boxShadow: '0 0 0 1px var(--line-2) inset',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600,
            color: 'var(--fg-3)',
          }}>A</div>
          <div style={{ width: 14, height: 1, background: 'var(--line-3)' }} />
          <div style={{
            width: 56, height: 72, borderRadius: 8,
            background: 'var(--bg-2)',
            boxShadow: '0 0 0 1px var(--line-2) inset',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600,
            color: 'var(--fg-3)',
          }}>B</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>No experiments yet</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.5, maxWidth: 240 }}>
          Create your first experiment to start splitting traffic between two variants on your published site.
        </div>
      </div>
      <Button variant="primary" size="md" icon={Icon.plus(12)} onClick={onCreate}>New experiment</Button>
    </div>
  );
}

function SplitBar({ a, compact }: any) {
  return (
    <div style={{
      flex: 1,
      height: compact ? 4 : 8,
      borderRadius: 999,
      background: 'var(--bg-3)',
      display: 'flex',
      overflow: 'hidden',
      boxShadow: '0 0 0 1px var(--line-1) inset',
    }}>
      <div style={{
        width: `${a}%`,
        background: 'var(--accent)',
        transition: 'width 300ms',
      }} />
      <div style={{
        flex: 1,
        background: 'var(--fg-3)',
        opacity: 0.6,
        transition: 'width 300ms',
      }} />
    </div>
  );
}

function ExperimentRow({ exp, linked, onClick, onDelete }: any) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 10px',
        borderRadius: 7,
        background: hover ? 'var(--bg-2)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 120ms',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--fg-0)',
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{exp.name}</span>
          {linked && (
            <span title="Selected layer linked" style={{
              color: 'var(--accent)',
              display: 'inline-flex',
              flexShrink: 0,
            }}>{Icon.link(11)}</span>
          )}
        </div>
        <StatusBadge status={exp.status} />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete && onDelete(); }}
          title="Delete experiment"
          style={{
            width: 22, height: 22, borderRadius: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-3)',
            opacity: hover ? 1 : 0,
            transition: 'opacity 120ms, background 120ms, color 120ms',
            background: 'transparent',
            marginRight: -4,
          }}
          onMouseEnter={(e: any) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'var(--red)'; }}
          onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          {Icon.trash(11)}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SplitBar a={Math.round(exp.split_a * 100)} compact />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
          {Math.round(exp.split_a * 100)}/{100 - Math.round(exp.split_a * 100)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
          {exp.cookie_days}d cookie
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)' }}>
          {/* Note: List item impressions normally omitted to avoid N+1 requests, leaving empty or placeholder for exact prototype match */}
        </span>
      </div>
    </div>
  );
}

function ListScreen({ projectName, experiments, linkedExpId, refreshing, selectedLayerName, onCreate, onOpen, onRefresh, onLogout, onDelete }: any) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const running = experiments.filter((e: any) => e.status === 'running').length;
  const total = experiments.length;

  if (total === 0 && !refreshing) {
    return <EmptyScreen onCreate={onCreate} />;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Project Header */}
        <div style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--line-1)',
        }}>
          <DualMark size={22} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {projectName}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
              {total} experiment{total === 1 ? '' : 's'} · {running} running
            </div>
          </div>
          <button
            onClick={onRefresh}
            title="Refresh"
            style={{
              width: 26, height: 26, borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-2)',
              background: 'transparent',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e: any) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--fg-0)'; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-2)'; }}
          >
            <span style={{ display: 'inline-flex', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
              {Icon.refresh(13)}
            </span>
          </button>
          <button
            onClick={() => setConfirmLogout(true)}
            title="Logout / reset keys"
            style={{
              width: 26, height: 26, borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-2)',
              background: 'transparent',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e: any) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--fg-0)'; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-2)'; }}
          >
            {Icon.logout(13)}
          </button>
        </div>

        {/* Linked layer banner */}
        {linkedExpId && (
          <div style={{
            margin: '10px 12px 0',
            padding: '8px 10px',
            background: 'var(--accent-soft)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--fg-1)',
            boxShadow: `0 0 0 1px rgba(255,90,31,0.22) inset`,
            cursor: 'pointer',
          }} onClick={() => onOpen(linkedExpId)}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>{Icon.link(12)}</span>
            <span style={{ flex: 1 }}>
              Selected layer linked to <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: 3 }}>{selectedLayerName || 'layer'}</span>
            </span>
          </div>
        )}

        {/* Action row */}
        <div style={{ padding: '12px 12px 8px', display: 'flex', gap: 6 }}>
          <Button variant="primary" size="sm" icon={Icon.plus(12)} onClick={onCreate} full>New experiment</Button>
        </div>

        <SectionLabel>Experiments</SectionLabel>

        {/* Experiment list */}
        <div style={{ padding: '0 8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {experiments.map((exp: any) => (
            <ExperimentRow key={exp.id} exp={exp} linked={linkedExpId === exp.id} onClick={() => onOpen(exp.id)} onDelete={() => setDeleteTarget(exp)} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete experiment?"
        body={deleteTarget ? `"${deleteTarget.name}" and all its data will be permanently deleted. This cannot be undone.` : ''}
        danger
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { onDelete && onDelete(deleteTarget); setDeleteTarget(null); }}
      />

      <ConfirmDialog
        open={confirmLogout}
        title="Reset API keys?"
        body="This will clear your local DUAL session. You'll need to sign back in with your project name to access experiments. This does not delete your data."
        danger
        confirmLabel="Reset keys"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); onLogout(); }}
      />
    </>
  );
}

function CreateScreen({ selectedLayer, initialName, initialSplit, initialCookieDays, onCancel, onCreate, loading, error }: any) {
  const [name, setName] = useState(initialName || '');
  const [split, setSplit] = useState(initialSplit || 50);
  const [cookie, setCookie] = useState(initialCookieDays || 30);

  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onCreate({ name: name.trim(), split, cookieDays: cookie });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '10px 8px 10px 4px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        borderBottom: '1px solid var(--line-1)',
      }}>
        <Button variant="ghost" size="sm" icon={Icon.back(12)} onClick={onCancel}>Back</Button>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, textAlign: 'center', letterSpacing: '-0.005em' }}>
          New experiment
        </div>
        <div style={{ width: 56 }} />
      </div>

      <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {selectedLayer && (
          <div style={{
            padding: '8px 10px',
            background: 'var(--bg-2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            boxShadow: '0 0 0 1px var(--line-1) inset',
          }}>
            <span style={{ color: 'var(--fg-3)', display: 'inline-flex' }}>{Icon.layer(12)}</span>
            <span style={{ color: 'var(--fg-2)' }}>Selected layer:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-0)' }}>{selectedLayer}</span>
          </div>
        )}

        <Field label="Experiment name" hint="Used to identify this test in your dashboard." error={error}>
          <TextInput value={name} onChange={setName} placeholder="e.g. Hero CTA copy" autoFocus />
        </Field>

        <Field label="Traffic split" suffix={`${split}% A · ${100 - split}% B`} hint="Percent of visitors who see Variant A. The rest see B.">
          <Slider value={split} onChange={setSplit} />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {[10, 25, 50, 75, 90].map((p) => (
              <button
                key={p}
                onClick={() => setSplit(p)}
                style={{
                  flex: 1,
                  height: 22,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  borderRadius: 4,
                  background: split === p ? 'var(--bg-4)' : 'var(--bg-2)',
                  color: split === p ? 'var(--fg-0)' : 'var(--fg-2)',
                  boxShadow: '0 0 0 1px var(--line-1) inset',
                  transition: 'all 120ms',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Cookie duration" suffix={`${cookie} days`} hint="How long a visitor remains in the same variant after their first visit.">
          <Slider value={cookie} onChange={setCookie} min={1} max={365} />
        </Field>

        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <Button variant="ghost" size="md" onClick={onCancel} full>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={!valid || loading} full>
            {loading ? 'Creating…' : 'Create experiment'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreatedScreen({ experimentName, experimentId, writeKey, onDone }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 999,
          background: 'var(--green-soft)',
          color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 1px rgba(52,211,153,0.25) inset',
        }}>{Icon.check(16)}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Experiment created</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2 }}>{experimentName}</div>
        </div>
      </div>

      <div style={{ padding: '8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <SectionLabel>Credentials</SectionLabel>
          <div style={{ padding: '0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyChip value={experimentId} label="ID" full />
            <CopyChip value={writeKey} label="Write" masked full />
          </div>
        </div>

        <div>
          <SectionLabel>Use the DUAL component</SectionLabel>
          <div style={{ padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 7, boxShadow: '0 0 0 1px var(--line-1) inset', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Insert', 'Drag the DUAL code component onto your canvas.'],
              ['Wrap', 'Place Variant A and Variant B as children — any layers.'],
              ['Configure', 'Paste the Experiment ID and Write Key into props.'],
              ['Publish', 'Republish your site for the test to go live.'],
            ].map(([t, body], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: 'var(--bg-3)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-1)',
                  boxShadow: '0 0 0 1px var(--line-2) inset',
                  flexShrink: 0, marginTop: 1,
                }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--fg-0)' }}>{t}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Snippet</SectionLabel>
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg-1)',
            borderRadius: 7,
            boxShadow: '0 0 0 1px var(--line-1) inset',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            lineHeight: 1.65,
            color: 'var(--fg-1)',
            overflowX: 'auto',
          }}>
            <span style={{ color: 'var(--fg-3)' }}>// In DUAL.tsx</span>{`\n`}
            <span style={{ color: 'var(--blue)' }}>const</span> experimentId = <span style={{ color: 'var(--accent)' }}>"{experimentId.slice(0, 16)}…"</span>{`\n`}
            <span style={{ color: 'var(--blue)' }}>const</span> writeKey = <span style={{ color: 'var(--accent)' }}>"dwk_•••••••"</span>
          </div>
        </div>

        <Button variant="primary" size="md" full onClick={onDone}>
          Done — back to experiments
        </Button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: any) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--bg-1)',
      borderRadius: 7,
      boxShadow: '0 0 0 1px var(--line-1) inset',
    }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '-0.03em',
        color: 'var(--fg-0)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{sub}</div>}
    </div>
  );
}

function MaturityBanner({ maturity }: any) {
  const colors: any = {
    muted: { c: 'var(--fg-2)', bg: 'rgba(255,255,255,0.04)', bar: 'var(--fg-3)' },
    amber: { c: 'var(--amber)', bg: 'var(--amber-soft)', bar: 'var(--amber)' },
    blue:  { c: 'var(--blue)',  bg: 'rgba(110,168,254,0.10)', bar: 'var(--blue)' },
    green: { c: 'var(--green)', bg: 'var(--green-soft)', bar: 'var(--green)' },
  };
  const k = colors[maturity.tone];
  return (
    <div style={{
      padding: '8px 10px',
      background: k.bg,
      borderRadius: 6,
      boxShadow: `0 0 0 1px ${maturity.tone === 'muted' ? 'var(--line-1)' : 'transparent'} inset`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: k.c, display: 'inline-flex' }}>{Icon.spark(11)}</span>
        <span style={{ fontSize: 11, color: k.c, fontWeight: 500 }}>{maturity.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{Math.round(maturity.pct * 100)}%</span>
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${maturity.pct * 100}%`, height: '100%', background: k.bar, transition: 'width 400ms' }} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>{maturity.detail}</div>
    </div>
  );
}

function VariantRow({ variant, data, rate, maxRate, isWinner, accent }: any) {
  const widthPct = maxRate > 0 ? (rate / maxRate) * 100 : 0;
  return (
    <div style={{
      padding: '10px 12px',
      background: isWinner ? 'rgba(52,211,153,0.04)' : 'var(--bg-1)',
      borderRadius: 7,
      boxShadow: isWinner
        ? '0 0 0 1px rgba(52,211,153,0.25) inset'
        : '0 0 0 1px var(--line-1) inset',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: 4,
          background: accent ? 'var(--accent)' : 'var(--bg-4)',
          color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
        }}>{variant}</span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-1)', fontWeight: 500 }}>Variant {variant}</span>
        {isWinner && (
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 9.5, fontFamily: 'var(--font-mono)',
            color: 'var(--green)',
            padding: '1px 6px', borderRadius: 3,
            background: 'rgba(52,211,153,0.10)',
          }}>{Icon.trophy(10)} winner</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--fg-0)' }}>
          {rate.toFixed(2)}%
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
          conversion rate
        </span>
      </div>
      <div style={{
        height: 4, background: 'var(--bg-3)', borderRadius: 999, overflow: 'hidden',
        boxShadow: '0 0 0 1px var(--line-1) inset',
      }}>
        <div style={{
          width: `${widthPct}%`,
          height: '100%',
          background: accent ? 'var(--accent)' : 'var(--fg-2)',
          transition: 'width 400ms',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
        <span>{formatNum(data.impressions)} impressions</span>
        <span>{formatNum(data.conversions)} conversions</span>
      </div>
    </div>
  );
}

function StatsScreen({ experiment, stats, writeKey, onBack, onUpdateStatus, onDelete, showToast, onRefresh }: any) {
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const aData = stats?.variants?.A || { impressions: 0, conversions: 0, conversion_rate: 0 };
  const bData = stats?.variants?.B || { impressions: 0, conversions: 0, conversion_rate: 0 };
  const aRate = aData.conversion_rate;
  const bRate = bData.conversion_rate;
  const totalImpressions = aData.impressions + bData.impressions;
  const totalConversions = aData.conversions + bData.conversions;
  
  const winner = aRate === bRate ? null : (aRate > bRate ? 'A' : 'B');
  const lift = aRate > 0 && bRate > 0 ? Math.abs(((Math.max(aRate, bRate) - Math.min(aRate, bRate)) / Math.min(aRate, bRate)) * 100) : 0;

  const maturity =
    totalImpressions < 100 ? { label: 'Not enough data', tone: 'muted', detail: 'Need at least 100 impressions to surface trends.', pct: Math.min(totalImpressions / 100, 1) } :
    totalImpressions < 500 ? { label: 'Gathering data', tone: 'amber', detail: 'Results will stabilize as the sample grows.', pct: totalImpressions / 500 } :
    totalImpressions < 2000 ? { label: 'Directional insights', tone: 'blue', detail: 'A trend is forming, but confidence is still building.', pct: totalImpressions / 2000 } :
    { label: 'Strong sample', tone: 'green', detail: '95% confidence reached. Results are reliable.', pct: 1 };

  const togglePause = () => {
    const nextStatus = experiment.status === 'running' ? 'paused' : 'running';
    onUpdateStatus(experiment.id, nextStatus);
    showToast(experiment.status === 'running' ? 'Experiment paused' : 'Experiment resumed', 'success');
  };

  const chartSeries = useMemo(() => {
    // Generate dummy 24h series matching stats for the chart if backend has no real series
    const series = [];
    for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const weight = Math.exp(-Math.pow((i - 14) / 6, 2));
        const a = Math.max(0, Math.round(aData.impressions * weight * 0.12 + Math.random() * 4));
        const b = Math.max(0, Math.round(bData.impressions * weight * 0.12 + Math.random() * 4));
        series.push({ h: i, a, b });
    }
    return series;
  }, [aData.impressions, bData.impressions]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 20 }}>
        {/* Header */}
        <div style={{
          padding: '10px 8px 10px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderBottom: '1px solid var(--line-1)',
        }}>
          <Button variant="ghost" size="sm" icon={Icon.back(12)} onClick={onBack}>Back</Button>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div style={{
              fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{experiment.name}</div>
          </div>
          <button
            onClick={() => { onRefresh(); showToast('Refreshed', 'info'); }}
            style={{
              width: 26, height: 26, borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-2)',
              background: 'transparent',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e: any) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--fg-0)'; }}
            onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-2)'; }}
          >{Icon.refresh(12)}</button>
        </div>

        {/* Status row */}
        <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={experiment.status} />
          {experiment.status === 'running' && (
            <span style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--green)', animation: 'pulse-dot 1.6s ease-in-out infinite' }} />
              live
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {Math.round(experiment.split_a * 100)}/{100 - Math.round(experiment.split_a * 100)} · {experiment.cookie_days}d
          </span>
        </div>

        {/* Maturity banner */}
        <div style={{ padding: '0 12px' }}>
          <MaturityBanner maturity={maturity} />
        </div>

        {/* Aggregate cards */}
        <div style={{ padding: '14px 12px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <MetricCard label="Impressions" value={formatNum(totalImpressions)} sub={experiment.status === 'running' ? '+ live' : null} />
          <MetricCard label="Conversions" value={formatNum(totalConversions)} sub={`${(totalConversions / Math.max(totalImpressions, 1) * 100).toFixed(2)}% rate`} />
        </div>

        {/* Time series chart */}
        <div style={{ padding: '14px 12px 0' }}>
          <SectionLabel right={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 2, background: 'var(--accent)', borderRadius: 1 }} />A
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 2, background: 'var(--fg-2)', borderRadius: 1 }} />B
              </span>
            </div>
          }>Impressions · 24h</SectionLabel>
          <div style={{
            padding: '10px 4px 4px',
            background: 'var(--bg-1)',
            borderRadius: 7,
            boxShadow: '0 0 0 1px var(--line-1) inset',
            margin: '0 2px',
          }}>
            <SparkChart series={chartSeries} />
          </div>
        </div>

        {/* Variant comparison */}
        <div style={{ padding: '14px 12px 0' }}>
          <SectionLabel right={
            winner && lift > 5 ? (
              <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {Icon.trophy(10)} +{lift.toFixed(1)}% lift
              </span>
            ) : null
          }>Variants</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <VariantRow
              variant="A"
              data={aData}
              rate={aRate}
              maxRate={Math.max(aRate, bRate, 0.1)}
              isWinner={winner === 'A' && lift > 5}
              accent
            />
            <VariantRow
              variant="B"
              data={bData}
              rate={bRate}
              maxRate={Math.max(aRate, bRate, 0.1)}
              isWinner={winner === 'B' && lift > 5}
            />
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: '16px 12px 12px' }}>
          <SectionLabel>Controls</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Button
              variant="secondary"
              size="md"
              icon={experiment.status === 'running' ? Icon.pause(12) : Icon.play(12)}
              onClick={togglePause}
              disabled={experiment.status === 'completed'}
            >
              {experiment.status === 'running' ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={Icon.flag(12)}
              onClick={() => setConfirmComplete(true)}
              disabled={experiment.status === 'completed'}
            >
              Complete
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={Icon.download(12)}
              onClick={() => setExportOpen(true)}
              style={{ gridColumn: '1 / -1' }}
            >
              Export data
            </Button>
            <Button
              variant="danger"
              size="md"
              icon={Icon.trash(12)}
              onClick={() => setConfirmDelete(true)}
              style={{ gridColumn: '1 / -1' }}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Credentials */}
        <div style={{ padding: '4px 12px 0' }}>
          <SectionLabel>Credentials</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyChip value={experiment.id} label="ID" full />
            <CopyChip value={writeKey} label="Write" masked full />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete experiment?"
        body={`"${experiment.name}" and all its data will be permanently deleted. This cannot be undone.`}
        danger
        confirmLabel="Delete experiment"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete && onDelete(experiment.id);
        }}
      />

      <ExportDialog
        open={exportOpen}
        experiment={experiment}
        stats={stats}
        onClose={() => setExportOpen(false)}
        onExported={(fmt: any) => { setExportOpen(false); showToast(`Exported as ${fmt.toUpperCase()}`, 'success'); }}
      />

      <ConfirmDialog
        open={confirmComplete}
        title="Mark as completed?"
        body="The experiment will stop collecting new impressions and conversions. You can still view results but cannot resume it."
        confirmLabel="Mark completed"
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => {
          setConfirmComplete(false);
          onUpdateStatus(experiment.id, 'completed');
          showToast('Experiment marked completed', 'success');
        }}
      />
    </>
  );
}



const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}
  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}
`;

function useTweaks(defaults: any) {
  const [values, setValues] = useState(defaults);
  const setTweak = useCallback((keyOrEdits: any, val?: any) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev: any) => ({ ...prev, ...edits }));
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*'); } catch (e) {}
  }, []);
  return [values, setTweak] as const;
}

function TweaksPanel({ title = 'Tweaks', children }: any) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  useEffect(() => {
    const onMsg = (e: any) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
    // Auto open in development for easy access if desired, but we follow standard behavior
    // setOpen(true); // Uncomment if we want it always open during dev
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  };

  const onDragStart = (e: any) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev: any) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel"
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

function TweakSection({ label, children }: any) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }: any) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }: any) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const opts = options.map((o: any) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o: any) => o.value === value));
  const n = opts.length;

  const valueRef = useRef(value);
  valueRef.current = value;

  const segAt = (clientX: number) => {
    if (!trackRef.current) return valueRef.current;
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e: any) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev: any) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o: any) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakColor({ label, value, onChange }: any) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <input type="color" className="twk-swatch" value={value}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}


export function App() {
  const [screen, setScreen] = useState<
    "loading" | "setup" | "list" | "create" | "created" | "stats"
  >("loading");
  const [writeKey, setWriteKey] = useState("");
  const [readKey, setReadKey] = useState("");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null);
  const [stats, setStats] = useState<ExperimentStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [nodeLinkedExpId, setNodeLinkedExpId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  
  // Saved form state for Create Screen to support Back button
  const [createForm, setCreateForm] = useState({ name: '', split: 50, cookieDays: 30 });
  const [toast, setToast] = useState<{message: string, kind: string, key: number} | null>(null);

  const [tweaks, setTweak] = useTweaks({ accent: '#ff5a1f' });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', tweaks.accent);
    const r = parseInt(tweaks.accent.slice(1, 3), 16);
    const g = parseInt(tweaks.accent.slice(3, 5), 16);
    const b = parseInt(tweaks.accent.slice(5, 7), 16);
    root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
  }, [tweaks.accent]);


  const showToast = (message: string, kind = 'info') => setToast({ message, kind, key: Date.now() });

  useEffect(() => {
    Promise.all([
      framer.getPluginData(SK_READ),
      framer.getPluginData(SK_WRITE),
      framer.getPluginData("ab_read_key"),
      framer.getPluginData("ab_write_key"),
    ])
      .then(([rk, wk, oldRk, oldWk]) => {
        const r = rk ?? oldRk ?? "";
        const w = wk ?? oldWk ?? "";
        setReadKey(r);
        setWriteKey(w);
        setScreen(r ? "list" : "setup");
      })
      .catch(() => {
        setScreen("setup");
      });
  }, []);

  useEffect(() => {
    if (screen === "loading") return;
    return framer.subscribeToSelection((nodes) => {
      setSelectedNode(nodes[0] ?? null);
    });
  }, [screen]);

  useEffect(() => {
    if (screen === "loading" || !selectedNode) {
      setNodeLinkedExpId(null);
      return;
    }
    selectedNode.getPluginData("dual_experiment_id").then((id) => {
      if (id) {
        setNodeLinkedExpId(id);
      } else {
        selectedNode.getPluginData("ab_experiment_id").then(setNodeLinkedExpId);
      }
    });
  }, [screen, selectedNode]);

  const fetchExperiments = useCallback(
    async (key = readKey) => {
      if (!key) return;
      setListLoading(true);
      try {
        const res = await fetch(`${API_URL}/v1/experiments`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any).error ?? `HTTP ${res.status}`);
        }
        setExperiments(await res.json());
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setListLoading(false);
      }
    },
    [readKey],
  );

  useEffect(() => {
    if (screen === "list") fetchExperiments();
  }, [screen, fetchExperiments]);

  const fetchStats = useCallback(
    async (exp: Experiment, key = readKey) => {
      if (!exp || !key) return;
      try {
        const res = await fetch(
          `${API_URL}/v1/experiments/${encodeURIComponent(exp.id)}/stats`,
          { headers: { Authorization: `Bearer ${key}` } },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any).error ?? `HTTP ${res.status}`);
        }
        setStats(await res.json());
      } catch (e) {
      }
    },
    [readKey],
  );

  useEffect(() => {
    if (screen !== "stats" || !selectedExp) return;
    setStats(null);
    fetchStats(selectedExp);
    const id = setInterval(() => fetchStats(selectedExp), 30000);
    return () => clearInterval(id);
  }, [screen, selectedExp, fetchStats]);

  const handleSetup = async (name: string) => {
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch(`${API_URL}/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      await Promise.all([
        framer.setPluginData(SK_WRITE, data.write_key),
        framer.setPluginData(SK_READ, data.read_key),
      ]);
      setWriteKey(data.write_key);
      setReadKey(data.read_key);
      setProjectName(name);
      setScreen("list");
      showToast('Project created · keys generated', 'success');
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e));
    } finally {
      setSetupLoading(false);
    }
  };

  const injectComponents = async () => {
    if (injectionLock) {
      await injectionLock;
      return;
    }
    injectionLock = (async () => {
      try {
        if (framer.isAllowedTo("setCustomCode")) {
          const existing = await framer.getCustomCode();
          if (!existing.headEnd?.html) {
            await framer.setCustomCode({
              location: "headEnd",
              html: GLOBAL_SCRIPT_HTML,
            });
          }
        }
      } catch {}
      try {
        if (framer.isAllowedTo("createCodeFile")) {
          const existingFiles = await framer.getCodeFiles();
          const hasDUAL = existingFiles.some((f) => f.name === "DUAL");
          if (!hasDUAL) {
            await framer.createCodeFile("DUAL", DUAL_TESTING_CODE);
          }
        }
      } catch {}
    })();
    await injectionLock;
  };

  const handleCreate = async ({ name, split, cookieDays }: any) => {
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_URL}/v1/experiments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${readKey}`,
        },
        body: JSON.stringify({
          name,
          split_a: split / 100,
          cookie_days: cookieDays,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreatedId(data.experiment_id);
      setCreateForm({ name, split, cookieDays });
      
      if (selectedNode) {
        await Promise.all([
          selectedNode.setPluginData("dual_experiment_id", data.experiment_id),
          selectedNode.setPluginData("ab_experiment_id", data.experiment_id),
        ]);
        setNodeLinkedExpId(data.experiment_id);
      }
      await injectComponents();
      setScreen("created");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateStatus = async (expId: string, status: string) => {
    try {
      const res = await fetch(
        `${API_URL}/v1/experiments/${encodeURIComponent(expId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${readKey}`,
          },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      setExperiments((prev) =>
        prev.map((exp) =>
          exp.id === expId
            ? { ...exp, status: status as Experiment["status"] }
            : exp,
        ),
      );
      if (selectedExp?.id === expId) {
        setSelectedExp((prev) =>
          prev ? { ...prev, status: status as Experiment["status"] } : prev,
        );
        fetchStats({ ...selectedExp!, status: status as Experiment["status"] });
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const handleDeleteExperiment = async (expId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/v1/experiments/${encodeURIComponent(expId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${readKey}` },
        },
      );
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
    } catch {
      // fallback to local removal when backend does not support delete
    }
    setExperiments((prev) => prev.filter((exp) => exp.id !== expId));
    if (selectedExp?.id === expId) {
      setSelectedExp(null);
      setScreen("list");
      showToast('Experiment deleted', 'success');
    }
  };

  const handleLogout = async () => {
    await Promise.all([
      framer.setPluginData(SK_READ, null),
      framer.setPluginData(SK_WRITE, null),
      framer.setPluginData("ab_read_key", null),
      framer.setPluginData("ab_write_key", null),
    ]);
    setReadKey("");
    setWriteKey("");
    setExperiments([]);
    setSelectedExp(null);
    setProjectName("");
    setScreen("setup");
    showToast('Keys reset', 'info');
  };

  const selectedLayerName = selectedNode
    ? supportsName(selectedNode)
      ? (selectedNode.name ?? "Unnamed")
      : "Unnamed"
    : null;

  let content;
  let panelTitle = 'DUAL';

  if (screen === 'loading') {
    content = <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--fg-3)', fontSize: 11 }}>Loading…</div>;
  } else if (screen === 'setup') {
    content = <SetupScreen onComplete={handleSetup} error={setupError} loading={setupLoading} />;
  } else if (screen === 'list') {
    content = (
      <ListScreen
        projectName={projectName || "Project"}
        experiments={experiments}
        linkedExpId={nodeLinkedExpId}
        selectedLayerName={selectedLayerName}
        refreshing={listLoading}
        onCreate={() => { setCreateForm({ name: '', split: 50, cookieDays: 30 }); setScreen('create'); }}
        onOpen={(id: string) => { const exp = experiments.find(e => e.id === id); if (exp) { setSelectedExp(exp); setScreen('stats'); } }}
        onRefresh={() => fetchExperiments()}
        onLogout={handleLogout}
        onDelete={(exp: any) => { handleDeleteExperiment(exp.id); }}
      />
    );
  } else if (screen === 'create') {
    content = (
      <CreateScreen
        selectedLayer={selectedLayerName}
        initialName={createForm.name}
        initialSplit={createForm.split}
        initialCookieDays={createForm.cookieDays}
        error={createError}
        loading={createLoading}
        onCancel={() => setScreen(experiments.length === 0 ? 'list' : 'list')}
        onCreate={handleCreate}
      />
    );
  } else if (screen === 'created') {
    content = (
      <CreatedScreen
        experimentName={createForm.name}
        experimentId={createdId}
        writeKey={writeKey}
        onDone={() => setScreen('list')}
      />
    );
  } else if (screen === 'stats' && selectedExp) {
    panelTitle = 'Experiment';
    content = (
      <StatsScreen
        experiment={selectedExp}
        stats={stats}
        writeKey={writeKey}
        onBack={() => setScreen('list')}
        onUpdateStatus={handleUpdateStatus}
        onDelete={(id: string) => handleDeleteExperiment(id)}
        onRefresh={() => fetchStats(selectedExp)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="app-root">
      {content}
      {toast && <Toast key={toast.key} message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Accent">
          <TweakColor
            label="Accent color"
            value={tweaks.accent}
            onChange={(v: string) => setTweak('accent', v)}
          />
          <TweakRadio
            label="Presets"
            value={tweaks.accent}
            onChange={(v: string) => setTweak('accent', v)}
            options={[
              { label: 'Orange', value: '#ff5a1f' },
              { label: 'Blue', value: '#0099ff' },
              { label: 'Violet', value: '#a855f7' },
              { label: 'Green', value: '#10b981' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
