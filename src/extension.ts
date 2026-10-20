import * as vscode from 'vscode';
import { DimmerMode, PluginConfig } from './types';
import { getPluginConfig, setPluginMode } from './config';
import { LogDecorator } from './decorator';
import { PythonLogFoldingProvider } from './folding';
import { CONFIG_SECTION } from './constants';

export function activate(context: vscode.ExtensionContext): void {
  let config: PluginConfig = getPluginConfig();
  const decorator = new LogDecorator(config);

  // Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'pythonLogFocus.switchMode';
  context.subscriptions.push(statusBarItem);

  function updateStatusBar(): void {
    if (!config.showStatusBarItem) {
      statusBarItem.hide();
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      statusBarItem.hide();
      return;
    }

    switch (config.mode) {
      case 'dim':
        statusBarItem.text = '$(eye) Log: Dim';
        statusBarItem.tooltip = 'Python Log: 视觉淡化 (点击切换模式, Alt+L 轮换)';
        break;
      case 'mask':
        statusBarItem.text = '$(fold) Log: Mask';
        statusBarItem.tooltip = 'Python Log: 内联遮罩 (点击切换模式, Alt+L 轮换)';
        break;
      case 'off':
        statusBarItem.text = '$(circle-slash) Log: Off';
        statusBarItem.tooltip = 'Python Log: 关闭 (点击切换模式, Alt+L 轮换)';
        break;
    }
    statusBarItem.show();
  }

  // Update all visible editors
  function updateAllVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'python') {
        decorator.updateEditor(editor);
      }
    }
    updateStatusBar();
  }

  // Debounced update for active editor
  let editTimer: NodeJS.Timeout | undefined;
  function triggerDocUpdate(doc: vscode.TextDocument): void {
    if (editTimer) clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === doc) {
          decorator.updateEditor(editor);
        }
      }
    }, 120);
  }

  let selectionTimer: NodeJS.Timeout | undefined;
  function triggerSelectionUpdate(editor: vscode.TextEditor): void {
    if (!config.unfoldOnCursor) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      if (vscode.window.activeTextEditor === editor) {
        decorator.updateEditor(editor);
      }
    }, 40);
  }

  // Helper to fold all multiline logs in an editor
  async function foldAllMultilineLogs(editor?: vscode.TextEditor): Promise<number> {
    const targetEditor = editor || vscode.window.activeTextEditor;
    if (!targetEditor || targetEditor.document.languageId !== 'python') return 0;

    const items = decorator.getLogItems(targetEditor.document);
    const multilineLines = items.filter(it => it.isMultiline).map(it => it.startLine);

    if (multilineLines.length > 0) {
      await vscode.commands.executeCommand('editor.fold', {
        levels: 1,
        direction: 'up',
        selectionLines: multilineLines
      });
      return multilineLines.length;
    }
    return 0;
  }

  // Helper to unfold all multiline logs in an editor
  async function unfoldAllMultilineLogs(editor?: vscode.TextEditor): Promise<number> {
    const targetEditor = editor || vscode.window.activeTextEditor;
    if (!targetEditor || targetEditor.document.languageId !== 'python') return 0;

    const items = decorator.getLogItems(targetEditor.document);
    const multilineLines = items.filter(it => it.isMultiline).map(it => it.startLine);

    if (multilineLines.length > 0) {
      await vscode.commands.executeCommand('editor.unfold', {
        levels: 1,
        direction: 'up',
        selectionLines: multilineLines
      });
      return multilineLines.length;
    }
    return 0;
  }

  // Centralized mode change handler with auto-fold/unfold linkage
  async function applyModeChange(newMode: DimmerMode): Promise<void> {
    const oldMode = config.mode;
    if (oldMode === newMode) return;

    await setPluginMode(newMode);
    config = getPluginConfig();
    decorator.updateConfig(config);
    updateAllVisibleEditors();

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'python') {
      if (newMode === 'mask' && config.multilineFolding) {
        setTimeout(() => {
          foldAllMultilineLogs(activeEditor);
        }, 80);
      } else if (oldMode === 'mask') {
        setTimeout(() => {
          unfoldAllMultilineLogs(activeEditor);
        }, 80);
      }
    }
  }

  // 1. Switch Mode Command (QuickPick)
  const switchModeCmd = vscode.commands.registerCommand(
    'pythonLogFocus.switchMode',
    async () => {
      interface ModePickItem extends vscode.QuickPickItem {
        mode: DimmerMode;
      }

      const items: ModePickItem[] = [
        {
          label: '$(eye) 视觉淡化 (Dim)',
          description: '保持代码结构，降低日志对比度/半透明显示',
          detail: config.mode === 'dim' ? '✓ 当前已激活' : undefined,
          mode: 'dim'
        },
        {
          label: '$(fold) 内联遮罩 (Mask)',
          description: '融合淡化与紧凑占位标签，并自动折叠跨行多行日志',
          detail: config.mode === 'mask' ? '✓ 当前已激活' : undefined,
          mode: 'mask'
        },
        {
          label: '$(circle-slash) 关闭 (Off)',
          description: '恢复默认显示，不应用任何样式',
          detail: config.mode === 'off' ? '✓ 当前已激活' : undefined,
          mode: 'off'
        }
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `当前模式: ${config.mode.toUpperCase()}。请选择日志显示模式:`
      });

      if (picked) {
        await applyModeChange(picked.mode);
        vscode.window.setStatusBarMessage(`Python Log 模式已切换为: ${picked.mode}`, 2500);
      }
    }
  );

  // 2. Cycle Mode Command (Dim -> Mask -> Off -> Dim)
  const cycleModeCmd = vscode.commands.registerCommand(
    'pythonLogFocus.cycleMode',
    async () => {
      let nextMode: DimmerMode = 'dim';
      if (config.mode === 'dim') nextMode = 'mask';
      else if (config.mode === 'mask') nextMode = 'off';
      else nextMode = 'dim';

      await applyModeChange(nextMode);
      vscode.window.setStatusBarMessage(`Python Log: 已切换为 ${nextMode.toUpperCase()}`, 2000);
    }
  );

  // 3. Toggle Dim Mode
  const toggleDimCmd = vscode.commands.registerCommand(
    'pythonLogFocus.toggleDim',
    async () => {
      const nextMode: DimmerMode = config.mode === 'dim' ? 'off' : 'dim';
      await applyModeChange(nextMode);
    }
  );

  // 4. Toggle Mask Mode
  const toggleMaskCmd = vscode.commands.registerCommand(
    'pythonLogFocus.toggleMask',
    async () => {
      const nextMode: DimmerMode = config.mode === 'mask' ? 'off' : 'mask';
      await applyModeChange(nextMode);
    }
  );

  // 5. Fold All Multiline Logs
  const foldAllLogsCmd = vscode.commands.registerCommand(
    'pythonLogFocus.foldAllLogs',
    async () => {
      const count = await foldAllMultilineLogs();
      if (count > 0) {
        vscode.window.setStatusBarMessage(`已折叠 ${count} 处多行日志`, 2000);
      } else {
        vscode.window.setStatusBarMessage('当前文档未发现跨行多行日志', 2000);
      }
    }
  );

  // 6. Unfold All Multiline Logs
  const unfoldAllLogsCmd = vscode.commands.registerCommand(
    'pythonLogFocus.unfoldAllLogs',
    async () => {
      const count = await unfoldAllMultilineLogs();
      if (count > 0) {
        vscode.window.setStatusBarMessage(`已展开 ${count} 处多行日志`, 2000);
      } else {
        vscode.window.setStatusBarMessage('当前文档未发现跨行多行日志', 2000);
      }
    }
  );

  // Event Subscriptions
  context.subscriptions.push(
    switchModeCmd,
    cycleModeCmd,
    toggleDimCmd,
    toggleMaskCmd,
    foldAllLogsCmd,
    unfoldAllLogsCmd,
    decorator
  );

  // Folding Provider
  if (config.multilineFolding) {
    const foldingProvider = vscode.languages.registerFoldingRangeProvider(
      'python',
      new PythonLogFoldingProvider(decorator)
    );
    context.subscriptions.push(foldingProvider);
  }

  // Active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'python') {
        decorator.updateEditor(editor);
        if (config.mode === 'mask' && config.multilineFolding) {
          setTimeout(() => foldAllMultilineLogs(editor), 100);
        }
      }
      updateStatusBar();
    })
  );

  // Visible editors change
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        if (editor.document.languageId === 'python') {
          decorator.updateEditor(editor);
        }
      }
      updateStatusBar();
    })
  );

  // Document text change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'python') {
        triggerDocUpdate(event.document);
      }
    })
  );

  // Selection change (unfold on cursor)
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.languageId === 'python') {
        triggerSelectionUpdate(event.textEditor);
      }
    })
  );

  // Configuration change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        const oldMode = config.mode;
        config = getPluginConfig();
        decorator.updateConfig(config);
        updateAllVisibleEditors();

        if (oldMode !== config.mode) {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && activeEditor.document.languageId === 'python') {
            if (config.mode === 'mask' && config.multilineFolding) {
              setTimeout(() => foldAllMultilineLogs(activeEditor), 80);
            } else if (oldMode === 'mask') {
              setTimeout(() => unfoldAllMultilineLogs(activeEditor), 80);
            }
          }
        }
      }
    })
  );

  // Initial render
  updateAllVisibleEditors();
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor && initialEditor.document.languageId === 'python') {
    if (config.mode === 'mask' && config.multilineFolding) {
      setTimeout(() => foldAllMultilineLogs(initialEditor), 120);
    }
  }
}

export function deactivate(): void {
  // cleanup automatically handled by subscriptions
}
