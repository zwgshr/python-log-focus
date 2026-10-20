import * as vscode from 'vscode';
import { LogCallItem, PluginConfig } from './types';
import { parsePythonLogs } from './parser';
import { ADAPTIVE_THEMES, DEFAULT_MASK_ICON } from './constants';

function resolveMaskIcon(level: string, config: PluginConfig): string {
  const iconSetting = (config.maskIcon || DEFAULT_MASK_ICON).trim();
  if (iconSetting === 'none') {
    return '';
  }
  if (iconSetting === 'custom') {
    return config.maskCustomIcon.trim() || 'ℹ️';
  }
  const theme = ADAPTIVE_THEMES[iconSetting];
  if (theme) {
    const normalizedLevel = level.toLowerCase();
    return theme[normalizedLevel] || theme.log || 'ℹ️';
  }
  // User provided custom character directly in maskIcon
  return config.maskCustomIcon.trim() || iconSetting;
}

function formatMaskBadgeText(
  level: string,
  previewText: string,
  config: PluginConfig
): string {
  const icon = resolveMaskIcon(level, config);
  const iconPart = icon ? `${icon} ` : '';
  const levelPart = config.maskShowLevel ? `${level}: ` : '';
  const body = `${iconPart}${levelPart}${previewText}`.trim();
  return config.maskShowBracket ? `[${body}]` : body;
}

export class LogDecorator {
  private dimDecorationType: vscode.TextEditorDecorationType | null = null;
  private maskDecorationType: vscode.TextEditorDecorationType | null = null;
  private config: PluginConfig;
  private cachedItemsMap = new WeakMap<vscode.TextDocument, { version: number; items: LogCallItem[] }>();

  constructor(config: PluginConfig) {
    this.config = config;
    this.rebuildDecorationTypes();
  }

  public updateConfig(newConfig: PluginConfig): void {
    const needRebuild =
      this.config.opacity !== newConfig.opacity ||
      this.config.color !== newConfig.color ||
      this.config.italic !== newConfig.italic ||
      this.config.maskStyle !== newConfig.maskStyle ||
      this.config.maskIcon !== newConfig.maskIcon ||
      this.config.maskCustomIcon !== newConfig.maskCustomIcon ||
      this.config.maskShowLevel !== newConfig.maskShowLevel ||
      this.config.maskShowBracket !== newConfig.maskShowBracket ||
      this.config.maskShowBackground !== newConfig.maskShowBackground;

    this.config = newConfig;

    if (needRebuild) {
      this.rebuildDecorationTypes();
    }
  }

  public getConfig(): PluginConfig {
    return this.config;
  }

  public clearCache(): void {
    this.cachedItemsMap = new WeakMap();
  }

