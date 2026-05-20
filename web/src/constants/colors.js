export const colors = {
  bg: '#0D1117',
  surface: '#161B22',
  surfaceAlt: '#1C2330',
  border: '#21262D',
  borderStrong: '#30363D',
  text: '#F0F6FC',
  textDim: '#9BA3AF',
  textMuted: '#6B7280',
  primary: '#00D4AA',
  primaryDim: '#00997B',
  primarySoft: 'rgba(0, 212, 170, 0.12)',
  critical: '#EF4444',
  criticalSoft: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  compliant: '#00D4AA',
  compliantSoft: 'rgba(0, 212, 170, 0.12)',
};

export function riskColor(level) {
  if (level === 'CRITICAL') return colors.critical;
  if (level === 'WARNING') return colors.warning;
  if (level === 'COMPLIANT') return colors.compliant;
  return colors.textDim;
}

export function riskSoftColor(level) {
  if (level === 'CRITICAL') return colors.criticalSoft;
  if (level === 'WARNING') return colors.warningSoft;
  if (level === 'COMPLIANT') return colors.compliantSoft;
  return colors.surfaceAlt;
}

export function scoreColor(score) {
  if (score >= 80) return colors.compliant;
  if (score >= 60) return colors.warning;
  return colors.critical;
}
