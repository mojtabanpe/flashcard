/** Read a password from the terminal without echoing it (or from RECALL_PASSWORD). */
export function readPassword(prompt: string): Promise<string> {
  const fromEnv = process.env['RECALL_PASSWORD'];
  if (fromEnv !== undefined) return check(fromEnv);
  const input = process.stdin;
  if (!input.isTTY) return Promise.reject(new Error('Run in a terminal or set RECALL_PASSWORD.'));
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const done = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else check(value).then(resolve, reject);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return done();
        if (char === '\u0003') return done(new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on('data', onData);
  });
}
function check(value: string) {
  return value.length >= 6 && value.length <= 128
    ? Promise.resolve(value)
    : Promise.reject(new Error('Password must be 6–128 characters.'));
}
