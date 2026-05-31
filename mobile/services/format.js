// Format helpers shared by every screen so PKR rendering is consistent.

/**
 * Single source of truth for mapping a compliance score + PKR-at-risk to a
 * status level. Mirrors web/src/utils/scoring.js so a judge sees the same
 * status regardless of which client they open.
 *
 *   score === 100 AND risk === 0   -> 'COMPLIANT'  (green, "Compliant")
 *   score >= 90  (or risk > 0)      -> 'ALMOST'     (amber, "Almost Compliant")
 *   score >= 60                     -> 'WARNING'    (amber, "Needs Attention")
 *   score <  60                     -> 'CRITICAL'   (red,   "At Risk")
 *
 * A factory is only ever "Compliant"/"meets EU requirements" at a perfect
 * 100 with nothing at risk — 90–99 is always "Almost".
 */
export function complianceLevel(score, riskPkr = 0) {
  const s = Number(score) || 0;
  const r = Number(riskPkr) || 0;
  if (s >= 100 && r <= 0) return 'COMPLIANT';
  if (s >= 90) return 'ALMOST';
  if (s >= 60) return 'WARNING';
  return 'CRITICAL';
}

/** Friendly, factory-owner-facing label for a status level. */
export function complianceLabel(level) {
  switch (level) {
    case 'COMPLIANT': return 'Compliant';
    case 'ALMOST': return 'Almost Compliant';
    case 'WARNING': return 'Needs Attention';
    case 'CRITICAL': return 'At Risk';
    default: return '—';
  }
}

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

// Plain-English titles for regulations & gap requirements so the UI doesn't
// throw acronyms at a factory owner who isn't a compliance expert.
const REGULATION_PLAIN = [
  { match: /supply chain due diligence|CSDDD/i, plain: 'EU Supply Chain Due Diligence', ref: 'EU CSDDD' },
  { match: /modern slavery/i,                plain: 'UK Modern Slavery Statement',    ref: 'UK Modern Slavery Act' },
  { match: /SA[\s-]?8000/i,                  plain: 'Social Accountability Certificate', ref: 'SA8000' },
  { match: /GSP\+|GSP plus|zero[\s-]?tariff/i, plain: 'GSP+ Zero-Tariff Access',      ref: 'GSP+' },
  { match: /ISO[\s-]?14001/i,                plain: 'Environmental Management Standard', ref: 'ISO 14001' },
  { match: /ISO[\s-]?45001/i,                plain: 'Worker Safety Standard',         ref: 'ISO 45001' },
  { match: /REACH/i,                         plain: 'EU Chemical Safety Rules',       ref: 'EU REACH' },
  { match: /ZDHC/i,                          plain: 'Chemical Discharge Limits',      ref: 'ZDHC' },
  { match: /GOTS/i,                          plain: 'Organic Textile Certificate',    ref: 'GOTS' },
  { match: /OEKO[\s-]?TEX/i,                 plain: 'Textile Safety Standard',        ref: 'OEKO-TEX' },
];

const REQUIREMENT_PLAIN = [
  // Supply chain due diligence (CSDDD) family
  { match: /SMETA|supplier audit|tier[\s-]?[12].*audit|q1 2027/i,
                                                              plain: 'Commission SMETA Supplier Audits' },
  { match: /due diligence policy|csddd declar|quarterly csddd/i, plain: 'Establish CSDDD Due Diligence Policy' },
  { match: /due diligence process|supply chain transparency report/i, plain: 'Establish supply chain due diligence process' },
  // Labour / certifications
  { match: /labour|labor.*(standard|cert)|certverify.*labour/i, plain: 'Renew Labour Standards Certification' },
  { match: /modern slavery statement|msa statement/i,         plain: 'Publish Modern Slavery Statement' },
  { match: /supply chain (audit|due diligence)/i,             plain: 'Complete Supply Chain Audit' },
  { match: /SA[\s-]?8000|social accountability/i,             plain: 'Renew Social Accountability Certificate' },
  { match: /working hours|paper logs|time tracking/i,         plain: 'Digitise Worker Time Records' },
  // Environment / chemicals
  { match: /chemical discharge|effluent|ppm|water audit/i,    plain: 'Fix Chemical Discharge Levels' },
  { match: /lead in dyes|heavy metal/i,                       plain: 'Reduce Heavy Metal Levels' },
  { match: /ISO[\s-]?14001|environmental management/i,        plain: 'Fix Environmental Management Issues' },
  { match: /ZDHC|zero discharge/i,                            plain: 'Meet Chemical Discharge Rules' },
  { match: /REACH/i,                                          plain: 'Meet EU Chemical Safety Rules' },
  { match: /GOTS|organic textile/i,                           plain: 'Get Organic Textile Certificate' },
  { match: /OEKO[\s-]?TEX/i,                                  plain: 'Renew Textile Safety Standard' },
  { match: /certification|certif|expir/i,                     plain: 'Renew Certification' },
];

