import { useState, useEffect, useCallback } from 'react'
import type { Experiment, ExperimentStats } from '@ab-platform/types'
import { framer, supportsName, type CanvasNode } from 'framer-plugin'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'https://ab-testing-worker.kenbonfloziio.workers.dev'
const SK_WRITE = 'ab_write_key'
const SK_READ = 'ab_read_key'

// ─── code file templates ─────────────────────────────────────────────────────

function generateSectionSwapCode(experimentId: string, writeKey: string, apiUrl: string): string {
  return `import { useLayoutEffect, useState } from "react"
import { addPropertyControls, ControlType } from "framer"

export default function ABSectionSwap({
  experimentId = ${JSON.stringify(experimentId)},
  writeKey = ${JSON.stringify(writeKey)},
  cookieDays = 30,
  split = 50,
  variantA,
  variantB,
  respectConsent = false,
  consentCookieName = "cookie_consent",
  apiUrl = ${JSON.stringify(apiUrl)},
}) {
  const [variant, setVariant] = useState("A")
  const [visible, setVisible] = useState(false)

  const hasConsent = () => {
    if (!respectConsent) return true
    const c = document.cookie.split("; ").find(r => r.startsWith(\`\${consentCookieName}=\`))
    if (!c) return false
    const v = c.split("=").slice(1).join("=")
    return v === "true" || v === "accepted" || v === "1"
  }

  const getOrCreateVisitorId = () => {
    const key = \`ab-user-\${experimentId}\`
    let id = localStorage.getItem(key)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
    return id
  }

  const resolveVariant = () => {
    if (respectConsent && !hasConsent()) return "A"
    const key = \`ab_\${experimentId}\`
    const existing = document.cookie.split("; ").find(r => r.startsWith(\`\${key}=\`))
    if (existing) {
      const v = existing.split("=").slice(1).join("=")
      if (v === "A" || v === "B") return v
    }
    const assigned = Math.random() * 100 < split ? "A" : "B"
    const expires = new Date()
    expires.setDate(expires.getDate() + cookieDays)
    document.cookie = \`\${key}=\${assigned}; expires=\${expires.toUTCString()}; path=/; SameSite=Lax\`
    return assigned
  }

  useLayoutEffect(() => {
    const assigned = resolveVariant()
    setVariant(assigned)
    setVisible(true)
    if (!hasConsent()) return
    const trackedKey = \`ab-imp-\${experimentId}\`
    if (sessionStorage.getItem(trackedKey)) return
    sessionStorage.setItem(trackedKey, "1")
    const visitorId = getOrCreateVisitorId()
    fetch(\`\${apiUrl}/v1/events\`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: \`Bearer \${writeKey}\` },
      body: JSON.stringify({ experiment_id: experimentId, type: "impression", variant: assigned, visitor_id: visitorId }),
    }).then(res => { if (!res.ok) sessionStorage.removeItem(trackedKey) }).catch(() => sessionStorage.removeItem(trackedKey))
  }, [])

  return (
    <div style={{ visibility: visible ? "visible" : "hidden" }}>
      <div style={{ display: variant === "A" ? "contents" : "none" }}>{variantA}</div>
      <div style={{ display: variant === "B" ? "contents" : "none" }}>{variantB}</div>
    </div>
  )
}

addPropertyControls(ABSectionSwap, {
  experimentId: { type: ControlType.String, title: "Experiment ID", defaultValue: ${JSON.stringify(experimentId)} },
  writeKey: { type: ControlType.String, title: "Write Key", defaultValue: ${JSON.stringify(writeKey)} },
  cookieDays: { type: ControlType.Number, title: "Cookie Days", defaultValue: 30, min: 1, max: 365 },
  split: { type: ControlType.Number, title: "Split % (A)", defaultValue: 50, min: 0, max: 100 },
  variantA: { type: ControlType.Slot, title: "Variant A" },
  variantB: { type: ControlType.Slot, title: "Variant B" },
  respectConsent: { type: ControlType.Boolean, title: "Respect Consent", defaultValue: false },
  consentCookieName: { type: ControlType.String, title: "Consent Cookie Name", defaultValue: "cookie_consent" },
  apiUrl: { type: ControlType.String, title: "API URL", defaultValue: ${JSON.stringify(apiUrl)} },
})`
}

