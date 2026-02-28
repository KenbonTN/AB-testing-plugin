import React from 'react'

interface StatCardProps {
  title: string
  impressions: number
  conversions: number
  isWinner?: boolean
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  impressions,
  conversions,
  isWinner
}) => {
  const rate = impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : '0.00'
  
  return (
    <div style={{
      padding: '16px',
      background: isWinner ? '#dcfce7' : '#f4f4f5',
      borderRadius: '8px',
      border: isWinner ? '2px solid #22c55e' : '1px solid #e5e7eb'
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
        {title} {isWinner && '🏆'}
      </h3>
      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{rate}%</div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
        {impressions} views · {conversions} conversions
      </div>
    </div>
  )
}
