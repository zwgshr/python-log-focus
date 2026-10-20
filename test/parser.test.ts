import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePythonLogs } from '../src/parser';

describe('Python Log Parser', () => {
  it('should parse simple single-line log calls', () => {
    const code = `
import logging
logger = logging.getLogger(__name__)

def main():
    logger.info("Application starting...")
    x = 42
    logger.debug("Value of x is %d", x)
    return x
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 2);

    assert.equal(logs[0].receiver, 'logger');
    assert.equal(logs[0].level, 'info');
    assert.equal(logs[0].startLine, 5);
    assert.equal(logs[0].endLine, 5);
    assert.equal(logs[0].isMultiline, false);
    assert.equal(logs[0].previewText, 'Application starting...');

    assert.equal(logs[1].receiver, 'logger');
    assert.equal(logs[1].level, 'debug');
    assert.equal(logs[1].startLine, 7);
    assert.equal(logs[1].previewText, 'Value of x is %d');
  });

  it('should parse multiline log calls with nested structures', () => {
    const code = `
logger.info(
    "Processing batch of %d items for user %s",
    len(items),
    user.name,
    extra={
        "trace_id": get_trace_id(),
        "tags": ["prod", "batch", (1, 2)]
    }
)
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'info');
    assert.equal(logs[0].isMultiline, true);
    assert.equal(logs[0].startLine, 1);
    assert.equal(logs[0].endLine, 9);
    assert.equal(logs[0].previewText.startsWith('Processing batch of %d items'), true);
  });

  it('should handle strings with parentheses and escaped quotes inside', () => {
    const code = `
logger.warning("Invalid syntax: function() requires (arg1, arg2) but got \\"None\\"")
logger.error('Single quote (with parenthesis) and \\'escaped\\' quote')
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].level, 'warning');
    assert.equal(logs[0].isMultiline, false);
    assert.equal(logs[1].level, 'error');
  });

  it('should ignore logger calls inside comments and string literals', () => {
    const code = `
# logger.info("This is in a comment, do not parse!")
"""
def fake():
    logger.error("Docstring call should be ignored")
"""
msg = "Please invoke logger.warning('sample') for diagnostics"
real = 'logger.debug("also in string")'

logger.critical("This is the ONLY real logger call")
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'critical');
    assert.equal(logs[0].previewText, 'This is the ONLY real logger call');
  });

  it('should handle comments inside multiline log calls', () => {
    const code = `
logger.info(
    # Note: this is an inline comment with (unclosed paren
    "Real message",
    # Another comment
    val
)
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'info');
    assert.equal(logs[0].isMultiline, true);
    assert.equal(logs[0].previewText, 'Real message');
  });

  it('should handle various receiver styles: self.logger, logging, loguru, etc.', () => {
    const code = `
self.logger.info("Class logger")
self._logger.debug("Private class logger")
logging.warning("Standard logging module")
log.error("Short log name")
loguru.logger.success = False
loguru.logger.info("Loguru logger call")
current_app.logger.debug("Flask app logger")
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 6);
    assert.equal(logs[0].receiver, 'self.logger');
    assert.equal(logs[1].receiver, 'self._logger');
    assert.equal(logs[2].receiver, 'logging');
    assert.equal(logs[3].receiver, 'log');
    assert.equal(logs[4].receiver, 'loguru.logger');
    assert.equal(logs[5].receiver, 'current_app.logger');
  });

  it('should support custom loggers and custom levels', () => {
    const code = `
my_custom_client.audit("User 123 transferred funds")
foo_logger.trace("Entering trace function")
`;
    const logs = parsePythonLogs(code, ['my_custom_client', 'foo_logger'], ['audit', 'trace']);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].receiver, 'my_custom_client');
    assert.equal(logs[0].level, 'audit');
    assert.equal(logs[1].receiver, 'foo_logger');
    assert.equal(logs[1].level, 'trace');
  });

  it('should handle f-strings properly', () => {
    const code = `
logger.info(f"User {user.get_id()} performed action {action}")
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].previewText.startsWith('User {user.get_id()}'), true);
  });

  it('should parse logger.success and loguru trace without custom configuration', () => {
    const code = `
logger.success("Operation completed successfully!")
loguru_logger.trace("Detailed low-level trace")
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].level, 'success');
    assert.equal(logs[0].previewText, 'Operation completed successfully!');
    assert.equal(logs[1].level, 'trace');
    assert.equal(logs[1].previewText, 'Detailed low-level trace');
  });

  it('should support Loguru chained calls like .bind(...) and .opt(...)', () => {
    const code = `
logger.bind(user_id="U1001", session="S99").success("User logged in")
loguru_logger.opt(exception=True).error("Fatal crash")
logger.opt(depth=1).bind(trace_id="T01").info("Request dispatched")
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 3);

    assert.equal(logs[0].level, 'success');
    assert.equal(logs[0].receiver, 'logger.bind(user_id="U1001", session="S99")');
    assert.equal(logs[0].previewText, 'User logged in');

    assert.equal(logs[1].level, 'error');
    assert.equal(logs[1].receiver, 'loguru_logger.opt(exception=True)');
    assert.equal(logs[1].previewText, 'Fatal crash');

    assert.equal(logs[2].level, 'info');
    assert.equal(logs[2].receiver, 'logger.opt(depth=1).bind(trace_id="T01")');
  });

  it('should support Python 3.14 PEP 750 template strings (t-strings)', () => {
    const code = `
logger.info(t"User {user_id} registered with {role}")
logger.success(tr"Safe raw template {data}")

# Ensure fake calls inside t-strings are ignored
s1 = t"Do not trigger logger.success('fake_in_t_str')"
s2 = tr"""Multi-line t-string logger.info('fake')"""
`;
    const logs = parsePythonLogs(code);
    assert.equal(logs.length, 2);

    assert.equal(logs[0].level, 'info');
    assert.equal(logs[0].previewText, 'User {user_id} registered with {role}');

    assert.equal(logs[1].level, 'success');
    assert.equal(logs[1].previewText, 'Safe raw template {data}');
  });
});
