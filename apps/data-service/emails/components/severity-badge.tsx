const COLORS: Record<string, { background: string; color: string }> = {
  CRITICAL: { background: '#fee2e2', color: '#991b1b' },
  HIGH: { background: '#fef3c7', color: '#92400e' },
  MEDIUM: { background: '#fefce8', color: '#854d0e' },
  LOW: { background: '#ecfdf3', color: '#166534' },
  INFO: { background: '#eff6ff', color: '#1d4ed8' },
};

export interface SeverityBadgeProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const palette = COLORS[severity] ?? COLORS.INFO;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        backgroundColor: palette.background,
        color: palette.color,
      }}
    >
      {severity}
    </span>
  );
}
