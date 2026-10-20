export const DEFAULT_LOGGERS: readonly string[] = [
  'logger',
  'logging',
  'log',
  'self.logger',
  'self._logger',
  'cls.logger',
  'cls._logger',
  '_logger',
  'LOGGER',
  'LOG',
  'loguru.logger',
  'loguru_logger',
  'app_logger',
  'current_app.logger',
  'structlog'
];

export const DEFAULT_LEVELS: readonly string[] = [
  'trace',
  'debug',
  'info',
  'success',
  'warning',
  'warn',
  'error',
  'critical',
  'fatal',
  'exception',
  'log'
];

export const ADAPTIVE_THEMES: Readonly<Record<string, Record<string, string>>> = {
  geometric: {
    trace: '··',
    debug: '⌕',
    info: '▸',
    success: '◆',
    warning: '▲',
    warn: '▲',
    error: '✖',
    critical: '✦',
    fatal: '✦',
    exception: '✦',
    log: '▫'
  },
  emoji: {
    trace: '🐾',
    debug: '🐛',
    info: 'ℹ️',
    success: '✨',
    warning: '⚠️',
    warn: '⚠️',
    error: '❌',
    critical: '🚨',
    fatal: '🚨',
    exception: '💥',
    log: '📝'
  },
  subtle: {
    trace: '🔎',
    debug: '🔧',
    info: '💬',
    success: '✅',
    warning: '⚡',
    warn: '⚡',
    error: '🛑',
    critical: '💥',
    fatal: '💥',
    exception: '💥',
    log: '📄'
  },
  ascii: {
    trace: '·',
    debug: '?',
    info: 'i',
    success: 'v',
    warning: '!',
    warn: '!',
    error: 'x',
    critical: '*',
    fatal: '*',
    exception: '*',
    log: '#'
  }
};

export const DEFAULT_MASK_ICON = 'emoji';

export const CONFIG_SECTION = 'pythonLogFocus';