function generateConversionTriggerCode(experimentId: string, writeKey: string, apiUrl: string): string {
  return `import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

export default function ABConversionTrigger({
  experimentId = ${JSON.stringify(experimentId)},
  writeKey = ${JSON.stringify(writeKey)},
  eventName = "conversion",
  triggerOn = "click",
  children,
  respectConsent = false,
  consentCookieName = "cookie_consent",
  apiUrl = ${JSON.stringify(apiUrl)},
}) {
  const firedRef = useRef(false)
  const ref = useRef(null)

  const hasConsent = () => {
    if (!respectConsent) return true
    const c = document.cookie.split("; ").find(r => r.startsWith(\`\${consentCookieName}=\`))
    if (!c) return false
    const v = c.split("=").slice(1).join("=")
    return v === "true" || v === "accepted" || v === "1"
  }

  const track = () => {
    if (!hasConsent()) return
    const variantCookie = document.cookie.split("; ").find(r => r.startsWith(\`ab_\${experimentId}=\`))
    if (!variantCookie) return
    const variant = variantCookie.split("=").slice(1).join("=")
    if (variant !== "A" && variant !== "B") return
    const visitorId = localStorage.getItem(\`ab-user-\${experimentId}\`) ?? null
    fetch(\`\${apiUrl}/v1/events\`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: \`Bearer \${writeKey}\` },
      body: JSON.stringify({ experiment_id: experimentId, type: eventName, variant, visitor_id: visitorId }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (triggerOn === "mount") { track(); return }
    if (triggerOn === "visible" && ref.current) {
      const obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !firedRef.current) { firedRef.current = true; track(); obs.disconnect() }
      }, { threshold: 0.5 })
      obs.observe(ref.current)
      return () => obs.disconnect()
    }
  }, [])

  if (triggerOn === "click") {
    return (
      <div ref={ref} onClick={() => { if (!firedRef.current) { firedRef.current = true; track() } }}>
        {children}
      </div>
    )
  }
  return <div ref={ref}>{children}</div>
}

addPropertyControls(ABConversionTrigger, {
  experimentId: { type: ControlType.String, title: "Experiment ID", defaultValue: ${JSON.stringify(experimentId)} },
  writeKey: { type: ControlType.String, title: "Write Key", defaultValue: ${JSON.stringify(writeKey)} },
  eventName: { type: ControlType.String, title: "Event Name", defaultValue: "conversion" },
  triggerOn: { type: ControlType.Enum, title: "Trigger On", options: ["click", "mount", "visible"], defaultValue: "click" },
  children: { type: ControlType.Slot, title: "Children" },
  respectConsent: { type: ControlType.Boolean, title: "Respect Consent", defaultValue: false },
  consentCookieName: { type: ControlType.String, title: "Consent Cookie Name", defaultValue: "cookie_consent" },
  apiUrl: { type: ControlType.String, title: "API URL", defaultValue: ${JSON.stringify(apiUrl)} },
})`
}

type Screen = 'loading' | 'setup' | 'list' | 'create' | 'stats'

// ─── helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    running: '#22c55e',
    paused: '#f59e0b',
    completed: '#6b7280',
  }
  return (
    <span className="badge" style={{ background: colors[status] ?? '#6b7280' }}>
      {status}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button className="btn-ghost btn-xs" onClick={copy}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="snippet-row">
      <span className="snippet-label">{label}</span>
      <code className="snippet-value">{value}</code>
      <CopyButton text={value} />
    </div>
  )
}

function SampleSizeBanner({ impressions }: { impressions: number }) {
  let message: string
  let className: string
  if (impressions < 30) {
    message = 'Not enough data yet'
    className = 'sample-banner sample-banner--low'
  } else if (impressions < 100) {
    message = 'Gathering data, results may change'
    className = 'sample-banner sample-banner--medium'
  } else if (impressions < 500) {
    message = 'Enough for directional insights'
    className = 'sample-banner sample-banner--good'
  } else {
    message = 'Strong sample size'
    className = 'sample-banner sample-banner--strong'
  }
  return <div className={className}>{message} ({impressions.toLocaleString()} impressions total)</div>
}

