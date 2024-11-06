/**
 * @packageDocumentation ChainedPromise
 * Contains utility functions for chaining functions in Obsidian.
 */

import type { App } from 'obsidian';

import type { MaybePromise } from '../Async.ts';
import type { ValueWrapper } from './App.ts';

import { addErrorHandler } from '../Async.ts';
import { getStackTrace } from '../Error.ts';
import { getObsidianDevUtilsState } from './App.ts';
import { invokeAsyncAndLog } from './Logger.ts';

function getChainedPromiseWrapper(app: App): ValueWrapper<Promise<void>> {
  return getObsidianDevUtilsState(app, 'chainedPromise', Promise.resolve());
}

/**
 * Chains an asynchronous function to be executed after the previous function completes.
 *
 * @param app - The Obsidian application instance.
 * @param fn - The function to chain.
 */
export function chain(app: App, fn: () => MaybePromise<void>): void {
  const stackTrace = getStackTrace();
  const chainedPromiseWrapper = getChainedPromiseWrapper(app);
  chainedPromiseWrapper.value = chainedPromiseWrapper.value.then(() => addErrorHandler(() => invokeAsyncAndLog('chain', fn, stackTrace)));
}
