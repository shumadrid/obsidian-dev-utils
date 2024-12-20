/**
 * @packageDocumentation Vault
 * This module provides utility functions for working with the Obsidian Vault.
 */

import type {
  ListedFiles,
  TFolder
} from 'obsidian';

import {
  App,
  Notice,
  TFile
} from 'obsidian';
import { parentFolderPath } from 'obsidian-typings/implementations';

import type { RetryOptions } from '../Async.ts';
import type { ValueProvider } from '../ValueProvider.ts';
import type {
  PathOrAbstractFile,
  PathOrFile,
  PathOrFolder
} from './FileSystem.ts';

import { retryWithTimeout } from '../Async.ts';
import { printError } from '../Error.ts';
import { noopAsync } from '../Function.ts';
import {
  basename,
  dirname,
  extname,
  join
} from '../Path.ts';
import { resolveValue } from '../ValueProvider.ts';
import {
  getAbstractFileOrNull,
  getFile,
  getFileOrNull,
  getFolder,
  getFolderOrNull,
  getPath,
  isFile,
  isFolder,
  isNote
} from './FileSystem.ts';
import { getBacklinksForFileSafe } from './MetadataCache.ts';

/**
 * Options for the `process` function.
 */
export interface ProcessOptions extends RetryOptions {
  /**
   * If `true`, the function will throw an error if the file is missing or deleted.
   */
  shouldFailOnMissingFile?: boolean;
}

/**
 * Copies a file safely in the vault.
 *
 * @param app - The application instance.
 * @param oldPathOrFile - The old path or file to copy.
 * @param newPath - The new path to copy the file to.
 * @returns A promise that resolves to the new path of the copied file.
 */
export async function copySafe(app: App, oldPathOrFile: PathOrFile, newPath: string): Promise<string> {
  const file = getFile(app, oldPathOrFile);

  const newFolderPath = parentFolderPath(newPath);
  await createFolderSafe(app, newFolderPath);

  const newAvailablePath = getAvailablePath(app, newPath);

  try {
    await app.vault.copy(file, newAvailablePath);
  } catch (e) {
    if (!await app.vault.exists(newAvailablePath)) {
      throw e;
    }
  }

  return newAvailablePath;
}

/**
 * Creates a folder safely in the specified path.
 *
 * @param app - The application instance.
 * @param path - The path of the folder to create.
 * @returns A promise that resolves to a boolean indicating whether the folder was created.
 * @throws If an error occurs while creating the folder and it still doesn't exist.
 */
export async function createFolderSafe(app: App, path: string): Promise<boolean> {
  if (await app.vault.adapter.exists(path)) {
    return false;
  }

  try {
    await app.vault.createFolder(path);
    return true;
  } catch (e) {
    if (!await app.vault.exists(path)) {
      throw e;
    }
    return true;
  }
}

/**
 * Creates a temporary file in the vault with parent folders if needed.
 * @param app - The application instance.
 * @param path - The path of the file to create.
 * @returns A promise that resolves to a function that can be called to delete the temporary file and all its created parents.
 */
export async function createTempFile(app: App, path: string): Promise<() => Promise<void>> {
  let file = getFileOrNull(app, path);
  if (file) {
    return noopAsync;
  }

  const folderCleanup = await createTempFolder(app, parentFolderPath(path));

  try {
    await app.vault.create(path, '');
  } catch (e) {
    if (!await app.vault.exists(path)) {
      throw e;
    }
  }

  file = getFile(app, path);

  return async () => {
    if (!file.deleted) {
      await app.fileManager.trashFile(file);
    }
    await folderCleanup();
  };
}

/**
 * Creates a temporary folder in the vault with parent folders if needed.
 * @param app - The application instance.
 * @param path - The path of the folder to create.
 * @returns A promise that resolves to a function that can be called to delete the temporary folder and all its created parents.
 */
export async function createTempFolder(app: App, path: string): Promise<() => Promise<void>> {
  let folder = getFolderOrNull(app, path);
  if (folder) {
    return noopAsync;
  }

  const dirPath = parentFolderPath(path);
  await createTempFolder(app, dirPath);

  const folderCleanup = await createTempFolder(app, parentFolderPath(path));

  await createFolderSafe(app, path);

  folder = getFolder(app, path);

  return async () => {
    if (!folder.deleted) {
      await app.fileManager.trashFile(folder);
    }
    await folderCleanup();
  };
}

/**
 * Removes empty folder hierarchy starting from the given folder.
 *
 * @param app - The application instance.
 * @param pathOrFolder - The folder to start removing empty hierarchy from.
 * @returns A promise that resolves when the empty hierarchy is deleted.
 */
