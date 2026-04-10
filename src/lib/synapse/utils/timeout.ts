/**
 * Timeout utility — replaces Python's asyncio.wait_for().
 */

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operation"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
