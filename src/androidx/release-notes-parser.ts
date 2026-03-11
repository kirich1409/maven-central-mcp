const VERSION_HEADING_RE = /<h[23][^>]*>\s*Version\s+([\d][^\s<]*)\s*<\/h[23]>/gi;

function unescapeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(text: string): string {
  let result = text;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, "");
  } while (result !== prev);
  return result;
}

function htmlToText(html: string): string {
  const formatted = html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  return unescapeEntities(stripTags(unescapeEntities(formatted)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAndroidXReleaseNotes(html: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headings: { version: string; startIndex: number; endIndex: number }[] = [];
  let match: RegExpExecArray | null;

  VERSION_HEADING_RE.lastIndex = 0;

  while ((match = VERSION_HEADING_RE.exec(html)) !== null) {
    headings.push({
      version: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].endIndex;
    const end = i + 1 < headings.length
      ? headings[i + 1].startIndex
      : html.length;

    const rawContent = html.slice(start, end);
    const body = htmlToText(rawContent);

    if (body) {
      sections.set(headings[i].version, body);
    }
  }

  return sections;
}