export async function deleteEmptyFolderHierarchy(app: App, pathOrFolder: null | PathOrFolder): Promise<void> {
  let folder = getFolderOrNull(app, pathOrFolder);

  while (folder) {
    if (!await isEmptyFolder(app, folder)) {
      return;
    }
    const parent = folder.parent;
    await deleteSafe(app, folder.path);
    folder = parent;
  }
}

/**
 * Deletes abstract file safely from the vault.
 *
 * @param app - The Obsidian application instance.
 * @param pathOrFile - The path or abstract file to delete.
 * @param deletedNotePath - Optional. The path of the note that triggered the removal.
 * @param shouldReportUsedAttachments - Optional. If `true`, a notice will be shown for each attachment that is still used by other notes.
 * @param shouldDeleteEmptyFolders - Optional. If `true`, empty folders will be deleted.
 * @returns A promise that resolves to a boolean indicating whether the removal was successful.
 */
export async function deleteSafe(app: App, pathOrFile: PathOrAbstractFile, deletedNotePath?: string, shouldReportUsedAttachments?: boolean, shouldDeleteEmptyFolders?: boolean): Promise<boolean> {
  const file = getAbstractFileOrNull(app, pathOrFile);

  if (!file) {
    return false;
  }

  let canDelete = isFile(file) || (shouldDeleteEmptyFolders ?? true);

  if (isFile(file)) {
    const backlinks = await getBacklinksForFileSafe(app, file);
    if (deletedNotePath) {
      backlinks.clear(deletedNotePath);
    }
    if (backlinks.count() !== 0) {
      if (shouldReportUsedAttachments) {
        new Notice(`Attachment ${file.path} is still used by other notes. It will not be deleted.`);
      }
      canDelete = false;
    }
  } else if (isFolder(file)) {
    const listedFiles = await listSafe(app, file);
    for (const child of [...listedFiles.files, ...listedFiles.folders]) {
      canDelete &&= await deleteSafe(app, child, deletedNotePath, shouldReportUsedAttachments);
    }

    canDelete &&= await isEmptyFolder(app, file);
  }

  if (canDelete) {
    try {
      await app.fileManager.trashFile(file);
    } catch (e) {
      if (await app.vault.exists(file.path)) {
        printError(new Error(`Failed to delete ${file.path}`, { cause: e }));
        canDelete = false;
      }
    }
  }

  return canDelete;
}

/**
 * Gets an available path for a file in the vault.
 *
 * @param app - The application instance.
 * @param path - The path of the file to get an available path for.
 * @returns The available path for the file.
 */
export function getAvailablePath(app: App, path: string): string {
  const ext = extname(path);
  return app.vault.getAvailablePath(join(dirname(path), basename(path, ext)), ext.slice(1));
}

/**
 * Retrieves an array of Markdown files from the app's vault and sorts them alphabetically by their file path.
 *
 * @param app - The Obsidian app instance.
 * @returns An array of Markdown files sorted by file path.
 */
