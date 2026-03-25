import React, { useCallback, useEffect, useRef } from 'react'
import { addPropertyControls, ControlType } from 'framer'

interface ABConversionTriggerProps {
  experimentId: string
  writeKey: string
  eventName?: string
  triggerOn?: 'click' | 'mount' | 'visible'
  children: React.ReactNode
  respectConsent?: boolean
  consentCookieName?: string
  apiUrl?: string
}

const DEFAULT_API_URL = 'https://ab-testing-worker.kenbonfloziio.workers.dev'

// Must match keys used in ABSectionSwap
const variantCookieKey = (id: string) => `ab_${id}`
const visitorStorageKey = (id: string) => `ab-user-${id}`

export function ABConversionTrigger({
  experimentId,
  writeKey,
  eventName = 'conversion',
  triggerOn = 'click',
  children,
  respectConsent = true,
  consentCookieName = 'cookie_consent',
  apiUrl = DEFAULT_API_URL,
}: ABConversionTriggerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const firedRef = useRef(false)

  const hasConsent = (): boolean => {
    if (!respectConsent) return true
    const cookies = document.cookie.split('; ')
    const consentCookie = cookies.find(row => row.startsWith(`${consentCookieName}=`))
    if (!consentCookie) return false
    const value = consentCookie.split('=').slice(1).join('=')
    return value === 'true' || value === 'accepted' || value === '1'
  }

  // Read the variant assigned by ABSectionSwap from cookie
  const getAssignedVariant = (): 'A' | 'B' | null => {
    const key = variantCookieKey(experimentId)
    const found = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${key}=`))
    if (!found) return null
    const value = found.split('=').slice(1).join('=')
    return value === 'A' || value === 'B' ? value : null
  }

  const fireConversion = useCallback(async () => {
    if (!hasConsent()) return

    const variant = getAssignedVariant()
    // Spec: "If no assignment cookie: do nothing"
    if (!variant) return

    const visitorId = localStorage.getItem(visitorStorageKey(experimentId))

    try {
      await fetch(`${apiUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${writeKey}`,
        },
        body: JSON.stringify({
          experiment_id: experimentId,
          type: eventName,
          variant,
          visitor_id: visitorId,
        }),
      })
    } catch {
      // Fail silently — don't break the site
    }
  }, [experimentId, writeKey, eventName, apiUrl, respectConsent, consentCookieName]) // eslint-disable-line react-hooks/exhaustive-deps

  // triggerOn="mount" — fire once on mount
  useEffect(() => {
    if (triggerOn !== 'mount') return
    if (firedRef.current) return
    firedRef.current = true
    fireConversion()
  }, [triggerOn, fireConversion])

  // triggerOn="visible" — fire once when 50% of element enters viewport
  useEffect(() => {
    if (triggerOn !== 'visible') return
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true
            fireConversion()
            observer.disconnect()
          }
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [triggerOn, fireConversion])

  const handleClick = useCallback(() => {
    if (triggerOn !== 'click') return
    fireConversion()
  }, [triggerOn, fireConversion])

  return (
    <div
      ref={containerRef}
      onClick={triggerOn === 'click' ? handleClick : undefined}
      style={{ display: 'contents' }}
      data-ab-experiment={experimentId}
      data-ab-trigger={triggerOn}
    >
      {children}
    </div>
  )
}

addPropertyControls(ABConversionTrigger, {
  experimentId: {
    type: ControlType.String,
    title: 'Experiment ID',
  },
  writeKey: {
    type: ControlType.String,
    title: 'Write Key',
  },
  eventName: {
    type: ControlType.String,
    title: 'Event Name',
    defaultValue: 'conversion',
  },
  triggerOn: {
    type: ControlType.Enum,
    title: 'Trigger On',
    defaultValue: 'click',
    options: ['click', 'mount', 'visible'],
    optionTitles: ['Click', 'Mount', 'Visible (50%)'],
  },
  children: {
    type: ControlType.Slot,
    title: 'Content',
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
