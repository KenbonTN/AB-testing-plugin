import { useLayoutEffect, useState, useEffect, useRef, type ReactNode } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

const DEFAULT_API_URL = "https://ab-testing-worker.kenbonfloziio.workers.dev"

interface ABTestingProps {
  experimentId: string
  writeKey: string
  cookieDays?: number
  split?: number
  variantA?: ReactNode
  variantB?: ReactNode
  eventName?: string
  triggerOn?: "click" | "mount" | "visible" | "submit"
  respectConsent?: boolean
  consentCookieName?: string
  apiUrl?: string
}

export default function ABTesting({
  experimentId = "",
  writeKey = "",
  cookieDays = 30,
  split = 50,
  variantA,
  variantB,
  eventName = "conversion",
  triggerOn = "click",
  respectConsent = false,
  consentCookieName = "cookie_consent",
  apiUrl = DEFAULT_API_URL,
}: ABTestingProps) {
  const [variant, setVariant] = useState<"A" | "B">("A")
  const [visible, setVisible] = useState(false)
  const firedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  const hasConsent = (): boolean => {
    if (!respectConsent) return true
    const cookies = document.cookie.split("; ")
    const consentCookie = cookies.find((row) =>
      row.startsWith(`${consentCookieName}=`),
    )
    if (!consentCookie) return false
    const value = consentCookie.split("=").slice(1).join("=")
    return value === "true" || value === "accepted" || value === "1"
  }

  const getOrCreateVisitorId = (): string => {
    const key = `ab-user-${experimentId}`
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  }

  const resolveVariant = (): "A" | "B" => {
    if (respectConsent && !hasConsent()) return "A"

    const key = `ab_${experimentId}`
    const existing = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${key}=`))

    if (existing) {
      const value = existing.split("=").slice(1).join("=")
      if (value === "A" || value === "B") return value
    }

    const assigned: "A" | "B" = Math.random() * 100 < split ? "A" : "B"
    const expires = new Date()
    expires.setDate(expires.getDate() + cookieDays)
    document.cookie = `${key}=${assigned}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
    return assigned
  }

  const trackImpression = async (assignedVariant: "A" | "B") => {
    if (!hasConsent()) return
    const trackedKey = `ab-imp-${experimentId}`
    if (sessionStorage.getItem(trackedKey)) return
    sessionStorage.setItem(trackedKey, "1")

    try {
      const visitorId = getOrCreateVisitorId()
      const res = await fetch(`${apiUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${writeKey}`,
        },
        body: JSON.stringify({
          experiment_id: experimentId,
          type: "impression",
          variant: assignedVariant,
          visitor_id: visitorId,
        }),
      })
      if (!res.ok) {
        sessionStorage.removeItem(`ab-imp-${experimentId}`)
      }
    } catch {
      sessionStorage.removeItem(`ab-imp-${experimentId}`)
    }
  }

  // ──── Assign variant + track impression ──────────────────────────────────
  useLayoutEffect(() => {
    if (RenderTarget.current() === RenderTarget.canvas) {
      setVisible(true)
      return
    }
    const assigned = resolveVariant()
    setVariant(assigned)
    setVisible(true)
    trackImpression(assigned)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ──── Track conversion event ─────────────────────────────────────────────
  const trackConversion = () => {
    if (!hasConsent()) return
    const variantCookie = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`ab_${experimentId}=`))
    if (!variantCookie) return
    const v = variantCookie.split("=").slice(1).join("=")
    if (v !== "A" && v !== "B") return
    const visitorId = localStorage.getItem(`ab-user-${experimentId}`) ?? null
    fetch(`${apiUrl}/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${writeKey}`,
      },
      body: JSON.stringify({
        experiment_id: experimentId,
        type: eventName,
        variant: v,
        visitor_id: visitorId,
      }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (triggerOn === "mount") {
      trackConversion()
      return
    }
    if (triggerOn === "visible" && ref.current) {
      const obs = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting && !firedRef.current) {
            firedRef.current = true
            trackConversion()
            obs.disconnect()
          }
        },
        { threshold: 0.5 },
      )
      obs.observe(ref.current)
      return () => obs.disconnect()
    }
    if (triggerOn === "submit" && ref.current) {
      const el = ref.current as any
      const form = el.tagName === "FORM" ? el : el.querySelector("form")
      if (form) {
        const handleSubmit = () => {
          if (!firedRef.current) {
            firedRef.current = true
            trackConversion()
          }
        }
        form.addEventListener("submit", handleSubmit)
        return () => form.removeEventListener("submit", handleSubmit)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ──── Render ─────────────────────────────────────────────────────────────
  const handleClick =
    triggerOn === "click"
      ? () => {
          if (!firedRef.current) {
            firedRef.current = true
            trackConversion()
          }
        }
      : undefined

  return (
    <div
      ref={ref}
      style={{ visibility: visible ? "visible" : "hidden" }}
      onClick={handleClick}
    >
      <div style={{ display: variant === "A" ? "contents" : "none" }}>
        {variantA}
      </div>
      <div style={{ display: variant === "B" ? "contents" : "none" }}>
        {variantB}
      </div>
    </div>
  )
}

addPropertyControls(ABTesting, {
  experimentId: {
    type: ControlType.String,
    title: "Experiment ID",
  },
  writeKey: {
    type: ControlType.String,
    title: "Write Key",
  },
  cookieDays: {
    type: ControlType.Number,
    title: "Cookie Days",
    defaultValue: 30,
    min: 1,
    max: 365,
  },
  split: {
    type: ControlType.Number,
    title: "Split % (Variant A)",
    defaultValue: 50,
    min: 0,
    max: 100,
  },
  variantA: {
    type: ControlType.Slot,
    title: "Variant A",
  },
  variantB: {
    type: ControlType.Slot,
    title: "Variant B",
  },
  eventName: {
    type: ControlType.String,
    title: "Event Name",
    defaultValue: "conversion",
  },
  triggerOn: {
    type: ControlType.Enum,
    title: "Trigger On",
    options: ["click", "mount", "visible", "submit"],
    optionTitles: ["Click", "Mount", "Visible (50%)", "Submit (Form)"],
    defaultValue: "click",
  },
  respectConsent: {
    type: ControlType.Boolean,
    title: "Respect Consent",
    defaultValue: false,
  },
  consentCookieName: {
    type: ControlType.String,
    title: "Consent Cookie Name",
    defaultValue: "cookie_consent",
  },
  apiUrl: {
    type: ControlType.String,
    title: "API URL",
    defaultValue: DEFAULT_API_URL,
  },
})
