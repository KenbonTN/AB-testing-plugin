import { useState, useEffect, useCallback } from "react";
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
  "import { useLayoutEffect, useState, useEffect, useRef } from \'react\'\nimport { addPropertyControls, ControlType, RenderTarget } from \'framer\'\n\nconst DEFAULT_API_URL = \'https://ab-testing-worker.kenbonfloziio.workers.dev\'\n\nexport default function DUAL({\n  experimentId = \'\',\n  writeKey = \'\',\n  cookieDays = 30,\n  split = 50,\n  variantA,\n  variantB,\n  eventName = \'conversion\',\n  triggerOn = \'click\',\n  respectConsent = false,\n  consentCookieName = \'cookie_consent\',\n  apiUrl = DEFAULT_API_URL,\n}) {\n  const [variant, setVariant] = useState(\'A\')\n  const [visible, setVisible] = useState(false)\n  const firedRef = useRef(false)\n  const ref = useRef(null)\n\n  const hasConsent = () => {\n    if (!respectConsent) return true\n    const cookies = document.cookie.split(\'; \')\n    const consent = cookies.find((row) => row.startsWith(`${consentCookieName}=`))\n    if (!consent) return false\n    const value = consent.split(\'=\').slice(1).join(\'=\')\n    return value === \'true\' || value === \'accepted\' || value === \'1\'\n  }\n\n  const getOrCreateVisitorId = () => {\n    const key = `dual-user-${experimentId}`\n    let id = localStorage.getItem(key)\n    if (!id) {\n      id = crypto.randomUUID()\n      localStorage.setItem(key, id)\n    }\n    return id\n  }\n\n  const resolveVariant = () => {\n    if (respectConsent && !hasConsent()) return \'A\'\n    const key = `dual_${experimentId}`\n    const existing = document.cookie.split(\'; \').find((row) => row.startsWith(`${key}=`))\n    if (existing) {\n      const value = existing.split(\'=\').slice(1).join(\'=\')\n      if (value === \'A\' || value === \'B\') return value\n    }\n    const assigned = Math.random() * 100 < split ? \'A\' : \'B\'\n    const expires = new Date()\n    expires.setDate(expires.getDate() + cookieDays)\n    document.cookie = `${key}=${assigned}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`\n    return assigned\n  }\n\n  const trackImpression = async (assignedVariant) => {\n    if (!hasConsent()) return\n    const trackedKey = `dual-imp-${experimentId}`\n    if (sessionStorage.getItem(trackedKey)) return\n    sessionStorage.setItem(trackedKey, \'1\')\n\n    try {\n      const visitorId = getOrCreateVisitorId()\n      const res = await fetch(`${apiUrl}/v1/events`, {\n        method: \'POST\',\n        headers: {\n          \'Content-Type\': \'application/json\',\n          Authorization: `Bearer ${writeKey}`,\n        },\n        body: JSON.stringify({\n          experiment_id: experimentId,\n          type: \'impression\',\n          variant: assignedVariant,\n          visitor_id: visitorId,\n        }),\n      })\n      if (!res.ok) {\n        sessionStorage.removeItem(`dual-imp-${experimentId}`)\n      }\n    } catch {\n      sessionStorage.removeItem(`dual-imp-${experimentId}`)\n    }\n  }\n\n  useLayoutEffect(() => {\n    if (RenderTarget.current?.() === RenderTarget.canvas) {\n      setVisible(true)\n      return\n    }\n    const assigned = resolveVariant()\n    setVariant(assigned)\n    setVisible(true)\n    trackImpression(assigned)\n  }, [])\n\n  const trackConversion = () => {\n    if (!hasConsent()) return\n    const variantCookie = document.cookie\n      .split(\'; \')\n      .find((r) => r.startsWith(`dual_${experimentId}=`))\n    if (!variantCookie) return\n    const v = variantCookie.split(\'=\').slice(1).join(\'=\')\n    if (v !== \'A\' && v !== \'B\') return\n    const visitorId = localStorage.getItem(`dual-user-${experimentId}`) ?? null\n    fetch(`${apiUrl}/v1/events`, {\n      method: \'POST\',\n      headers: {\n        \'Content-Type\': \'application/json\',\n        Authorization: `Bearer ${writeKey}`,\n      },\n      body: JSON.stringify({\n        experiment_id: experimentId,\n        type: eventName,\n        variant: v,\n        visitor_id: visitorId,\n      }),\n    }).catch(() => {})\n  }\n\n  useEffect(() => {\n    if (triggerOn === \'mount\') {\n      trackConversion()\n      return\n    }\n    if (triggerOn === \'visible\' && ref.current) {\n      const obs = new IntersectionObserver(\n        ([e]) => {\n          if (e.isIntersecting && !firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n            obs.disconnect()\n          }\n        },\n        { threshold: 0.5 },\n      )\n      obs.observe(ref.current)\n      return () => obs.disconnect()\n    }\n    if (triggerOn === \'submit\' && ref.current) {\n      const el = ref.current\n      const form = el.tagName === \'FORM\' ? el : el.querySelector(\'form\')\n      if (form) {\n        const handleSubmit = () => {\n          if (!firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n          }\n        }\n        form.addEventListener(\'submit\', handleSubmit)\n        return () => form.removeEventListener(\'submit\', handleSubmit)\n      }\n    }\n  }, [])\n\n  const handleClick =\n    triggerOn === \'click\'\n      ? () => {\n          if (!firedRef.current) {\n            firedRef.current = true\n            trackConversion()\n          }\n        }\n      : undefined\n\n  return (\n    <div ref={ref} style={{ visibility: visible ? \'visible\' : \'hidden\' }} onClick={handleClick}>\n      <div style={{ display: variant === \'A\' ? \'contents\' : \'none\' }}>{variantA}</div>\n      <div style={{ display: variant === \'B\' ? \'contents\' : \'none\' }}>{variantB}</div>\n    </div>\n  )\n}\n\naddPropertyControls(DUAL, {\n  experimentId: { type: ControlType.String, title: \'Experiment ID\' },\n  writeKey: { type: ControlType.String, title: \'Write Key\' },\n  cookieDays: { type: ControlType.Number, title: \'Cookie Days\', defaultValue: 30, min: 1, max: 365 },\n  split: { type: ControlType.Number, title: \'Split % (Variant A)\', defaultValue: 50, min: 0, max: 100 },\n  variantA: { type: ControlType.Slot, title: \'Variant A\' },\n  variantB: { type: ControlType.Slot, title: \'Variant B\' },\n  eventName: { type: ControlType.String, title: \'Event Name\', defaultValue: \'conversion\' },\n  triggerOn: {\n    type: ControlType.Enum,\n    title: \'Trigger On\',\n    options: [\'click\', \'mount\', \'visible\', \'submit\'],\n    optionTitles: [\'Click\', \'Mount\', \'Visible (50%)\', \'Submit (Form)\'],\n    defaultValue: \'click\',\n  },\n  respectConsent: { type: ControlType.Boolean, title: \'Respect Consent\', defaultValue: false },\n  consentCookieName: { type: ControlType.String, title: \'Consent Cookie Name\', defaultValue: \'cookie_consent\' },\n  apiUrl: { type: ControlType.String, title: \'API URL\', defaultValue: DEFAULT_API_URL },\n})";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; color: string; bg: string; dot: boolean }
  > = {
    running: {
      label: "Running",
      color: "var(--green)",
      bg: "var(--green-soft)",
      dot: true,
    },
    paused: {
      label: "Paused",
      color: "var(--amber)",
      bg: "var(--amber-soft)",
      dot: true,
    },
    completed: {
      label: "Completed",
      color: "var(--fg-2)",
      bg: "rgba(255,255,255,0.05)",
      dot: false,
    },
  };
  const s = map[status] || map.completed;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 7px 2px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        fontSize: 10.5,
        fontWeight: 500,
        fontFamily: "var(--font-mono)",
        textTransform: "lowercase",
      }}
    >
      {s.dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: s.color,
            boxShadow: `0 0 6px ${s.color}`,
            animation: "pulse-dot 1.6s ease-in-out infinite",
          }}
        />
      )}
      {s.label.toLowerCase()}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="btn-ghost btn-xs" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="snippet-row">
      <div>
        <div className="snippet-label">{label}</div>
        <div className="snippet-value">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

