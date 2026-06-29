// ============= Structured logger =============
// Tiny zero-dependency logger. JSON output when LOG_FORMAT=json (recommended
// for production / log aggregators), human-readable text otherwise.
// Levels: debug < info < warn < error. Configure with LOG_LEVEL.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;
const FORMAT = (process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'text')).toLowerCase();

function emit(level, msg, meta) {
  if (LEVELS[level] < LEVEL) return;
  const ts = new Date().toISOString();
  if (FORMAT === 'json') {
    const rec = { time: ts, level, msg, ...(meta || {}) };
    if (meta?.err instanceof Error) {
      rec.err = { name: meta.err.name, message: meta.err.message, stack: meta.err.stack };
    }
    const line = JSON.stringify(rec);
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  } else {
    const tag = level.toUpperCase().padEnd(5);
    const extra = meta && Object.keys(meta).length
      ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${v instanceof Error ? v.message : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')
      : '';
    const line = `${ts} ${tag} ${msg}${extra}`;
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  }
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info:  (msg, meta) => emit('info', msg, meta),
  warn:  (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  child(bindings) {
    return {
      debug: (msg, meta) => emit('debug', msg, { ...bindings, ...meta }),
      info:  (msg, meta) => emit('info', msg, { ...bindings, ...meta }),
      warn:  (msg, meta) => emit('warn', msg, { ...bindings, ...meta }),
      error: (msg, meta) => emit('error', msg, { ...bindings, ...meta }),
    };
  },
};

export default logger;
