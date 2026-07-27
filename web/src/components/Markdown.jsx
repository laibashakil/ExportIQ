// Minimal markdown → JSX renderer used by the Documents tab so buyer
// emails, CSDDD due diligence reports, and remediation plans render with proper headings,
// bold, italics, lists, and horizontal rules instead of raw `*`/`#`/`-`.
//
// Supported: # / ## / ### headings, **bold**, *italic*, `code`, --- hr,
// bullet lists (`- ` / `* `), ordered lists (`1. `), and paragraphs.
// Anything more elaborate (nested lists, links, images) falls through as
// plain text — matches the mobile renderer's coverage for our generator
// output.

import React from 'react';

export function renderInline(text) {
  // Walk the string, replacing **bold**, *italic*, and `code` in one pass.
  // We tokenize so a string like "**a** *b*" doesn't double-match.
  const parts = [];
  let buf = '';
  let i = 0;
  let keyCounter = 0;
  const flush = () => {
    if (buf.length) {
      parts.push(buf);
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    // Bold: **xxx**
    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        flush();
        const inner = text.slice(i + 2, close);
        // eslint-disable-next-line no-plusplus
        parts.push(<strong key={`b-${keyCounter++}`}>{renderInline(inner)}</strong>);
        i = close + 2;
        continue;
      }
    }
    // Italic: *xxx*  (not surrounded by another *)
    if (ch === '*' && text[i + 1] !== '*') {
      const close = text.indexOf('*', i + 1);
      if (close !== -1 && text[close - 1] !== ' ' && text[close + 1] !== '*') {
        flush();
        const inner = text.slice(i + 1, close);
        // eslint-disable-next-line no-plusplus
        parts.push(<em key={`i-${keyCounter++}`}>{renderInline(inner)}</em>);
        i = close + 1;
        continue;
      }
    }
    // Inline code: `xxx`
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      if (close !== -1) {
        flush();
        // eslint-disable-next-line no-plusplus
        parts.push(<code key={`c-${keyCounter++}`}>{text.slice(i + 1, close)}</code>);
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return parts;
}

function buildBlocks(md) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      i += 1;
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-special lines
    const para = [line];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,6})\s+/.test(lines[i].trim())
      && !/^[-*]\s+/.test(lines[i].trim())
      && !/^\d+[.)]\s+/.test(lines[i].trim())
      && !/^---+$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }

  return blocks;
}

export default function Markdown({ children, className = '' }) {
  const blocks = buildBlocks(children);
  return (
    <div className={`md-body ${className}`.trim()}>
      {blocks.map((b, idx) => {
        if (b.type === 'hr') return <hr key={idx} className="md-hr" />;
        if (b.type === 'heading') {
          const Tag = `h${Math.min(b.level + 1, 6)}`;
          return (
            <Tag key={idx} className={`md-h md-h${b.level}`}>
              {renderInline(b.text)}
            </Tag>
          );
        }
        if (b.type === 'ul') {
          return (
            <ul key={idx} className="md-ul">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'ol') {
          return (
            <ol key={idx} className="md-ol">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        // Paragraph — preserve single newlines as <br />
        const segs = b.text.split('\n');
        return (
          <p key={idx} className="md-p">
            {segs.map((s, j) => (
              <React.Fragment key={j}>
                {renderInline(s)}
                {j < segs.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