  private rebuildDecorationTypes(): void {
    this.disposeDecorationTypes();

    // 1. Unified Dim decoration type (controls opacity, color, italic)
    const dimRenderOptions: vscode.DecorationRenderOptions = {
      opacity: this.config.opacity.toString()
    };
    if (this.config.color) {
      dimRenderOptions.color = this.config.color;
    }
    if (this.config.italic) {
      dimRenderOptions.fontStyle = 'italic';
    }
    this.dimDecorationType = vscode.window.createTextEditorDecorationType(dimRenderOptions);

    // 2. Mask decoration type (hides the underlying text and injects placeholder)
    this.maskDecorationType = vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;'
    });
  }

  public getLogItems(document: vscode.TextDocument): LogCallItem[] {
    const cached = this.cachedItemsMap.get(document);
    if (cached && cached.version === document.version) {
      return cached.items;
    }

    const text = document.getText();
    const items = parsePythonLogs(text, this.config.customLoggers, this.config.customLevels);
    this.cachedItemsMap.set(document, { version: document.version, items });
    return items;
  }

  public updateEditor(editor: vscode.TextEditor): void {
    if (!editor || editor.document.languageId !== 'python') {
      return;
    }

    if (!this.dimDecorationType || !this.maskDecorationType) {
      this.rebuildDecorationTypes();
    }

    const mode = this.config.mode;

    // If turned off, clear all decorations
    if (mode === 'off') {
      if (this.dimDecorationType) editor.setDecorations(this.dimDecorationType, []);
      if (this.maskDecorationType) editor.setDecorations(this.maskDecorationType, []);
      return;
    }

    const items = this.getLogItems(editor.document);
    const document = editor.document;

    // Collect active cursor lines if unfoldOnCursor is enabled
    const activeLines = new Set<number>();
    if (this.config.unfoldOnCursor && editor.selections) {
      for (const selection of editor.selections) {
        for (let l = selection.start.line; l <= selection.end.line; l++) {
          activeLines.add(l);
        }
      }
    }

    if (mode === 'dim') {
      // Clear mask decorations
      if (this.maskDecorationType) editor.setDecorations(this.maskDecorationType, []);

      const dimRanges: vscode.Range[] = [];
      for (const item of items) {
        // Skip dimming if cursor is currently on this log
        if (this.isItemActive(item, activeLines)) {
          continue;
        }

        const startPos = document.positionAt(item.startOffset);
        const endPos = document.positionAt(item.endOffset);
        dimRanges.push(new vscode.Range(startPos, endPos));
      }

      if (this.dimDecorationType) {
        editor.setDecorations(this.dimDecorationType, dimRanges);
      }
    } else if (mode === 'mask') {
      const dimRanges: vscode.Range[] = [];
      const maskOptions: vscode.DecorationOptions[] = [];
      const maskStyle = this.config.maskStyle;

      for (const item of items) {
        // Skip masking if cursor is currently on this log
        if (this.isItemActive(item, activeLines)) {
          continue;
        }

        const startPos = document.positionAt(item.startOffset);
        const endPos = document.positionAt(item.endOffset);

        // Apply semi-transparent dimming in mask mode as well
        dimRanges.push(new vscode.Range(startPos, endPos));

        if (item.isMultiline) {
          // Multiline log: display preview on the first line strictly to prevent empty lines
          const firstLineEnd = document.lineAt(item.startLine).range.end;

          if (maskStyle === 'compact') {
            const argStartPos = document.positionAt(item.openParenOffset + 1);
            maskOptions.push({
              range: new vscode.Range(argStartPos, firstLineEnd),
              renderOptions: {
                before: {
                  contentText: `"${item.previewText}", …)`,
                  color: new vscode.ThemeColor('editorGhostText.foreground')
                }
              }
            });
          } else {
            // Badge style (default)
            const beforeRender: vscode.ThemableDecorationAttachmentRenderOptions = {
              contentText: formatMaskBadgeText(item.level, item.previewText, this.config),
              color: new vscode.ThemeColor('editorGhostText.foreground')
            };
            if (this.config.maskShowBackground) {
              beforeRender.backgroundColor = 'rgba(128, 128, 128, 0.08)';
              beforeRender.border = '1px solid rgba(128, 128, 128, 0.15); border-radius: 3px;';
            }
            maskOptions.push({
              range: new vscode.Range(startPos, firstLineEnd),
              renderOptions: {
                before: beforeRender
              }
            });
          }
          continue;
        }

        // Single-line log
        if (maskStyle === 'compact') {
          const argStartPos = document.positionAt(item.openParenOffset + 1);
          const argEndPos = document.positionAt(item.closeParenOffset);
          maskOptions.push({
            range: new vscode.Range(argStartPos, argEndPos),
            renderOptions: {
              before: {
                contentText: '…',
                color: new vscode.ThemeColor('editorGhostText.foreground')
              }
            }
          });
        } else {
          // Badge style (default)
          const beforeRender: vscode.ThemableDecorationAttachmentRenderOptions = {
            contentText: formatMaskBadgeText(item.level, item.previewText, this.config),
            color: new vscode.ThemeColor('editorGhostText.foreground')
          };
          if (this.config.maskShowBackground) {
            beforeRender.backgroundColor = 'rgba(128, 128, 128, 0.08)';
            beforeRender.border = '1px solid rgba(128, 128, 128, 0.15); border-radius: 3px;';
          }
          maskOptions.push({
            range: new vscode.Range(startPos, endPos),
            renderOptions: {
              before: beforeRender
            }
          });
        }
      }

      // Apply both mask placeholders and soft dimming
      if (this.maskDecorationType) {
        editor.setDecorations(this.maskDecorationType, maskOptions);
      }
      if (this.dimDecorationType) {
        editor.setDecorations(this.dimDecorationType, dimRanges);
      }
    }
  }

  private isItemActive(item: LogCallItem, activeLines: Set<number>): boolean {
    if (activeLines.size === 0) return false;
    for (let l = item.startLine; l <= item.endLine; l++) {
      if (activeLines.has(l)) {
        return true;
      }
    }
    return false;
  }

  public disposeDecorationTypes(): void {
    if (this.dimDecorationType) {
      this.dimDecorationType.dispose();
      this.dimDecorationType = null;
    }
    if (this.maskDecorationType) {
      this.maskDecorationType.dispose();
      this.maskDecorationType = null;
    }
  }

  public dispose(): void {
    this.disposeDecorationTypes();
  }
}
