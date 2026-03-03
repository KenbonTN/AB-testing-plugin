import { useState, useEffect } from 'react'
import { StatCard } from '@ab-platform/ui'
import type { ExperimentStats } from '@ab-platform/types'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

export function App() {
  const [experimentId, setExperimentId] = useState('demo')
  const [stats, setStats] = useState<ExperimentStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = async (exp = experimentId) => {
    try {
      const res = await fetch(`${API_URL}/stats?exp=${encodeURIComponent(exp)}`)
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchStats()
    const interval = setInterval(() => fetchStats(), 2000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId])

  if (loading) return <div className="app-root">Loading...</div>

  return (
    <div className="app-root">
      <h1 className="app-title">🧪 A/B Testing</h1>

      <div className="app-controls">
        <label className="app-label">
          Experiment ID
          <input
            className="app-input"
            value={experimentId}
            onChange={(e) => setExperimentId(e.target.value)}
          />
        </label>
        <button
          className="app-button"
          onClick={() => {
            setLoading(true)
            fetchStats()
          }}
        >
          Refresh
        </button>
      </div>

      {stats && (
        <div className="app-summary">
          <div>
            Experiment: <strong>{stats.experimentId}</strong>
          </div>
          <div>
            Total impressions: <strong>{stats.totalImpressions}</strong> · Total conversions:{' '}
            <strong>{stats.totalConversions}</strong>
          </div>
        </div>
      )}

      {stats && (
        <div className="app-grid">
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