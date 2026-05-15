// Format helpers shared by every screen so PKR rendering is consistent.

/**
 * Format a PKR integer as a human-readable string with crore / lakh suffixes.
 *   90_000_000          -> "PKR 9 Cr"
 *   340_000_000         -> "PKR 34 Cr"
 *   45_000_000          -> "PKR 4.5 Cr"
 *   1_500_000           -> "PKR 15 Lakh"
 *   24_000              -> "PKR 24,000"
 *
 * Always returns a single-line string; never throws.
 */
export function formatPkr(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 'PKR —';
  if (Math.abs(value) >= 10_000_000) {
    const crore = value / 10_000_000;
    const text = crore >= 10 ? crore.toFixed(0) : crore.toFixed(1).replace(/\.0$/, '');
    return `PKR ${text} Cr`;
  }
  if (Math.abs(value) >= 100_000) {
    const lakh = value / 100_000;
    const text = lakh >= 10 ? lakh.toFixed(0) : lakh.toFixed(1).replace(/\.0$/, '');
    return `PKR ${text} Lakh`;
  }
  return `PKR ${value.toLocaleString()}`;
}

/**
 * Human-readable "X minutes ago" for an ISO timestamp.
 *   formatRelativeTime('2026-05-16T05:30:00Z')  ->  "2 min ago"
 */
export function formatRelativeTime(iso) {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

/**
 * Country flag emoji for buyer HQ. Falls back to globe.
 */
export const COUNTRY_FLAG = {
  EU: '🇪🇺',
  UK: '🇬🇧',
  US: '🇺🇸',
  SE: '🇸🇪',  // Sweden  (NordStyle Group HQ)
  IE: '🇮🇪',  // Ireland (BritMart Retail listing)
  ES: '🇪🇸',  // Spain   (EuroThread SA HQ)
  IT: '🇮🇹',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
};

export const BUYER_COUNTRY = {
  'NordStyle Group': 'SE',
  'BritMart Retail': 'IE',
  'EuroThread SA': 'ES',
  'M&S': 'UK',
  'Tesco': 'UK',
  'Next': 'UK',
  'Asda': 'UK',
  'Mango': 'ES',
};

export function buyerFlag(buyer) {
  return COUNTRY_FLAG[BUYER_COUNTRY[buyer]] || '🌐';
}
