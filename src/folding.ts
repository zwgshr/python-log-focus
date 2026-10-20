import * as vscode from 'vscode';
import { LogDecorator } from './decorator';

export class PythonLogFoldingProvider implements vscode.FoldingRangeProvider {
  constructor(private decorator: LogDecorator) {}

  public provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    if (document.languageId !== 'python') {
      return [];
    }

    const items = this.decorator.getLogItems(document);
    const ranges: vscode.FoldingRange[] = [];

    for (const item of items) {
      if (item.isMultiline && item.endLine > item.startLine) {
        ranges.push(
          new vscode.FoldingRange(
            item.startLine,
            item.endLine,
            vscode.FoldingRangeKind.Region
          )
        );
      }
    }

    return ranges;
  }
}
