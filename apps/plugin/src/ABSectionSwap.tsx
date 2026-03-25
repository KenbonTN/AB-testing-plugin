import React, { useLayoutEffect, useState } from 'react'
import { addPropertyControls, ControlType } from 'framer'

interface ABSectionSwapProps {
  experimentId: string
  writeKey: string
  cookieDays?: number
  split?: number
  variantA: React.ReactNode
  variantB: React.ReactNode
  respectConsent?: boolean
  consentCookieName?: string
  apiUrl?: string
}

const DEFAULT_API_URL = 'https://ab-testing-worker.kenbonfloziio.workers.dev'

// Cookie keys — must match ABConversionTrigger
const variantCookieKey = (id: string) => `ab_${id}`
const visitorStorageKey = (id: string) => `ab-user-${id}`
const impressionTrackedKey = (id: string) => `ab-imp-${id}`

export function ABSectionSwap({
  experimentId,
  writeKey,
  cookieDays = 30,
  split = 50,
  variantA,
  variantB,
  respectConsent = true,
  consentCookieName = 'cookie_consent',
  apiUrl = DEFAULT_API_URL,
}: ABSectionSwapProps) {
  // Start hidden + default A — useLayoutEffect resolves before first paint
  const [variant, setVariant] = useState<'A' | 'B'>('A')
  const [visible, setVisible] = useState(false)

  const hasConsent = (): boolean => {
    if (!respectConsent) return true
    const cookies = document.cookie.split('; ')
    const consentCookie = cookies.find(row => row.startsWith(`${consentCookieName}=`))
    if (!consentCookie) return false
    const value = consentCookie.split('=').slice(1).join('=')
    return value === 'true' || value === 'accepted' || value === '1'
  }

  const getOrCreateVisitorId = (): string => {
    const key = visitorStorageKey(experimentId)
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  }

  // Synchronous: reads from cookie or assigns new variant
  const resolveVariant = (): 'A' | 'B' => {
    // No consent — show control, no cookie, no tracking
    if (respectConsent && !hasConsent()) return 'A'

    const key = variantCookieKey(experimentId)
    const existing = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${key}=`))

    if (existing) {
      const value = existing.split('=').slice(1).join('=')
      if (value === 'A' || value === 'B') return value
    }

    // New assignment
    const assigned: 'A' | 'B' = Math.random() * 100 < split ? 'A' : 'B'
    const expires = new Date()
    expires.setDate(expires.getDate() + cookieDays)
    document.cookie = `${key}=${assigned}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
    return assigned
  }

  const trackImpression = async (assignedVariant: 'A' | 'B') => {
    if (!hasConsent()) return

    // Deduplicate per session
    const trackedKey = impressionTrackedKey(experimentId)
    if (sessionStorage.getItem(trackedKey)) return
    sessionStorage.setItem(trackedKey, '1')

    try {
      const visitorId = getOrCreateVisitorId()
      await fetch(`${apiUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${writeKey}`,
        },
        body: JSON.stringify({
          experiment_id: experimentId,
          type: 'impression',
          variant: assignedVariant,
          visitor_id: visitorId,
        }),
      })
    } catch {
      // Remove dedup flag so it can retry on next mount if request failed
      sessionStorage.removeItem(impressionTrackedKey(experimentId))
    }
  }

  // useLayoutEffect fires synchronously before browser paint — prevents flicker
  useLayoutEffect(() => {
    const assigned = resolveVariant()
    setVariant(assigned)
    setVisible(true)
    trackImpression(assigned) // async, non-blocking — fire and forget
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ visibility: visible ? 'visible' : 'hidden' }}>
      {variant === 'A' ? variantA : variantB}
    </div>
  )
}

addPropertyControls(ABSectionSwap, {
  experimentId: {
    type: ControlType.String,
    title: 'Experiment ID',
  },
  writeKey: {
    type: ControlType.String,
    title: 'Write Key',
  },
  cookieDays: {
    type: ControlType.Number,
    title: 'Cookie Days',
    defaultValue: 30,
    min: 1,
    max: 365,
  },
  split: {
    type: ControlType.Number,
    title: 'Split % (Variant A)',
    defaultValue: 50,
    min: 0,
    max: 100,
  },
  variantA: {
    type: ControlType.Slot,
    title: 'Variant A',
  },
  variantB: {
    type: ControlType.Slot,
    title: 'Variant B',
  },
  respectConsent: {
    type: ControlType.Boolean,
    title: 'Respect Consent',
    defaultValue: true,
  },
  consentCookieName: {
    type: ControlType.String,
    title: 'Consent Cookie Name',
    defaultValue: 'cookie_consent',
  },
  apiUrl: {
    type: ControlType.String,
    title: 'API URL',
    defaultValue: DEFAULT_API_URL,
  },
})
