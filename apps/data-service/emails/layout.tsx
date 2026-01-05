export interface PlainEmail {
  subject: string;
  text: string;
  /**
   * Optional minimal HTML payload for clients that prefer it.
   * Mirrors the plain text body inside a <pre>.
   */
  html?: string;
}

export type PlainEmailLine =
  | string
  | {
      text: string;
      bold?: boolean;
    };

export interface PlainEmailLayoutProps {
  subject: string;
  heading?: string;
  preheader?: string;
  bodyLines: PlainEmailLine[];
  footerLines?: PlainEmailLine[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLine(line: PlainEmailLine) {
  if (typeof line === 'string') {
    return {
      text: line,
      bold: false,
    };
  }
  return {
    text: line.text,
    bold: Boolean(line.bold),
  };
}

/**
 * Helper that builds an email payload using plain text (plus optional minimal HTML).
 * Keeps formatting predictable while we debug notification delivery.
 */
export function buildPlainEmail({
  subject,
  heading,
  preheader,
  bodyLines,
  footerLines,
}: PlainEmailLayoutProps): PlainEmail {
  const allLines = [
    { text: heading ?? subject, bold: true },
    '',
    ...bodyLines,
    ...(footerLines && footerLines.length > 0 ? ['' as PlainEmailLine, ...footerLines] : []),
  ].map(normalizeLine);

  const text = allLines.map((line) => line.text).join('\n').trimEnd();

  const htmlBlocks = allLines
    .map((line) => {
      if (!line.text.trim()) {
        return '<p style="margin:0 0 12px;">&nbsp;</p>';
      }
      const content = line.bold
        ? `<strong>${escapeHtml(line.text)}</strong>`
        : escapeHtml(line.text);
      return `<p style="margin:0 0 12px;">${content}</p>`;
    })
    .join('');

  const html = [
    '<html>',
    '<head>',
    `<title>${escapeHtml(subject)}</title>`,
    preheader
      ? `<meta name="preview-text" content="${escapeHtml(preheader)}" />`
      : '',
    '</head>',
    '<body style="margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;background:#ffffff;color:#0f172a;line-height:1.5;">',
    htmlBlocks,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('');

  return { subject, text, html };
}
