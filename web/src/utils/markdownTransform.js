// Pre-process markdown so any GFM-style table is rendered as a vertical
// key-value list AND any bracket-style placeholder is replaced with a
// realistic fictional value. Mirrors mobile/utils/markdownTransform.js so
// the web Documents tab shows the same content shape as the mobile app.

const PLACEHOLDER_REPLACEMENTS = [
  [/\[\s*(?:Enter\s+)?EORI(?:\s+Number)?\s*\]/gi, 'PK-FWI-2024-0891'],
  [/\[\s*(?:Enter\s+)?Factory\s+Address(?:\s+Here)?\s*\]/gi,
   'Plot 47, Industrial Estate, Jaranwala Road, Faisalabad 38000, Pakistan'],
  [/\[\s*(?:Enter\s+)?Address(?:\s+Here)?\s*\]/gi,
   'Plot 47, Industrial Estate, Jaranwala Road, Faisalabad 38000, Pakistan'],
  [/\[\s*Name\s+of\s+Authori[sz]ed\s+Representative\s*\]/gi, 'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Authori[sz]ed\s+Representative\s*\]/gi, 'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Signatory\s+Name\s*\]/gi, 'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Representative\s+Name\s*\]/gi, 'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Title\s*\]/gi, 'Head of Compliance & Export Affairs'],
  [/\[\s*(?:Enter\s+)?Designation\s*\]/gi, 'Head of Compliance & Export Affairs'],
  [/\[\s*(?:Enter\s+)?Date(?:\s+of\s+Signature)?\s*\]/gi, 'May 17, 2026'],
  [/\[\s*Signature\s+Date\s*\]/gi, 'May 17, 2026'],
];

function replacePlaceholders(md) {
  let out = md;
  for (const [re, val] of PLACEHOLDER_REPLACEMENTS) {
    out = out.replace(re, val);
  }
  return out;
}

function parseRow(line) {
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isLikelyTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('|')) return false;
  return (trimmed.match(/\|/g) || []).length >= 1;
}

export function transformMarkdownTables(md) {
  if (!md || typeof md !== 'string') return md;
  const replaced = replacePlaceholders(md);
  const lines = replaced.split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (isLikelyTableRow(line) && isSeparatorRow(next)) {
      const header = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isLikelyTableRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      i -= 1;

      out.push('');
      rows.forEach((row, rIdx) => {
        if (header.length === 2 && row.length === 2) {
          out.push(`**${row[0]}:** ${row[1]}`);
          out.push('');
        } else {
          header.forEach((h, cIdx) => {
            const v = row[cIdx] ?? '';
            if (h || v) out.push(`**${h || `Column ${cIdx + 1}`}:** ${v}`);
          });
          out.push('');
        }
        if (rIdx < rows.length - 1) {
          out.push('---');
          out.push('');
        }
      });
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
