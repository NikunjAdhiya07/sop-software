/** Serializes client-side PDF resolution so only one heavy parse runs at a time. */

let chain: Promise<unknown> = Promise.resolve();

export function enqueuePdfResolve<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Combine abort signals — aborts when any source aborts. */
export function mergeAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  const linked: Array<{ signal: AbortSignal; handler: () => void }> = [];

  const unlink = () => {
    for (const { signal, handler } of linked) {
      signal.removeEventListener('abort', handler);
    }
    linked.length = 0;
  };

  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      unlink();
      return controller.signal;
    }
    const handler = () => {
      controller.abort();
      unlink();
    };
    signal.addEventListener('abort', handler, { once: true });
    linked.push({ signal, handler });
  }

  return controller.signal;
}

export function isPdfTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /transport destroyed|detached ArrayBuffer|Invalid PDF/i.test(msg);
}
