import { LogCallItem } from './types';
import { DEFAULT_LOGGERS, DEFAULT_LEVELS } from './constants';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

interface StringStartInfo {
  prefixLength: number;
  quoteChar: string;
  isTriple: boolean;
}

/**
 * Checks if the text at position i starts a string literal, including prefixes (r, f, b, u, etc.)
 */
function checkStringStart(text: string, i: number, len: number): StringStartInfo | null {
  let pLen = 0;
  const c0 = text[i];

  // Optional string prefixes (case-insensitive):
  // Standard: r, u, f, b, rf, fr, rb, br
  // Python 3.14 (PEP 750 Template strings): t, tr, rt
  if (i < len) {
    const twoChars = text.slice(i, i + 2).toLowerCase();
    if (['rf', 'fr', 'rb', 'br', 'rt', 'tr'].includes(twoChars)) {
      pLen = 2;
    } else if (['r', 'u', 'f', 'b', 't'].includes(c0?.toLowerCase() || '')) {
      pLen = 1;
    }
  }

  const quotePos = i + pLen;
  if (quotePos >= len) return null;

  const q = text[quotePos];
  if (q !== '"' && q !== "'") {
    return null;
  }

  // Check if triple quote
  if (quotePos + 2 < len && text[quotePos + 1] === q && text[quotePos + 2] === q) {
    return {
      prefixLength: pLen,
      quoteChar: q,
      isTriple: true
    };
  }

  return {
    prefixLength: pLen,
    quoteChar: q,
    isTriple: false
  };
}

/**
 * Builds a line offset index for converting character offset to 0-based line number.
 */
export function buildLineOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

