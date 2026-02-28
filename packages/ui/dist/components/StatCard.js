import { jsxs as _jsxs } from "react/jsx-runtime";
export const StatCard = ({ title, impressions, conversions, isWinner }) => {
    const rate = impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : '0.00';
    return (_jsxs("div", { style: {
            padding: '16px',
            background: isWinner ? '#dcfce7' : '#f4f4f5',
            borderRadius: '8px',
            border: isWinner ? '2px solid #22c55e' : '1px solid #e5e7eb'
        }, children: [_jsxs("h3", { style: { margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }, children: [title, " ", isWinner && '🏆'] }), _jsxs("div", { style: { fontSize: '24px', fontWeight: 'bold' }, children: [rate, "%"] }), _jsxs("div", { style: { fontSize: '12px', color: '#6b7280', marginTop: '4px' }, children: [impressions, " views \u00B7 ", conversions, " conversions"] })] }));
};
