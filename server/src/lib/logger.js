'use strict';

const isTest = process.env.NODE_ENV === 'test';

function stamp() {
  return new Date().toISOString();
}

function write(level, args) {
  if (isTest && level !== 'error') return;
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](`[${stamp()}] ${level.toUpperCase()}`, ...args);
}

module.exports = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => {
    if (process.env.NODE_ENV === 'production') return;
    write('debug', args);
  },
};
