import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

export function StatCard({ label, value, color = 'inherit' }: StatCardProps) {
  return (
    <div>
      <div style={{ fontSize: '0.9rem', color: '#aaa' }}>{label}</div>
      <div className="metric-value" style={{ color }}>{value}</div>
    </div>
  );
}
