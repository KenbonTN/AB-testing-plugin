export interface Experiment {
    id: string;
    name: string;
    split: number;
    status: 'running' | 'paused' | 'completed';
    winner?: 'A' | 'B' | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface Variant {
    experimentId: string;
    name: 'A' | 'B';
    impressions: number;
    conversions: number;
    conversionRate: number;
}
export interface Assignment {
    experimentId: string;
    userId: string;
    variant: 'A' | 'B';
    createdAt: Date;
}
export interface ConversionEvent {
    experimentId: string;
    variant: 'A' | 'B';
    userId: string;
    type: 'click' | 'submit' | 'custom';
    metadata?: Record<string, any>;
    timestamp: Date;
}
export interface AssignVariantRequest {
    experimentId: string;
    userId?: string;
}
export interface AssignVariantResponse {
    variant: 'A' | 'B';
    experimentId: string;
    userId: string;
}
export interface TrackConversionRequest {
    experimentId: string;
    variant: 'A' | 'B';
    userId: string;
    type: string;
    metadata?: Record<string, any>;
}
export interface ExperimentStats {
    experimentId: string;
    variants: {
        A: VariantStats;
        B: VariantStats;
    };
    totalImpressions: number;
    totalConversions: number;
    confidenceLevel?: number;
}
interface VariantStats {
    impressions: number;
    conversions: number;
    conversionRate: number;
    improvement?: number;
}
export {};
