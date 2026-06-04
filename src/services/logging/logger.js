export function safeLog(message, meta = {}) {
  const cleanMeta = { ...meta };
  for (const key of Object.keys(cleanMeta)) {
    if (/token|secret|password|key/i.test(key)) cleanMeta[key] = '[redacted]';
  }
  console.log(message, cleanMeta);
}

export function safeError(message, error, meta = {}) {
  safeLog(message, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
  });
}
