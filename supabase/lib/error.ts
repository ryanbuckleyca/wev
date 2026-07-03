export function printExecError(error: unknown, prefix = "❌"): void {
  if (error instanceof Error) {
    console.error(`${prefix} ${error.message}`);
    const e = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    if (e.stdout) console.error(String(e.stdout));
    if (e.stderr) console.error(String(e.stderr));
  } else {
    console.error(`${prefix} ${String(error)}`);
  }
}
