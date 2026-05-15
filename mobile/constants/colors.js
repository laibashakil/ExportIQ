// ExportIQ visual language — dark navy + risk traffic light.
export const colors = {
  bg: '#0E1726',
  surface: '#16223A',
  surfaceAlt: '#1E2C48',
  border: '#2A3A5C',
  text: '#F2F4F8',
  textDim: '#9AA7BD',
  primary: '#3E8BFF',
  primaryDim: '#2A5FB8',

  critical: '#FF4D5E',
  warning: '#FFB347',
  compliant: '#34D399',

  cardShadow: '#000000',
};

export const riskColor = (level) => {
  if (level === 'CRITICAL') return colors.critical;
  if (level === 'WARNING') return colors.warning;
  if (level === 'COMPLIANT') return colors.compliant;
  return colors.textDim;
};
