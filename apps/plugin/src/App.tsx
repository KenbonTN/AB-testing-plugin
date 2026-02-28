import { framer } from 'framer-plugin'
import { useState, useEffect } from 'react'
import { StatCard } from '@ab-platform/ui'
import type { ExperimentStats } from '@ab-platform/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

export function App() {
  const [stats, setStats] = useState<ExperimentStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 2000)
    return () => clearInterval(interval)
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats?exp=demo`)
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ padding: '16px' }}>
      <h1>🧪 A/B Testing</h1>
      {stats && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <StatCard 
            title="Variant A" 
            impressions={stats.variants.A.impressions}
            conversions={stats.variants.A.conversions}
          />
          <StatCard 
            title="Variant B" 
            impressions={stats.variants.B.impressions}
            conversions={stats.variants.B.conversions}
          />
        </div>
      )}
    </div>
  )
}
