export type DimmerMode = 'dim' | 'mask' | 'off';

export type MaskStyle = 'badge' | 'compact';

export type BuiltinMaskIcon = 'emoji' | 'geometric' | 'subtle' | 'ascii' | 'none' | 'custom';

export interface PluginConfig {
  mode: DimmerMode;
  opacity: number;
  color: string;
  italic: boolean;
  unfoldOnCursor: boolean;
  maskStyle: MaskStyle;
  maskIcon: BuiltinMaskIcon | string;
  maskCustomIcon: string;
  maskShowLevel: boolean;
  maskShowBracket: boolean;
  maskShowBackground: boolean;
  multilineFolding: boolean;
  customLoggers: string[];
  customLevels: string[];
  showStatusBarItem: boolean;
}

export interface LogCallItem {
  startOffset: number;
  endOffset: number;
  openParenOffset: number;
  closeParenOffset: number;
  receiver: string;
  level: string;
  startLine: number;
  endLine: number;
  isMultiline: boolean;
  previewText: string;
  rawText: string;
}
