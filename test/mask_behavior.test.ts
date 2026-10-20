import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePythonLogs, buildLineOffsets, getLineFromOffset } from '../src/parser';
import { ADAPTIVE_THEMES, DEFAULT_MASK_ICON } from '../src/constants';

describe('Mask Mode & Focus Logic Validation', () => {
  it('should categorize multiline logs and display preview text on first line without empty lines', () => {
    const code = `
logger.info("Single line message")
logger.info(
    "Multiline message with details",
    arg1,
    arg2,
)
`;
    const items = parsePythonLogs(code);
    assert.equal(items.length, 2);

    const singleLineItem = items[0];
    const multilineItem = items[1];

    assert.equal(singleLineItem.isMultiline, false);
    assert.equal(multilineItem.isMultiline, true);

    const lineOffsets = buildLineOffsets(code);

    const dimRanges: { start: number; end: number }[] = [];
    const maskOptions: { start: number; end: number; contentText: string; isFirstLineOnly: boolean }[] = [];

    for (const item of items) {
      dimRanges.push({ start: item.startOffset, end: item.endOffset });

      if (item.isMultiline) {
        const startLine = item.startLine;
        const nextLineOffset = startLine + 1 < lineOffsets.length ? lineOffsets[startLine + 1] - 1 : code.length;
        const firstLineEnd = nextLineOffset;

        const startLineNum = getLineFromOffset(lineOffsets, item.startOffset);
        const endLineNum = getLineFromOffset(lineOffsets, firstLineEnd);

        maskOptions.push({
          start: item.startOffset,
          end: firstLineEnd,
          contentText: `[▸ ${item.previewText}]`,
          isFirstLineOnly: startLineNum === endLineNum
        });
        continue;
      }

      maskOptions.push({
        start: item.startOffset,
        end: item.endOffset,
        contentText: `[▸ ${item.previewText}]`,
        isFirstLineOnly: true
      });
    }

    assert.equal(dimRanges.length, 2);
    assert.equal(maskOptions.length, 2);
    assert.ok(maskOptions[1].contentText.includes('Multiline message with details'));
    assert.equal(maskOptions[1].isFirstLineOnly, true);
  });

  it('should resolve maskIcon with dropdown strategy and custom icon', () => {
    function resolveMaskIcon(level: string, maskIconConfig: string, customIcon: string = ''): string {
      const iconSetting = (maskIconConfig || DEFAULT_MASK_ICON).trim();
      if (iconSetting === 'none') {
        return '';
      }
      if (iconSetting === 'custom') {
        return customIcon.trim() || 'ℹ️';
      }
      const theme = (ADAPTIVE_THEMES as Record<string, Record<string, string>>)[iconSetting];
      if (theme) {
        const normalizedLevel = level.toLowerCase();
        return theme[normalizedLevel] || theme.log || 'ℹ️';
      }
      return customIcon.trim() || iconSetting;
    }

    // Default icon setting is 'emoji'
    assert.equal(DEFAULT_MASK_ICON, 'emoji');

    // 1. Emoji preset (Default)
    assert.equal(resolveMaskIcon('info', 'emoji'), 'ℹ️');
    assert.equal(resolveMaskIcon('debug', 'emoji'), '🐛');
    assert.equal(resolveMaskIcon('success', 'emoji'), '✨');
    assert.equal(resolveMaskIcon('error', 'emoji'), '❌');
    assert.equal(resolveMaskIcon('warning', 'emoji'), '⚠️');
    assert.equal(resolveMaskIcon('critical', 'emoji'), '🚨');

    // 2. Geometric preset
    assert.equal(resolveMaskIcon('info', 'geometric'), '▸');
    assert.equal(resolveMaskIcon('debug', 'geometric'), '⌕');
    assert.equal(resolveMaskIcon('success', 'geometric'), '◆');
    assert.equal(resolveMaskIcon('warning', 'geometric'), '▲');
    assert.equal(resolveMaskIcon('error', 'geometric'), '✖');
    assert.equal(resolveMaskIcon('critical', 'geometric'), '✦');

    // 3. Subtle preset
    assert.equal(resolveMaskIcon('info', 'subtle'), '💬');
    assert.equal(resolveMaskIcon('debug', 'subtle'), '🔧');
    assert.equal(resolveMaskIcon('success', 'subtle'), '✅');

    // 4. ASCII preset
    assert.equal(resolveMaskIcon('info', 'ascii'), 'i');
    assert.equal(resolveMaskIcon('debug', 'ascii'), '?');
    assert.equal(resolveMaskIcon('success', 'ascii'), 'v');

    // 5. None
    assert.equal(resolveMaskIcon('info', 'none'), '');
    assert.equal(resolveMaskIcon('error', 'none'), '');

    // 6. Custom option
    assert.equal(resolveMaskIcon('info', 'custom', '›'), '›');
    assert.equal(resolveMaskIcon('error', 'custom', '🪵'), '🪵');
    assert.equal(resolveMaskIcon('debug', 'custom', ''), 'ℹ️'); // fallback
  });

  it('should format mask badge text cleanly according to bracket and level options', () => {
    function format(
      icon: string,
      level: string,
      preview: string,
      opts: { showLevel: boolean; showBracket: boolean }
    ) {
      const iconPart = icon ? `${icon} ` : '';
      const levelPart = opts.showLevel ? `${level}: ` : '';
      const body = `${iconPart}${levelPart}${preview}`.trim();
      return opts.showBracket ? `[${body}]` : body;
    }

    // Default: geometric + no level + bracket -> [▸ msg]
    assert.equal(
      format('▸', 'info', 'Order processed', { showLevel: false, showBracket: true }),
      '[▸ Order processed]'
    );

    // With level: [▸ info: Order processed]
    assert.equal(
      format('▸', 'info', 'Order processed', { showLevel: true, showBracket: true }),
      '[▸ info: Order processed]'
    );

    // Without bracket: ▸ Order processed
    assert.equal(
      format('▸', 'info', 'Order processed', { showLevel: false, showBracket: false }),
      '▸ Order processed'
    );

    // Pure text (no icon, no level, no bracket): Order processed
    assert.equal(
      format('', 'info', 'Order processed', { showLevel: false, showBracket: false }),
      'Order processed'
    );

    // Pure text with bracket: [Order processed]
    assert.equal(
      format('', 'info', 'Order processed', { showLevel: false, showBracket: true }),
      '[Order processed]'
    );
  });
});
