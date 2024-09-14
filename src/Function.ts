/**
 * Makes a function that calls the original function with the provided arguments and omits the return value.
 *
 * @typeParam Args - Arguments to be passed to the function.
 * @param fn - Function to be called.
 * @returns A function that calls the original function with the provided arguments and omits the return value.
 */
export function omitReturnType<Args extends unknown[]>(fn: (...args: Args) => unknown): (...args: Args) => void {
  return (...args: Args) => {
    fn(...args);
  };
}

/**
 * Makes an async function that calls the original async function with the provided arguments and omits the return value.
 *
 * @typeParam Args - Arguments to be passed to the function.
 * @param fn - Function to be called.
 * @returns An async function that calls the original function with the provided arguments and omits the return value.
 */
export function omitAsyncReturnType<Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    await fn(...args);
  };
}
