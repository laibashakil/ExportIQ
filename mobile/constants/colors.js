// ExportIQ design system — premium dark theme for a B2B compliance product.
//
// Palette is intentionally narrow: one base background, two surface elevations,
// one neutral border, three risk-bucket signals, one teal accent.
export const colors = {
  // Surfaces
  bg: '#0D1117',
  surface: '#161B22',
  surfaceAlt: '#1C2330',
  border: '#21262D',
  borderStrong: '#30363D',

  // Type
  text: '#F0F6FC',
  textDim: '#9BA3AF',
  textMuted: '#6B7280',

  // Accent / actions
  primary: '#00D4AA',
  primaryDim: '#00997B',
  primarySoft: 'rgba(0, 212, 170, 0.12)',

  // Risk traffic-light
  critical: '#EF4444',
  criticalSoft: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  compliant: '#00D4AA',
  compliantSoft: 'rgba(0, 212, 170, 0.12)',

  // Other
  cardShadow: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
};

export const riskColor = (level) => {
  if (level === 'CRITICAL') return colors.critical;
  if (level === 'WARNING') return colors.warning;
  if (level === 'COMPLIANT') return colors.compliant;
  return colors.textDim;
};

export const riskSoftColor = (level) => {
  if (level === 'CRITICAL') return colors.criticalSoft;
  if (level === 'WARNING') return colors.warningSoft;
  if (level === 'COMPLIANT') return colors.compliantSoft;
  return colors.surfaceAlt;
};

// Card / shadow defaults — apply with `...shadow` or `style={[styles.x, shadow]}`
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 12,
  elevation: 4,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