export function getMarkdownFilesSorted(app: App): TFile[] {
  return app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Retrieves an array of all note files from the app's vault and sorts them alphabetically by their file path.
 * @param app - The Obsidian app instance.
 * @returns An array of all note files in the vault sorted by file path.
 */
export function getNoteFilesSorted(app: App): TFile[] {
  return app.vault.getAllLoadedFiles().filter((file) => isFile(file) && isNote(app, file)).sort((a, b) => a.path.localeCompare(b.path)) as TFile[];
}

/**
 * Gets a safe rename path for a file.
 *
 * @param app - The application instance.
 * @param oldPathOrFile - The old path or file to rename.
 * @param newPath - The new path to rename the file to.
 * @returns The safe rename path for the file.
 */
export function getSafeRenamePath(app: App, oldPathOrFile: PathOrFile, newPath: string): string {
  const oldPath = getPath(app, oldPathOrFile);

  if (app.vault.adapter.insensitive) {
    let folderPath = dirname(newPath);
    let nonExistingPath = basename(newPath);
    let folder: null | TFolder = null;
    for (; ;) {
      folder = getFolderOrNull(app, folderPath, true);
      if (folder) {
        break;
      }
      nonExistingPath = join(basename(folderPath), nonExistingPath);
      folderPath = dirname(folderPath);
    }
    newPath = join(folder.getParentPrefix(), nonExistingPath);
  }

  if (oldPath.toLowerCase() === newPath.toLowerCase()) {
    return newPath;
  }

  return getAvailablePath(app, newPath);
}

/**
 * Checks if a folder is empty.
 * @param app - The application instance.
 * @param pathOrFolder - The path or folder to check.
 * @returns A promise that resolves to a boolean indicating whether the folder is empty.
 */
export async function isEmptyFolder(app: App, pathOrFolder: PathOrFolder): Promise<boolean> {
  const listedFiles = await listSafe(app, getPath(app, pathOrFolder));
  return listedFiles.files.length === 0 && listedFiles.folders.length === 0;
}

/**
 * Safely lists the files and folders at the specified path in the vault.
 *
 * @param app - The Obsidian application instance.
 * @param pathOrFolder - The path or folder to list.
 * @returns A promise that resolves to a `ListedFiles` object containing the listed files and folders.
 */
export async function listSafe(app: App, pathOrFolder: PathOrFolder): Promise<ListedFiles> {
  const path = getPath(app, pathOrFolder);
  const EMPTY = { files: [], folders: [] };

  if ((await app.vault.adapter.stat(path))?.type !== 'folder') {
    return EMPTY;
  }

  try {
    return await app.vault.adapter.list(path);
  } catch (e) {
    if (await app.vault.exists(path)) {
      throw e;
    }
    return EMPTY;
  }
}

/**
 * Processes a file with retry logic, updating its content based on a provided value or function.
 *
 * @param app - The application instance, typically used for accessing the vault.
 * @param pathOrFile - The path or file to be processed. It can be a string representing the path or a file object.
 * @param newContentProvider - A value provider that returns the new content based on the old content of the file.
 * It can be a string or a function that takes the old content as an argument and returns the new content.
 * If function is provided, it should return `null` if the process should be retried.
 * @param options - Optional. Configuration options for retrying the process. If not provided, default options will be used.
 *
 * @returns A promise that resolves once the process is complete.
 *
 * @throws Will throw an error if the process fails after the specified number of retries or timeout.
 */
export async function process(app: App, pathOrFile: PathOrFile, newContentProvider: ValueProvider<null | string, [string]>, options: RetryOptions = {}): Promise<void> {
  const DEFAULT_RETRY_OPTIONS = {
    shouldFailOnMissingFile: true
  };
  const fullOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const path = getPath(app, pathOrFile);

  await retryWithTimeout(async () => {
    let oldContent = '';

    let doesFileExist = await queueFileAction(app, path, fullOptions.shouldFailOnMissingFile, async (file) => {
      oldContent = await app.vault.read(file);
    });

    if (!doesFileExist) {
      return true;
    }

    const newContent = await resolveValue(newContentProvider, oldContent);
    if (newContent === null) {
      return false;
    }

    let isSuccess = true;
    doesFileExist = await queueFileAction(app, path, fullOptions.shouldFailOnMissingFile, async (file) => {
      await app.vault.process(file, (content) => {
        if (content !== oldContent) {
          console.warn('Content has changed since it was read. Retrying...', {
            actualContent: content,
            expectedContent: oldContent,
            path: file.path
          });
          isSuccess = false;
          return content;
        }

        return newContent;
      });
    });

    if (!doesFileExist) {
      return true;
    }

    return isSuccess;
  }, fullOptions);
}

/**
 * Renames a file safely in the vault.
 * If the new path already exists, the file will be renamed to an available path.
 *
 * @param app - The application instance.
 * @param oldPathOrFile - The old path or file to rename.
 * @param newPath - The new path to rename the file to.
 * @returns A promise that resolves to the new path of the file.
 */
export async function renameSafe(app: App, oldPathOrFile: PathOrFile, newPath: string): Promise<string> {
  const oldFile = getFile(app, oldPathOrFile, false, true);

  const newAvailablePath = getSafeRenamePath(app, oldPathOrFile, newPath);

  if (oldFile.path.toLowerCase() === newAvailablePath.toLowerCase()) {
    if (oldFile.path !== newPath) {
      await app.vault.rename(oldFile, newAvailablePath);
    }
    return newAvailablePath;
  }

  const newFolderPath = parentFolderPath(newAvailablePath);
  await createFolderSafe(app, newFolderPath);

  try {
    await app.vault.rename(oldFile, newAvailablePath);
  } catch (e) {
    if (!await app.vault.exists(newAvailablePath) || await app.vault.exists(oldFile.path)) {
      throw e;
    }
  }

  return newAvailablePath;
}

async function queueFileAction(app: App, path: string, shouldFailOnMissingFile: boolean, fileAction: (file: TFile) => Promise<void>): Promise<boolean> {
  let result = true;
  await app.vault.adapter.queue(async () => {
    const file = getFileOrNull(app, path);
    if (!file || file.deleted) {
      if (shouldFailOnMissingFile) {
        throw new Error(`File ${path} not found`);
      }
      result = false;
    } else {
      await fileAction(file);
    }
  });

  return result;
}
