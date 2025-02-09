import type { Linter } from 'eslint';

// eslint-disable-next-line import-x/default
import eslintPluginTsdocRequired from '@guardian/eslint-plugin-tsdoc-required';
import eslintPluginTsdoc from 'eslint-plugin-tsdoc';
import eslintPluginVerifyTsdoc from 'eslint-plugin-verify-tsdoc';

import { join } from '../src/Path.ts';
import { configs as defaultConfigs } from '../src/scripts/ESLint/eslint.config.ts';
import { ObsidianDevUtilsRepoPaths } from '../src/scripts/ObsidianDevUtilsRepoPaths.ts';

/**
 * The ESLint configurations
 */
export const configs: Linter.Config[] = [
  ...defaultConfigs,
  {
    ignores: [
      join(ObsidianDevUtilsRepoPaths.AnyPath, ObsidianDevUtilsRepoPaths.IndexTs),
      ObsidianDevUtilsRepoPaths.DataviewTypes
    ]
  },
  {
    plugins: {
      'eslint-plugin-tsdoc-required': eslintPluginTsdocRequired,
      'tsdoc': eslintPluginTsdoc,
      'verify-tsdoc': eslintPluginVerifyTsdoc
    },
    rules: {
      'eslint-plugin-tsdoc-required/tsdoc-required': 'error',
      'tsdoc/syntax': 'error',
      'verify-tsdoc/verify-tsdoc-params': 'error'
    }
  }
];
