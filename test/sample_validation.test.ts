import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePythonLogs } from '../src/parser';

describe('Sample Python File Validation', () => {
  it('should accurately parse all real logs in sample.py including loguru.success, trace, chained calls and Python 3.14 t-strings', () => {
    const samplePath = path.resolve(__dirname, '../samples/sample.py');
    const sampleCode = fs.readFileSync(samplePath, 'utf8');

    const logs = parsePythonLogs(sampleCode);

    // Verify count: 12 real calls in sample.py.
    // Fake calls in docstring, string, t-string, and comments must NOT be parsed.
    assert.equal(logs.length, 12);

    // 1. Check single-line info
    assert.equal(logs[0].receiver, 'logger');
    assert.equal(logs[0].level, 'info');
    assert.equal(logs[0].isMultiline, false);
    assert.equal(logs[0].previewText.startsWith('Starting order processing'), true);

    // 2. Check multiline call with dict
    const multilineCall = logs.find(l => l.previewText.startsWith('Order %s qualified for discount'));
    assert.ok(multilineCall);
    assert.equal(multilineCall.isMultiline, true);

    // 3. Check Loguru success level
    const loguruSuccessCall = logs.find(l => l.level === 'success' && l.receiver === 'loguru_logger');
    assert.ok(loguruSuccessCall);
    assert.equal(loguruSuccessCall.previewText.startsWith('Payment verified for order'), true);

    // 4. Check Loguru chained modifier call (.bind(...).success(...))
    const chainedSuccessCall = logs.find(l => l.level === 'success' && l.receiver.includes('.bind'));
    assert.ok(chainedSuccessCall);
    assert.equal(chainedSuccessCall.previewText, 'Order lifecycle processed');

    // 5. Check Python 3.14 PEP 750 t-string call
    const tStringCall = logs.find(l => l.rawText.includes('t"Order {order_id} completed successfully"'));
    assert.ok(tStringCall);
    assert.equal(tStringCall.previewText, 'Order {order_id} completed successfully');

    // 6. Check Loguru trace level
    const traceCall = logs.find(l => l.level === 'trace');
    assert.ok(traceCall);
    assert.equal(traceCall.receiver, 'loguru_logger');

    // 7. Ensure fake logger calls in strings, t-strings and comments are ignored
    const fakeLog = logs.find(l => l.previewText.includes('fake'));
    assert.equal(fakeLog, undefined);
  });
});
