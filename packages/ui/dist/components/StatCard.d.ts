import React from 'react';
interface StatCardProps {
    title: string;
    impressions: number;
    conversions: number;
    isWinner?: boolean;
}
export declare const StatCard: React.FC<StatCardProps>;
export {};