// Words we drop when shrinking a requirement to ≤6 words.
const STOP_WORDS = new Set([
  'a','an','the','of','to','for','with','and','or','from','in','on','by','at',
  'must','should','shall','will','need','needs','required','requires','that',
  'this','these','those','as','is','are','be','been','being',
]);

function compressTo6Words(s) {
  const cleaned = String(s)
    .replace(/\([^)]+\)/g, ' ')   // strip parentheticals
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  // Keep first 6 words, but if it's already short just title-case it.
  const trimmed = words.slice(0, 6).join(' ');
  if (!trimmed) return cleaned;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Return a plain-English title + the original code reference for a regulation.
 *   plainRegulation('EU CSDDD')          -> { plain: 'EU Supply Chain Due Diligence', ref: 'EU CSDDD' }
 *   plainRegulation('Unknown Reg ABC')   -> { plain: 'Unknown Reg ABC', ref: null }
 */
export function plainRegulation(raw) {
  if (!raw) return { plain: 'Regulation', ref: null };
  const s = String(raw);
  for (const r of REGULATION_PLAIN) {
    if (r.match.test(s)) return { plain: r.plain, ref: r.ref };
  }
  return { plain: s, ref: null };
}

/**
 * Plain-English title for a gap requirement. Falls back to the original
 * requirement string compressed to <=6 words.
 *
 * Title intent: short imperative phrase, factory-owner-friendly. Never returns
 * the bare word "Regulation" — always derives something useful from either
 * the requirement, the regulation, or the gap status.
 */
export function plainRequirement(raw, regulationRaw, status) {
  // Try the requirement first
  if (raw) {
    const s = String(raw);
    for (const r of REQUIREMENT_PLAIN) {
      if (r.match.test(s)) return r.plain;
    }
    // No matcher hit — compress to ≤6 words from the first sentence.
    const first = s.split(/[.;\n]/)[0].trim();
    if (first) return compressTo6Words(first);
  }
  // Try regulation matchers — derive a verb-phrase from the regulation name.
  if (regulationRaw) {
    const r = plainRegulation(regulationRaw);
    if (r.ref) {
      // Pair with status to give a verb.
      const action =
        status === 'EXPIRED' ? 'Renew' :
        status === 'MISSING' ? 'File' :
        status === 'NON_CONFORMANT' ? 'Fix' :
        'Address';
      return `${action} ${r.plain}`;
    }
    if (r.plain && r.plain !== 'Regulation') return r.plain;
  }
  // Final fallback by status — never show the bare word "Regulation".
  if (status === 'EXPIRED') return 'Renew Expired Certification';
  if (status === 'MISSING') return 'File Missing Compliance Document';
  if (status === 'NON_CONFORMANT') return 'Fix Compliance Issue';
  return 'Compliance Issue';
}

/**
 * Strip backend jargon out of an action description and return a clean
 * single-sentence plain-English description for the factory owner.
 *
 *   "Close gap on EU CSDDD: Establish supply chain due diligence process
 *    covering tier-1 and tier-2 suppliers.. Current status: MISSING.
 *    Severity: CRITICAL. Deadline: 2026-07-31. Evidence cited: …"
 *
 * becomes
 *
 *   "You need to establish your CSDDD due diligence policy before 31 Jul 2026."
 */
export function plainActionDescription(action) {
  if (!action) return '';
  const titleVerb = plainActionTitle(action) || plainRequirement(
    action.requirement,
    action.regulation,
    action.status,
  );
  // Lower-case first character so it reads naturally after "You need to".
  const verbPhrase = (titleVerb || 'address this issue')
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
  const deadline = action.deadline;
  let dueText = '';
  if (deadline) {
    const d = new Date(deadline);
    if (!Number.isNaN(d.getTime())) {
      dueText = ` before ${d.toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
      })}`;
    } else {
      dueText = ` before ${deadline}`;
    }
  }
  return `You need to ${verbPhrase}${dueText}.`;
}

/**
 * Plain-English action title. Strips leading "File X:" / "Remediate Y:" /
 * regulation-code prefixes and falls back to a humanised requirement.
 */
export function plainActionTitle(action) {
  const raw = action?.title || '';
  // Strip leading regulation-code prefix like "EU CSDDD: " or "ISO 14001 - "
  const cleaned = raw
    .replace(/^(EU |UK )?[A-Z][A-Z0-9 /-]{2,}\s*[:|–-]\s*/i, '')
    .replace(/^(File|Remediate|Implement|Submit|Renew)\s+(EU |UK )?[A-Z][A-Z0-9 /-]{2,}\s*[:|]\s*/i, '$1 ');
  const candidate = cleaned.trim() || raw;
  // Re-humanise via requirement matcher
  return plainRequirement(candidate, action?.regulation);
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

/**
 * Country flag emoji for a buyer.
 * Returns null when the buyer has no known HQ — callers should render an
 * `<Ionicons name="globe" />` in that case rather than a placeholder emoji.
 */
export function buyerFlag(buyer) {
  return COUNTRY_FLAG[BUYER_COUNTRY[buyer]] || null;
}
