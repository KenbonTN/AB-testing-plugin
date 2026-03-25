// Database Models

export interface Experiment {
  id: string
  name: string
  status: 'running' | 'paused' | 'completed'
  split_a: number       // 0.0 – 1.0, fraction assigned to Variant A
  cookie_days: number
  version: number
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  experiment_id: string
  experiment_version: number
  visitor_id: string | null
  variant: 'A' | 'B'
  type: string
  created_at: string
}

// API Request/Response Types

export interface TrackEventRequest {
  experiment_id: string
  type: string          // "impression" | "conversion" | custom
  variant: 'A' | 'B'
  visitor_id?: string | null
}

export interface VariantStats {
  impressions: number
  conversions: number
  conversion_rate: number  // percentage, e.g. 12.50
}

export interface ExperimentStats {
  experiment_id: string
  variants: {
    A: VariantStats
    B: VariantStats
  }
}
