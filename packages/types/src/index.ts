// Database Models

export interface Experiment {
  id: string
  name: string
  split: number
  status: 'running' | 'paused' | 'completed'
  winner: 'A' | 'B' | null
  created_at: string
  updated_at: string
}

export interface Assignment {
  user_id: string
  experiment_id: string
  variant: 'A' | 'B'
  created_at: string
}

export interface Impression {
  id: number
  experiment_id: string
  variant: 'A' | 'B'
  user_id: string | null
  timestamp: string
}

export interface Conversion {
  id: number
  experiment_id: string
  variant: 'A' | 'B'
  user_id: string | null
  timestamp: string
}

// API Request/Response Types

export interface AssignVariantRequest {
  experiment_id: string
  user_id?: string
}

export interface AssignVariantResponse {
  variant: 'A' | 'B'
  experiment_id: string
  user_id: string
}

export interface TrackEventRequest {
  experiment_id: string
  variant: 'A' | 'B'
  user_id?: string
}

export interface ExperimentStats {
  experiment_id: string
  variant: 'A' | 'B'
  impressions: number
  conversions: number
  conversion_rate: number
}