// ─── main app ───────────────────────────────────────────────────────────────

export function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [writeKey, setWriteKey] = useState('')
  const [readKey, setReadKey] = useState('')

  // list
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  // stats
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null)
  const [stats, setStats] = useState<ExperimentStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)

  // selection
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null)
  const [nodeLinkedExpId, setNodeLinkedExpId] = useState<string | null>(null)

  // setup form
  const [projectName, setProjectName] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  // create form
  const [expName, setExpName] = useState('')
  const [splitA, setSplitA] = useState(50)
  const [cookieDays, setCookieDays] = useState(30)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [injectionStatus, setInjectionStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // ── init: load keys from Framer plugin storage (async) ────────────────────

  useEffect(() => {
    Promise.all([
      framer.getPluginData(SK_READ),
      framer.getPluginData(SK_WRITE),
    ]).then(([rk, wk]) => {
      const r = rk ?? ''
      const w = wk ?? ''
      setReadKey(r)
      setWriteKey(w)
      setScreen(r ? 'list' : 'setup')
    }).catch(() => {
      setScreen('setup')
    })
  }, [])

  // ── selection subscription (deferred until after init) ────────────────────

  useEffect(() => {
    if (screen === 'loading') return
    return framer.subscribeToSelection((nodes) => {
      setSelectedNode(nodes[0] ?? null)
    })
  }, [screen])

  // ── read plugin data on node selection change ──────────────────────────────

  useEffect(() => {
    if (screen === 'loading' || !selectedNode) {
      setNodeLinkedExpId(null)
      return
    }
    selectedNode.getPluginData('ab_experiment_id').then(setNodeLinkedExpId)
  }, [screen, selectedNode])

  // ── fetch experiments ─────────────────────────────────────────────────────

  const fetchExperiments = useCallback(async (key = readKey) => {
    if (!key) return
    setListLoading(true)
    setListError(null)
    try {
      const res = await fetch(`${API_URL}/v1/experiments`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as any).error ?? `HTTP ${res.status}`)
      }
      setExperiments(await res.json())
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setListLoading(false)
    }
  }, [readKey])

  useEffect(() => {
    if (screen === 'list') fetchExperiments()
  }, [screen, fetchExperiments])

  // ── fetch stats (30s auto-refresh per spec) ────────────────────────────────

  const fetchStats = useCallback(async (exp: Experiment, key = readKey) => {
    if (!exp || !key) return
    try {
      const res = await fetch(`${API_URL}/v1/experiments/${encodeURIComponent(exp.id)}/stats`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as any).error ?? `HTTP ${res.status}`)
      }
      const data: ExperimentStats = await res.json()
      setStats(data)
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e))
    }
  }, [readKey])

  useEffect(() => {
    if (screen !== 'stats' || !selectedExp) return
    setStats(null)
    setStatsError(null)
    setStatsLoading(true)
    fetchStats(selectedExp).finally(() => setStatsLoading(false))
    const id = setInterval(() => fetchStats(selectedExp), 30_000) // 30s per spec
    return () => clearInterval(id)
  }, [screen, selectedExp, fetchStats])

  // ── setup ─────────────────────────────────────────────────────────────────

  const handleSetup = async () => {
    if (!projectName.trim()) return
    setSetupLoading(true)
    setSetupError(null)
    try {
      const res = await fetch(`${API_URL}/v1/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim() }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as any).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      // Persist keys in Framer plugin storage
      await Promise.all([
        framer.setPluginData(SK_WRITE, data.write_key),
        framer.setPluginData(SK_READ, data.read_key),
      ])
      setWriteKey(data.write_key)
      setReadKey(data.read_key)
      setScreen('list')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e))
    } finally {
      setSetupLoading(false)
    }
  }

  // ── inject code files into Framer project ────────────────────────────────

  const injectComponents = async (experimentId: string, expWriteKey: string) => {
    const swapCode = generateSectionSwapCode(experimentId, expWriteKey, API_URL)
    const triggerCode = generateConversionTriggerCode(experimentId, expWriteKey, API_URL)
    const existingFiles = await framer.getCodeFiles()
    const swapFile = existingFiles.find(f => f.name === 'ABSectionSwap')
    const triggerFile = existingFiles.find(f => f.name === 'ABConversionTrigger')
    await Promise.all([
      swapFile ? swapFile.setFileContent(swapCode) : framer.createCodeFile('ABSectionSwap', swapCode),
      triggerFile ? triggerFile.setFileContent(triggerCode) : framer.createCodeFile('ABConversionTrigger', triggerCode),
    ])
  }

  // ── create experiment ─────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!expName.trim()) return
    setCreateLoading(true)
    setCreateError(null)
    try {
      const res = await fetch(`${API_URL}/v1/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readKey}` },
        body: JSON.stringify({ name: expName.trim(), split_a: splitA / 100, cookie_days: cookieDays }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as any).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setCreatedId(data.experiment_id)
      // Link experiment ID to selected canvas node
      if (selectedNode) {
        await selectedNode.setPluginData('ab_experiment_id', data.experiment_id)
        setNodeLinkedExpId(data.experiment_id)
      }
      // Inject pre-configured code components into the Framer project
      try {
        await injectComponents(data.experiment_id, writeKey)
        setInjectionStatus('success')
      } catch {
        setInjectionStatus('error')
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreateLoading(false)
    }
  }

  const handleResetCreate = () => {
    setExpName('')
    setSplitA(50)
    setCookieDays(30)
    setCreatedId(null)
    setCreateError(null)
    setInjectionStatus('idle')
  }

  // ── status / reset ────────────────────────────────────────────────────────

  const handleUpdateStatus = async (expId: string, status: string) => {
    try {
      await fetch(`${API_URL}/v1/experiments/${encodeURIComponent(expId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readKey}` },
        body: JSON.stringify({ status }),
      })
      if (selectedExp?.id === expId) {
        setSelectedExp(prev => prev ? { ...prev, status: status as Experiment['status'] } : prev)
        fetchStats({ ...selectedExp!, status: status as Experiment['status'] })
      }
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleReset = async (expId: string) => {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }
    setResetConfirm(false)
    try {
      const res = await fetch(`${API_URL}/v1/experiments/${encodeURIComponent(expId)}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${readKey}` },
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as any).error ?? `HTTP ${res.status}`)
      }
      setStats(null)
      setStatsLoading(true)
      if (selectedExp) await fetchStats(selectedExp)
      setStatsLoading(false)
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e))
      setStatsLoading(false)
    }
  }

  const handleLogout = async () => {
    await Promise.all([
      framer.setPluginData(SK_READ, null),
      framer.setPluginData(SK_WRITE, null),
    ])
    setReadKey('')
    setWriteKey('')
    setExperiments([])
    setSelectedExp(null)
    setProjectName('')
    setScreen('setup')
  }

  // ── navigation ────────────────────────────────────────────────────────────

  const openStats = (exp: Experiment) => {
    setSelectedExp(exp)
    setStats(null)
    setStatsError(null)
    setScreen('stats')
  }

  const openCreate = () => {
    handleResetCreate()
    setScreen('create')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <div className="app-root">
        <div className="spinner-wrap">
          <div className="spinner" />
          <span className="muted">Loading…</span>
        </div>
      </div>
    )
  }

  if (screen === 'setup') {
    return (
      <div className="app-root">
        <h1 className="app-title">A/B Testing</h1>
        <p className="app-subtitle">Create a project to get started.</p>
        <div className="form-group">
          <label className="form-label">Project name</label>
          <input
            className="form-input"
            placeholder="My Framer Project"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
          />
        </div>
        {setupError && <div className="error-msg">{setupError}</div>}
        <button className="btn-primary" onClick={handleSetup} disabled={setupLoading || !projectName.trim()}>
          {setupLoading ? 'Creating…' : 'Create Project'}
        </button>
      </div>
    )
  }

  if (screen === 'list') {
    return (
      <div className="app-root">
        <div className="header-row">
          <h1 className="app-title">Experiments</h1>
          <div className="header-actions">
            <button className="btn-primary btn-sm" onClick={openCreate}>+ New</button>
            <button className="btn-ghost btn-sm" onClick={() => fetchExperiments()}>↻</button>
            <button className="btn-ghost btn-sm" title="Log out / reset keys" onClick={handleLogout}>⚙</button>
          </div>
        </div>

        {nodeLinkedExpId && (() => {
          const linked = experiments.find(e => e.id === nodeLinkedExpId)
          return linked ? (
            <div className="layer-indicator layer-indicator--linked" onClick={() => openStats(linked)}>
              Selected layer linked to <strong>{linked.name}</strong> — View stats →
            </div>
          ) : null
        })()}

        {listError && <div className="error-msg">{listError}</div>}
        {listLoading && <div className="muted">Loading…</div>}

        {!listLoading && experiments.length === 0 && !listError && (
          <div className="empty-state">
            <p>No experiments yet.</p>
            <button className="btn-primary btn-sm" onClick={openCreate}>Create your first experiment</button>
          </div>
        )}

        <div className="exp-list">
          {experiments.map(exp => (
            <div key={exp.id} className="exp-card" onClick={() => openStats(exp)}>
              <div className="exp-card-top">
                <span className="exp-name">{exp.name}</span>
                {statusBadge(exp.status)}
              </div>
              <div className="exp-meta">
                Split {Math.round(exp.split_a * 100)}% A / {Math.round((1 - exp.split_a) * 100)}% B
                &nbsp;·&nbsp; {exp.cookie_days}d cookie
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'create') {
    if (createdId) {
      return (
        <div className="app-root">
          <div className="header-row">
            <button className="btn-ghost btn-sm" onClick={() => { handleResetCreate(); setScreen('list') }}>← Back</button>
          </div>
          <h1 className="app-title">Experiment Created</h1>
          <p className="app-subtitle">Copy these values into your Framer components.</p>

          <div className="snippet-block">
            <CodeSnippet label="Experiment ID" value={createdId} />
            <CodeSnippet label="Write Key" value={writeKey} />
            <CodeSnippet label="Read Key" value={readKey} />
          </div>

          <div className="info-box">
            <strong>How to use</strong>
            <ol className="how-to-list">
              <li>Add <code>ABSectionSwap</code> to your canvas — paste the <em>Experiment ID</em> + <em>Write Key</em> into its props.</li>
              <li>Drop your A and B content into the Variant A / Variant B slots.</li>
              <li>Wrap your CTA with <code>ABConversionTrigger</code> using the same IDs.</li>
              <li>Publish your site — tracking starts automatically.</li>
              <li>Return here anytime to view live stats.</li>
            </ol>
          </div>

          <div className="btn-row">
            <button className="btn-primary" onClick={() => { handleResetCreate(); setScreen('list') }}>View All Experiments</button>
            <button className="btn-ghost" onClick={handleResetCreate}>Create Another</button>
          </div>
        </div>
      )
    }

    return (
      <div className="app-root">
        <div className="header-row">
          <button className="btn-ghost btn-sm" onClick={() => setScreen('list')}>← Back</button>
        </div>
        <h1 className="app-title">New Experiment</h1>

        {selectedNode ? (
          <div className="layer-indicator layer-indicator--selected">
            Layer: <strong>{supportsName(selectedNode) ? (selectedNode.name ?? 'Unnamed') : 'Unnamed'}</strong>
            <span className="layer-id"> {selectedNode.id.slice(0, 8)}…</span>
          </div>
        ) : (
          <div className="layer-indicator layer-indicator--empty">
            No layer selected — select a frame to link this experiment to it
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="form-input"
            placeholder="Homepage hero test"
            value={expName}
            onChange={e => setExpName(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Variant A traffic</label>
            <div className="input-with-suffix">
              <input
                className="form-input"
                type="number"
                min={1}
                max={99}
                value={splitA}
                onChange={e => setSplitA(Number(e.target.value))}
              />
              <span className="input-suffix">%</span>
            </div>
            <span className="form-hint">Variant B gets {100 - splitA}%</span>
          </div>

          <div className="form-group">
            <label className="form-label">Cookie duration</label>
            <div className="input-with-suffix">
              <input
                className="form-input"
                type="number"
                min={1}
                max={365}
                value={cookieDays}
                onChange={e => setCookieDays(Number(e.target.value))}
              />
              <span className="input-suffix">days</span>
            </div>
          </div>
        </div>

        {createError && <div className="error-msg">{createError}</div>}

        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={createLoading || !expName.trim()}
        >
          {createLoading ? 'Creating…' : 'Create Experiment'}
        </button>
      </div>
    )
  }

  // ── stats screen ──────────────────────────────────────────────────────────

  if (screen === 'stats' && selectedExp) {
    const totalImpressions = stats ? stats.variants.A.impressions + stats.variants.B.impressions : 0
    const totalConversions = stats ? stats.variants.A.conversions + stats.variants.B.conversions : 0
    const winner: 'A' | 'B' | null = stats
      ? stats.variants.A.conversion_rate > stats.variants.B.conversion_rate ? 'A'
        : stats.variants.B.conversion_rate > stats.variants.A.conversion_rate ? 'B'
        : null
      : null

    const nextStatus =
      selectedExp.status === 'running' ? 'paused'
      : selectedExp.status === 'paused' ? 'running'
      : null

    return (
      <div className="app-root">
        <div className="header-row">
          <button className="btn-ghost btn-sm" onClick={() => { setResetConfirm(false); setSelectedExp(null); setScreen('list') }}>← Back</button>
          <div className="header-actions">
            {nextStatus && (
              <button
                className={nextStatus === 'paused' ? 'btn-warn btn-sm' : 'btn-primary btn-sm'}
                onClick={() => handleUpdateStatus(selectedExp.id, nextStatus)}
              >
                {nextStatus === 'paused' ? 'Pause' : 'Resume'}
              </button>
            )}
            {selectedExp.status !== 'completed' && (
              <button className="btn-ghost btn-sm" onClick={() => handleUpdateStatus(selectedExp.id, 'completed')}>
                Complete
              </button>
            )}
            <button className="btn-danger btn-sm" onClick={() => handleReset(selectedExp.id)}>
              {resetConfirm ? 'Confirm Reset?' : 'Reset'}
            </button>
          </div>
        </div>

        <div className="stats-header">
          <h1 className="app-title">{selectedExp.name}</h1>
          {statusBadge(selectedExp.status)}
        </div>

        {statsError && <div className="error-msg">{statsError}</div>}
        {statsLoading && !stats && <div className="muted">Loading stats…</div>}

        {stats && (
          <>
            <SampleSizeBanner impressions={totalImpressions} />

            <div className="stats-summary">
              <div className="summary-item">
                <span className="summary-value">{totalImpressions.toLocaleString()}</span>
                <span className="summary-label">Total impressions</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{totalConversions.toLocaleString()}</span>
                <span className="summary-label">Total conversions</span>
              </div>
            </div>

            <div className="variants-grid">
              {(['A', 'B'] as const).map(v => {
                const vStats = stats.variants[v]
                const isWinner = winner === v
                return (
                  <div key={v} className={`variant-card ${isWinner ? 'variant-winner' : ''}`}>
                    <div className="variant-header">
                      <span className="variant-label">Variant {v}</span>
                      {isWinner && <span className="winner-badge">Winner</span>}
                    </div>
                    <div className="variant-rate">{vStats.conversion_rate.toFixed(2)}%</div>
                    <div className="variant-detail">
                      <span>{vStats.impressions.toLocaleString()} impressions</span>
                      <span>{vStats.conversions.toLocaleString()} conversions</span>
                    </div>
                    <div className="variant-bar-track">
                      <div
                        className="variant-bar-fill"
                        style={{ width: `${Math.min(vStats.conversion_rate, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="snippet-block">
              <p className="snippet-title">Component config</p>
              <CodeSnippet label="Experiment ID" value={selectedExp.id} />
              <CodeSnippet label="Write Key" value={writeKey} />
            </div>
          </>
        )}
      </div>
    )
  }

  return null
}
