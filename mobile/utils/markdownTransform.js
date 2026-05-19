// Pre-process markdown so any GFM-style table is rendered as a vertical
// key-value list AND any bracket-style placeholder is replaced with a
// realistic fictional value (so the demo doesn't show "[Enter EORI Number]").
//
// Tables look terrible on phone widths, and the spec for the Documents
// screen asks for "Field: Value" lines on separate rows with a divider
// between rows.

// Placeholder map. We match case-insensitively and treat the bracket
// content as the key. The replacement values are fictional but plausible
// for a Faisalabad-based exporter. We add a few extra defensive matchers
// (full-name only, etc.) so we catch wording drift from the generator.
const PLACEHOLDER_REPLACEMENTS = [
  // EORI / customs registration
  [/\[\s*(?:Enter\s+)?EORI(?:\s+Number)?\s*\]/gi,                 'PK-FWI-2024-0891'],
  // Factory address
  [/\[\s*(?:Enter\s+)?Factory\s+Address(?:\s+Here)?\s*\]/gi,
   'Plot 47, Industrial Estate, Jaranwala Road, Faisalabad 38000, Pakistan'],
  [/\[\s*(?:Enter\s+)?Address(?:\s+Here)?\s*\]/gi,
   'Plot 47, Industrial Estate, Jaranwala Road, Faisalabad 38000, Pakistan'],
  // Authorized representative
  [/\[\s*Name\s+of\s+Authori[sz]ed\s+Representative\s*\]/gi,      'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Authori[sz]ed\s+Representative\s*\]/gi,     'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Signatory\s+Name\s*\]/gi,                   'Muhammad Tariq Malik'],
  [/\[\s*(?:Enter\s+)?Representative\s+Name\s*\]/gi,              'Muhammad Tariq Malik'],
  // Title / role
  [/\[\s*(?:Enter\s+)?Title\s*\]/gi,                              'Head of Compliance & Export Affairs'],
  [/\[\s*(?:Enter\s+)?Designation\s*\]/gi,                        'Head of Compliance & Export Affairs'],
  // Date of signature
  [/\[\s*(?:Enter\s+)?Date(?:\s+of\s+Signature)?\s*\]/gi,         'May 17, 2026'],
  [/\[\s*Signature\s+Date\s*\]/gi,                                'May 17, 2026'],
];

function replacePlaceholders(md) {
  let out = md;
  for (const [re, val] of PLACEHOLDER_REPLACEMENTS) {
    out = out.replace(re, val);
  }
  return out;
}
//
// Input markdown table:
//   | Field | Value         |
//   |-------|---------------|
//   | Name  | Faisal Weave  |
//   | City  | Faisalabad    |
//
// Output replacement:
//   **Name:** Faisal Weave
//
//   **City:** Faisalabad
//
//   ---
//
// Tables with more than 2 columns are flattened so each row becomes a
// "header: value" block separated by a divider, preserving every cell.

function parseRow(line) {
  // Trim leading/trailing pipes then split. Cells can contain leading/
  // trailing whitespace which we strip.
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  // Markdown table separator: |---|---| (with optional colons for align)
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isLikelyTableRow(line) {
  // Must contain at least one pipe and start on a line that has the
  // pipe-flavoured table look.
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('|')) return false;
  return (trimmed.match(/\|/g) || []).length >= 1;
}

export function transformMarkdownTables(md) {
  if (!md || typeof md !== 'string') return md;
  const replaced = replacePlaceholders(md);
  const lines = replaced.split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    // Detect start of a table: a header row immediately followed by a
    // separator row of dashes.
    if (isLikelyTableRow(line) && isSeparatorRow(next)) {
      const header = parseRow(line);
      i += 2; // Skip header + separator
      const rows = [];
      while (i < lines.length && isLikelyTableRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      i--; // Outer for-loop will i++ again

      // Render rows as key/value paragraph blocks
      out.push(''); // breathing room before
      rows.forEach((row, rIdx) => {
        // Two-column table: header[0] is the field name we ignore, each
        // row is (key, value).
        if (header.length === 2 && row.length === 2) {
          out.push(`**${row[0]}:** ${row[1]}`);
          out.push('');
        } else {
          // Multi-column: render each cell against its header.
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
