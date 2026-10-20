import * as vscode from 'vscode';
import { DimmerMode, MaskStyle, PluginConfig } from './types';
import { CONFIG_SECTION } from './constants';

export function getPluginConfig(): PluginConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    mode: config.get<DimmerMode>('mode', 'dim'),
    opacity: config.get<number>('opacity', 0.35),
    color: config.get<string>('color', ''),
    italic: config.get<boolean>('italic', false),
    unfoldOnCursor: config.get<boolean>('unfoldOnCursor', true),
    maskStyle: config.get<MaskStyle>('maskStyle', 'badge'),
    maskIcon: config.get<string>('maskIcon', 'emoji'),
    maskCustomIcon: config.get<string>('maskCustomIcon', ''),
    maskShowLevel: config.get<boolean>('maskShowLevel', false),
    maskShowBracket: config.get<boolean>('maskShowBracket', true),
    maskShowBackground: config.get<boolean>('maskShowBackground', false),
    multilineFolding: config.get<boolean>('multilineFolding', true),
    customLoggers: config.get<string[]>('customLoggers', []),
    customLevels: config.get<string[]>('customLevels', []),
    showStatusBarItem: config.get<boolean>('showStatusBarItem', true)
  };
}

export async function setPluginMode(mode: DimmerMode, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update('mode', mode, target);
}