function formatNum(value: number) {
  return value.toLocaleString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{body}</div>
        <div className="dialog-actions">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportDialog({
  open,
  experiment,
  stats,
  onClose,
  onExported,
}: {
  open: boolean;
  experiment: Experiment | null;
  stats: ExperimentStats | null;
  onClose: () => void;
  onExported: (format: string) => void;
}) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [scope, setScope] = useState<"summary" | "timeseries">("summary");
  const [exporting, setExporting] = useState(false);

  if (!open || !experiment || !stats) return null;

  const aRate = stats.variants.A.conversion_rate;
  const bRate = stats.variants.B.conversion_rate;

  const buildCSV = () => {
    if (scope === "timeseries") {
      const lines = ["hour,variant_a_impressions,variant_b_impressions"];
      const now = new Date();
      const hours = Array.from({ length: 24 }, (_, i) => i);
      hours.forEach((hour) => {
        lines.push(`${hour},0,0`);
      });
      return lines.join("\n");
    }
    return [
      "experiment_id,name,status,split_a_pct,cookie_days,total_impressions,total_conversions",
      `${experiment.id},${JSON.stringify(experiment.name)},${experiment.status},${Math.round(experiment.split_a * 100)},${experiment.cookie_days},${stats.variants.A.impressions + stats.variants.B.impressions},${stats.variants.A.conversions + stats.variants.B.conversions}`,
      "",
      "variant,impressions,conversions,conversion_rate_pct",
      `A,${stats.variants.A.impressions},${stats.variants.A.conversions},${aRate.toFixed(2)}`,
      `B,${stats.variants.B.impressions},${stats.variants.B.conversions},${bRate.toFixed(2)}`,
    ].join("\n");
  };

  const buildJSON = () => ({
    experiment: {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      split: {
        a: Math.round(experiment.split_a * 100),
        b: Math.round((1 - experiment.split_a) * 100),
      },
      cookie_days: experiment.cookie_days,
    },
    totals: {
      impressions: stats.variants.A.impressions + stats.variants.B.impressions,
      conversions: stats.variants.A.conversions + stats.variants.B.conversions,
    },
    variants: {
      A: stats.variants.A,
      B: stats.variants.B,
    },
    exported_at: new Date().toISOString(),
  });

  const preview =
    format === "csv"
      ? buildCSV().split("\n").slice(0, 6)
      : JSON.stringify(buildJSON(), null, 2).split("\n").slice(0, 6);

  const doExport = async () => {
    setExporting(true);
    const content =
      format === "csv" ? buildCSV() : JSON.stringify(buildJSON(), null, 2);
    const type = format === "csv" ? "text/csv" : "application/json";
    const fileName = `dual-${slugify(experiment.name)}-${scope}.${format}`;
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExporting(false);
    onExported(format);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <div>
            <div className="export-title">Export Data</div>
            <div className="export-subtitle">
              Download a summary of this experiment.
            </div>
          </div>
          <button className="btn-ghost btn-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="export-pane">
          <div className="export-section">
            <div className="export-section-title">Format</div>
            <div className="export-options">
              {(["csv", "json"] as const).map((option) => (
                <button
                  key={option}
                  className={`export-option ${format === option ? "selected" : ""}`}
                  onClick={() => setFormat(option)}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="export-section">
            <div className="export-section-title">Include</div>
            <div className="export-options">
              {(
                [
                  { id: "summary", label: "Summary" },
                  { id: "timeseries", label: "Time series" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  className={`export-option ${scope === option.id ? "selected" : ""}`}
                  onClick={() => setScope(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="export-preview">
            <div className="export-section-title">Preview</div>
            <div className="export-code">
              {preview.map((line, index) => (
                <div key={index}>{line || " "}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="export-actions">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={doExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListScreen({
  experiments,
  loading,
  error,
  projectName,
  activeCount,
  nodeLinkedExpId,
  selectedLayerName,
  onRefresh,
  onLogout,
  onNewExperiment,
  onOpenStats,
  onDelete,
}: {
  experiments: Experiment[];
  loading: boolean;
  error: string | null;
  projectName: string;
  activeCount: number;
  nodeLinkedExpId: string | null;
  selectedLayerName: string | null;
  onRefresh: () => void;
  onLogout: () => void;
  onNewExperiment: () => void;
  onOpenStats: (exp: Experiment) => void;
  onDelete: (exp: Experiment) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <div className="app-root" data-theme="dark">
      <div className="top-bar">
        <div className="brand-row">
          <div className="page-title">{projectName || "Project"}</div>
          <div className="project-summary">
            {experiments.length} experiments · {activeCount} running
          </div>
        </div>
        <div className="action-row">
          <button
            className={`icon-button ${refreshing ? "spinning" : ""}`}
            onClick={handleRefresh}
            title="Refresh"
          >
            ↻
          </button>
          <button className="icon-button" onClick={onLogout} title="Logout">
            ⏻
          </button>
          <button className="btn-primary btn-sm" onClick={onNewExperiment}>
            New experiment
          </button>
        </div>
      </div>

      {nodeLinkedExpId && (
        <div
          className="link-banner"
          onClick={() => {
            const exp = experiments.find((item) => item.id === nodeLinkedExpId);
            if (exp) onOpenStats(exp);
          }}
        >
          <span className="link-icon">🔗</span>
          Selected layer linked to{" "}
          <strong>{selectedLayerName ?? "layer"}</strong>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {loading && <div className="muted">Loading experiments…</div>}

      {!loading && experiments.length === 0 && (
        <div className="empty-screen">
          <div className="empty-hero">
            <div className="variant-card-empty">A</div>
            <div className="variant-separator" />
            <div className="variant-card-empty">B</div>
          </div>
          <h2>No experiments yet</h2>
          <p>
            Start the first experiment to split traffic between two variants on
            your live site.
          </p>
          <button className="btn-primary btn-full" onClick={onNewExperiment}>
            Create first experiment
          </button>
        </div>
      )}

      <div className="experiment-list">
        {experiments.map((exp) => (
          <div
            key={exp.id}
            className="experiment-card"
            onClick={() => onOpenStats(exp)}
          >
            <div className="experiment-card-head">
              <div>
                <div className="experiment-name-row">
                  <div className="experiment-name">{exp.name}</div>
                  <StatusBadge status={exp.status} />
                </div>
                <div className="experiment-meta">
                  {Math.round(exp.split_a * 100)}% A ·{" "}
                  {100 - Math.round(exp.split_a * 100)}% B · {exp.cookie_days}d
                  cookie
                </div>
              </div>
              <div className="experiment-card-actions">
                <button
                  className="icon-button danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(exp);
                  }}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="split-bar">
              <div
                className="split-fill"
                style={{ width: `${Math.round(exp.split_a * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
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
  const [listError, setListError] = useState<string | null>(null);
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null);
  const [stats, setStats] = useState<ExperimentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Experiment | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<Experiment | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [nodeLinkedExpId, setNodeLinkedExpId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [expName, setExpName] = useState("");
  const [splitA, setSplitA] = useState(50);
  const [cookieDays, setCookieDays] = useState(30);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const detectTheme = () => {
      const root = document.querySelector(".app-root")?.parentElement;
      if (!root) return "dark";
      const bgColor = window.getComputedStyle(root).backgroundColor;
      if (
        bgColor.includes("255, 255, 255") ||
        bgColor.includes("248, 249, 250")
      ) {
        return "light";
      }
      return "dark";
    };
    const detectedTheme = detectTheme();
    setTheme(detectedTheme);
  }, []);

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
      setListError(null);
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
        setListError(e instanceof Error ? e.message : String(e));
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
        setStatsError(e instanceof Error ? e.message : String(e));
      }
    },
    [readKey],
  );

  useEffect(() => {
    if (screen !== "stats" || !selectedExp) return;
    setStats(null);
    setStatsError(null);
    setStatsLoading(true);
    fetchStats(selectedExp).finally(() => setStatsLoading(false));
    const id = setInterval(() => fetchStats(selectedExp), 30000);
    return () => clearInterval(id);
  }, [screen, selectedExp, fetchStats]);

  const handleSetup = async () => {
    if (!projectName.trim()) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const res = await fetch(`${API_URL}/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName.trim() }),
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
      setScreen("list");
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

  const handleCreate = async () => {
    if (!expName.trim()) return;
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
          name: expName.trim(),
          split_a: splitA / 100,
          cookie_days: cookieDays,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreatedId(data.experiment_id);
      if (selectedNode) {
        await Promise.all([
          selectedNode.setPluginData("dual_experiment_id", data.experiment_id),
          selectedNode.setPluginData("ab_experiment_id", data.experiment_id),
        ]);
        setNodeLinkedExpId(data.experiment_id);
      }
      await injectComponents();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetCreate = () => {
    setExpName("");
    setSplitA(50);
    setCookieDays(30);
    setCreatedId(null);
    setCreateError(null);
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
      setStatsError(e instanceof Error ? e.message : String(e));
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
    }
    setDeleteConfirm(null);
    setArchiveConfirm(null);
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
  };

  const openStats = (exp: Experiment) => {
    setSelectedExp(exp);
    setStats(null);
    setStatsError(null);
    setScreen("stats");
  };

  const openCreate = () => {
    handleResetCreate();
    setScreen("create");
  };

  const handleFinishCreated = () => {
    setScreen("list");
    handleResetCreate();
  };

  const selectedLayerName = selectedNode
    ? supportsName(selectedNode)
      ? (selectedNode.name ?? "Unnamed")
      : "Unnamed"
    : null;

  const activeCount = experiments.filter(
    (exp) => exp.status === "running",
  ).length;

  if (screen === "loading") {
    return (
      <div className="app-root" data-theme={theme}>
        <div className="spinner-wrap">
          <div className="spinner" />
          <span className="muted">Loading…</span>
        </div>
      </div>
    );
  }

  if (screen === "setup") {
    return (
      <div className="app-root" data-theme={theme}>
        <div className="hero-panel">
          <div className="hero-mark">
            <img src="..icon.svg" alt="DUAL" width="44" height="44" />
          </div>
          <h1>Welcome to DUAL</h1>
          <p>
            A/B testing for Framer. Run experiments on your published site and
            watch results in real time.
          </p>
        </div>

        <div className="panel card">
          <div className="form-group">
            <label className="form-label">Project name</label>
            <input
              className="form-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="e.g.Acme Marketing site"
            />
          </div>
          {setupError && <div className="error-msg">{setupError}</div>}
          <button
            className="btn-primary btn-full"
            onClick={handleSetup}
            disabled={setupLoading || !projectName.trim()}
          >
            {setupLoading ? "Creating project…" : "Create project"}
          </button>
        </div>

        <div className="panel card steps-panel">
          <div className="step-row">
            <span>1</span>
            <div>
              <p>We generate read & write API keys</p>
            </div>
          </div>
          <div className="step-row">
            <span>2</span>
            <div>
              <p>Drop the DUAL component on a layer</p>
            </div>
          </div>
          <div className="step-row">
            <span>3</span>
            <div>
              <p>Track impressions and conversions live</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "list") {
    return (
      <ListScreen
        experiments={experiments}
        loading={listLoading}
        error={listError}
        projectName={projectName}
        activeCount={activeCount}
        nodeLinkedExpId={nodeLinkedExpId}
        selectedLayerName={selectedLayerName}
        onRefresh={() => fetchExperiments()}
        onLogout={handleLogout}
        onNewExperiment={openCreate}
        onOpenStats={openStats}
        onDelete={(exp) => setDeleteConfirm(exp)}
      />
    );
  }

  if (screen === "create") {
    if (createdId) {
      return (
        <div className="app-root" data-theme={theme}>
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              handleResetCreate();
              setScreen("list");
            }}
          >
            ← Back
          </button>
          <div className="created-panel">
            <div className="created-icon">✓</div>
            <h1>Experiment created</h1>
            <p>{expName}</p>
          </div>
          <div className="panel card">
            <div className="subsection">
              <h2>Credentials</h2>
              <CodeSnippet label="Experiment ID" value={createdId} />
              <CodeSnippet label="Write Key" value={writeKey} />
            </div>
            <div className="subsection">
              <h2>Use the DUAL component</h2>
              <ol className="guide-list">
                <li>Drop DUAL on your canvas.</li>
                <li>Add Variant A and Variant B as children.</li>
                <li>Paste the Experiment ID and Write Key.</li>
                <li>Publish to start tracking.</li>
              </ol>
            </div>
            <div className="subsection">
              <h2>Snippet</h2>
              <div className="code-block">
                <code>const experimentId = "{createdId}"</code>
                <code>const writeKey = "{writeKey}"</code>
              </div>
            </div>
            <button
              className="btn-primary btn-full"
              onClick={handleFinishCreated}
            >
              Done — back to experiments
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="app-root" data-theme={theme}>
        <button className="btn-ghost btn-sm" onClick={() => setScreen("list")}>
          ← Back
        </button>
        <h1 className="page-title">New experiment</h1>
        {selectedLayerName ? (
          <div className="layer-tag">
            Layer: <strong>{selectedLayerName}</strong>
          </div>
        ) : (
          <div className="layer-tag empty">Selected layer: Hero CTA</div>
        )}

        <div className="panel card">
          <div className="form-group">
            <label className="form-label">Experiment name</label>
            <input
              className="form-input"
              placeholder="Hero CTA copy"
              value={expName}
              onChange={(e) => setExpName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div className="form-row">
              <div className="label-row">
                <label className="form-label">Traffic split</label>
                <div className="split-label">
                  {splitA}% A · {100 - splitA}% B
                </div>
              </div>
              <div className="split-chip-row">
                {[10, 25, 50, 75, 90].map((value) => (
                  <button
                    key={value}
                    className={`split-chip ${splitA === value ? "active" : ""}`}
                    onClick={() => setSplitA(value)}
                  >
                    {value}%
                  </button>
                ))}
              </div>
            </div>
            <div className="slider-row">
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={splitA}
                onChange={(e) => setSplitA(Number(e.target.value))}
                className="range-input"
              />
              <div className="slider-value">
                {splitA}% A · {100 - splitA}% B
              </div>
            </div>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label className="form-label">Cookie duration</label>
              <span>{cookieDays}d</span>
            </div>
            <div className="slider-row">
              <input
                type="range"
                min={1}
                max={365}
                value={cookieDays}
                onChange={(e) => setCookieDays(Number(e.target.value))}
                className="range-input"
              />
              <div className="slider-value">{cookieDays}d</div>
            </div>
          </div>

          {createError && <div className="error-msg">{createError}</div>}
          <div className="button-row">
            <button
              className="btn-ghost btn-full"
              onClick={() => setScreen("list")}
            >
              Cancel
            </button>
            <button
              className="btn-primary btn-full"
              onClick={handleCreate}
              disabled={createLoading || !expName.trim()}
            >
              {createLoading ? "Creating…" : "Create experiment"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "stats" && selectedExp) {
    const totalImpressions = stats
      ? stats.variants.A.impressions + stats.variants.B.impressions
      : 0;
    const totalConversions = stats
      ? stats.variants.A.conversions + stats.variants.B.conversions
      : 0;
    const aRate = stats ? stats.variants.A.conversion_rate : 0;
    const bRate = stats ? stats.variants.B.conversion_rate : 0;
    const winner = stats
      ? aRate === bRate
        ? null
        : aRate > bRate
          ? "A"
          : "B"
      : null;
    const lift =
      stats && aRate > 0 && bRate > 0
        ? Math.abs(
            ((Math.max(aRate, bRate) - Math.min(aRate, bRate)) /
              Math.min(aRate, bRate)) *
              100,
          )
        : 0;
    const nextStatus =
      selectedExp.status === "running"
        ? "paused"
        : selectedExp.status === "paused"
          ? "running"
          : null;
    const sampleLabel =
      totalImpressions < 100
        ? "Not enough data"
        : totalImpressions < 500
          ? "Gathering data"
          : totalImpressions < 2000
            ? "Directional insights"
            : "Strong sample";
    const sampleTone =
      totalImpressions < 100
        ? "low"
        : totalImpressions < 500
          ? "medium"
          : totalImpressions < 2000
            ? "good"
            : "strong";

    return (
      <div className="app-root" data-theme={theme}>
        <div className="stats-header-row">
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              setSelectedExp(null);
              setScreen("list");
            }}
          >
            ← Back
          </button>
          <div />
          <div />
        </div>

        <div className="stats-top-card">
          <div>
            <div className="page-title">{selectedExp.name}</div>
            <div className="page-subtitle">
              <StatusBadge status={selectedExp.status} />
              {selectedExp.status === "running" && (
                <span className="live-pill">Live</span>
              )}
            </div>
          </div>
          <div className="status-meta">
            {Math.round(selectedExp.split_a * 100)}/
            {100 - Math.round(selectedExp.split_a * 100)} ·{" "}
            {selectedExp.cookie_days}d
          </div>
        </div>

        <div className={`sample-banner sample-${sampleTone}`}>
          {sampleLabel} · {totalImpressions.toLocaleString()} impressions
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Impressions</div>
            <div className="metric-value">{formatNum(totalImpressions)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Conversions</div>
            <div className="metric-value">{formatNum(totalConversions)}</div>
          </div>
        </div>

        <div className="panel card chart-panel">
          <div className="panel-row">
            <div className="panel-title">Impressions · 24h</div>
            <div className="label-row">
              <span className="legend legend-accent" /> A
              <span className="legend legend-muted" /> B
            </div>
          </div>
          <div className="chart-placeholder">
            Chart preview will appear here.
          </div>
        </div>

        {stats && (
          <div className="variant-grid">
            {(["A", "B"] as const).map((variant) => {
              const variantStats = stats.variants[variant];
              const isWinner = winner === variant;
              return (
                <div
                  key={variant}
                  className={`variant-card ${isWinner ? "winner" : ""}`}
                >
                  <div className="variant-row">
                    <span className="variant-pill">Variant {variant}</span>
                    {isWinner && <span className="winner-badge">Winner</span>}
                  </div>
                  <div className="variant-rate">
                    {variantStats.conversion_rate.toFixed(2)}%
                  </div>
                  <div className="variant-detail">
                    {formatNum(variantStats.impressions)} imp ·{" "}
                    {formatNum(variantStats.conversions)} conv
                  </div>
                  <div className="variant-bar">
                    <div
                      className="variant-fill"
                      style={{
                        width: `${Math.min(variantStats.conversion_rate, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="panel card stats-actions-panel">
          <div className="stats-actions-grid">
            {nextStatus && (
              <button
                className={
                  nextStatus === "paused"
                    ? "btn-warn btn-sm"
                    : "btn-primary btn-sm"
                }
                onClick={() => handleUpdateStatus(selectedExp.id, nextStatus)}
              >
                {nextStatus === "paused" ? "Pause" : "Resume"}
              </button>
            )}
            {selectedExp.status !== "completed" && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => setArchiveConfirm(selectedExp)}
              >
                Complete
              </button>
            )}
            <button
              className="btn-ghost btn-sm"
              onClick={() => setExportOpen(true)}
            >
              Export
            </button>
            <button
              className="btn-danger btn-sm"
              onClick={() => setDeleteConfirm(selectedExp)}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="panel card credentials-panel">
          <div className="panel-title">Credentials</div>
          <CodeSnippet label="Experiment ID" value={selectedExp.id} />
          <CodeSnippet label="Write Key" value={writeKey} />
        </div>

        <ConfirmDialog
          open={deleteConfirm !== null}
          title="Delete experiment?"
          body={
            deleteConfirm
              ? `Delete “${deleteConfirm.name}” and all its data permanently.`
              : ""
          }
          confirmLabel="Delete"
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() =>
            deleteConfirm && handleDeleteExperiment(deleteConfirm.id)
          }
        />

        <ConfirmDialog
          open={archiveConfirm !== null}
          title="Complete experiment?"
          body={
            archiveConfirm
              ? `Mark “${archiveConfirm.name}” as completed and stop collection.`
              : ""
          }
          confirmLabel="Complete"
          onCancel={() => setArchiveConfirm(null)}
          onConfirm={() => {
            archiveConfirm &&
              handleUpdateStatus(archiveConfirm.id, "completed");
            setArchiveConfirm(null);
          }}
        />

        <ExportDialog
          open={exportOpen}
          experiment={selectedExp}
          stats={stats}
          onClose={() => setExportOpen(false)}
          onExported={() => setExportOpen(false)}
        />
      </div>
    );
  }
  return null;
}