export function getLineFromOffset(lineOffsets: number[], offset: number): number {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineOffsets[mid] <= offset) {
      if (mid === lineOffsets.length - 1 || lineOffsets[mid + 1] > offset) {
        return mid;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 0;
}

/**
 * Creates the regex to detect receiver.level( call prefixes.
 */
export function createCallRegex(customLoggers: string[] = [], customLevels: string[] = []): RegExp {
  const allLoggers = Array.from(new Set([...customLoggers, ...DEFAULT_LOGGERS]))
    .map(l => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const allLevels = Array.from(new Set([...customLevels, ...DEFAULT_LEVELS]))
    .map(l => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const receiverPart = allLoggers.map(escapeRegex).join('|');
  const levelPart = allLevels.map(escapeRegex).join('|');

  // Sticky regex matching from exact position:
  // Allows self., cls., custom/default receivers or *_logger/*_log variables,
  // and supports chained logger modifier calls common in Loguru (e.g. .opt(...), .bind(...), .patch(...))
  return new RegExp(
    `((?:(?:self\\.|cls\\.)?(?:[a-zA-Z_]\\w*_(?:logger|log)|${receiverPart}))(?:\\.[a-zA-Z_]\\w*(?:\\([^()]*\\))?)*)\\s*\\.\\s*(${levelPart})\\s*\\(`,
    'y'
  );
}

/**
 * Extract a concise preview text from the arguments for badge display.
 */
export function extractPreview(argsRaw: string, maxLen = 45): string {
  let cleaned = argsRaw.trim();
  while (cleaned.startsWith('#')) {
    const nl = cleaned.indexOf('\n');
    if (nl === -1) {
      cleaned = '';
      break;
    }
    cleaned = cleaned.slice(nl + 1).trim();
  }

  if (!cleaned) return '...';

  // Check if first arg is a string: "..." or '...' (supports standard prefixes + Python 3.14 PEP 750 t-strings)
  const match = cleaned.match(/^(?:f|r|b|u|fr|rf|t|tr|rt)?('''|"""|'|")([\s\S]*?)\1/i);
  if (match) {
    const content = match[2].replace(/\s+/g, ' ').trim();
    if (content.length > maxLen) {
      return content.slice(0, maxLen) + '...';
    }
    return content || '...';
  }

  // Otherwise return first non-comment line or truncated args
  const lines = cleaned.split('\n');
  for (const line of lines) {
    const l = line.trim();
    if (l && !l.startsWith('#')) {
      const singleLine = l.replace(/\s+/g, ' ');
      if (singleLine.length > maxLen) {
        return singleLine.slice(0, maxLen) + '...';
      }
      return singleLine;
    }
  }

  return '...';
}

/**
 * Parses Python source code and extracts all logger call occurrences.
 */
export function parsePythonLogs(
  text: string,
  customLoggers: string[] = [],
  customLevels: string[] = []
): LogCallItem[] {
  const results: LogCallItem[] = [];
  const len = text.length;
  const lineOffsets = buildLineOffsets(text);
  const callRegex = createCallRegex(customLoggers, customLevels);

  let i = 0;

  while (i < len) {
    // 1. Skip comments
    if (text[i] === '#') {
      while (i < len && text[i] !== '\n') {
        i++;
      }
      continue;
    }

    // 2. Check if a string starts here; if so, skip the entire string literal
    const strInfo = checkStringStart(text, i, len);
    if (strInfo) {
      const qChar = strInfo.quoteChar;
      if (strInfo.isTriple) {
        const target = qChar.repeat(3);
        let j = i + strInfo.prefixLength + 3;
        while (j < len) {
          if (text[j] === '\\') {
            j += 2;
          } else if (text.startsWith(target, j)) {
            j += 3;
            break;
          } else {
            j++;
          }
        }
        i = j;
      } else {
        let j = i + strInfo.prefixLength + 1;
        while (j < len) {
          if (text[j] === '\\') {
            j += 2;
          } else if (text[j] === qChar) {
            j++;
            break;
          } else if (text[j] === '\n') {
            // Unescaped newline in single-line string -> ends token
            break;
          } else {
            j++;
          }
        }
        i = j;
      }
      continue;
    }

    // 3. Check for logger call
    // Ensure we are at a word boundary (previous char is not an identifier char)
    const isAtWordStart = i === 0 || !isWordChar(text[i - 1]);
    if (isAtWordStart) {
      callRegex.lastIndex = i;
      const match = callRegex.exec(text);

      if (match) {
        const startOffset = i;
        const receiver = match[1];
        const level = match[2];
        const openParenOffset = match.index + match[0].length - 1;

        // Balance brackets starting right after openParenOffset
        let k = openParenOffset + 1;
        let depth = 1;
        let closeParenOffset = -1;

        while (k < len && depth > 0) {
          // Inside the call, still ignore comments
          if (text[k] === '#') {
            while (k < len && text[k] !== '\n') {
              k++;
            }
            continue;
          }

          // Inside the call, respect strings
          const innerStr = checkStringStart(text, k, len);
          if (innerStr) {
            const qChar = innerStr.quoteChar;
            if (innerStr.isTriple) {
              const target = qChar.repeat(3);
              let j = k + innerStr.prefixLength + 3;
              while (j < len) {
                if (text[j] === '\\') {
                  j += 2;
                } else if (text.startsWith(target, j)) {
                  j += 3;
                  break;
                } else {
                  j++;
                }
              }
              k = j;
            } else {
              let j = k + innerStr.prefixLength + 1;
              while (j < len) {
                if (text[j] === '\\') {
                  j += 2;
                } else if (text[j] === qChar) {
                  j++;
                  break;
                } else if (text[j] === '\n') {
                  break;
                } else {
                  j++;
                }
              }
              k = j;
            }
            continue;
          }

          const ch = text[k];
          if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
          } else if (ch === ')' || ch === ']' || ch === '}') {
            depth--;
            if (depth === 0 && ch === ')') {
              closeParenOffset = k;
              break;
            }
          }
          k++;
        }

        if (depth === 0 && closeParenOffset !== -1) {
          const endOffset = closeParenOffset + 1;
          const startLine = getLineFromOffset(lineOffsets, startOffset);
          const endLine = getLineFromOffset(lineOffsets, endOffset - 1);
          const rawText = text.slice(startOffset, endOffset);
          const argsRaw = text.slice(openParenOffset + 1, closeParenOffset);
          const previewText = extractPreview(argsRaw, 40);

          results.push({
            startOffset,
            endOffset,
            openParenOffset,
            closeParenOffset,
            receiver,
            level,
            startLine,
            endLine,
            isMultiline: startLine !== endLine,
            previewText,
            rawText
          });

          i = endOffset;
          continue;
        }
      }
    }

    i++;
  }

  return results;
}
