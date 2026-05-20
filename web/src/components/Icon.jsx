// Minimal inline SVG icons — keeps bundle small without pulling react-icons.
export function Icon({ name, size = 16, color = 'currentColor' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'factory':
      return (
        <svg {...props}><path d="M2 20V8l5 3V8l5 3V8l5 3V4h3v16H2z"/><path d="M6 16h2M10 16h2M14 16h2M18 16h2"/></svg>
      );
    case 'location':
      return (
        <svg {...props}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
      );
    case 'play':
      return (
        <svg {...props}><polygon points="6 4 20 12 6 20 6 4" fill={color}/></svg>
      );
    case 'chevron-right':
      return (
        <svg {...props}><polyline points="9 18 15 12 9 6"/></svg>
      );
    case 'chevron-left':
      return (
        <svg {...props}><polyline points="15 18 9 12 15 6"/></svg>
      );
    case 'chevron-down':
      return (
        <svg {...props}><polyline points="6 9 12 15 18 9"/></svg>
      );
    case 'check':
      return (
        <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>
      );
    case 'alert':
      return (
        <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      );
    case 'clock':
      return (
        <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      );
    case 'doc':
      return (
        <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      );
    case 'mail':
      return (
        <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      );
    case 'cpu':
      return (
        <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>
      );
    case 'sparkles':
      return (
        <svg {...props}><path d="M12 2v6M12 16v6M5 12H2M22 12h-3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>
      );
    case 'download':
      return (
        <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      );
    case 'upload':
      return (
        <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      );
    case 'trend-up':
      return (
        <svg {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      );
    default:
      return null;
  }
}
