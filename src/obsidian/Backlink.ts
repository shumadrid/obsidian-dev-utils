/**
 * @packageDocumentation Backlink
 * Provides utility functions for working with backlinks.
 */

import {
  type Link,
  type DataviewInlineApi,
  renderPaginatedTable,
} from "./Dataview.ts";

import { renderCallout } from "./Callout.ts";
import { fixTitle } from "./DataviewLink.ts";
import {
  TFolder,
  type TFile
} from "obsidian";
import { generateMarkdownLink } from "./Link.ts";
import {
  getAbstractFileOrNull,
  isFile,
  type PathOrAbstractFile
} from "./TAbstractFile.ts";
import { getBacklinksForFileSafe } from "./MetadataCache.ts";
import { getMarkdownFiles } from "./TFolder.ts";
import type { PathOrFile } from "./TFile.ts";


/**
 * Options for rendering delayed backlinks.
 */
type RenderDelayedBacklinksOptions = {
  /**
   * The DataviewInlineApi instance.
   */
  dv: DataviewInlineApi;

  /**
   * An array of PathOrFile.
   */
  files: PathOrFile[];

  /**
   * The title for the rendered backlinks. Defaults to "Backlinks".
   */
  title?: string;
};

/**
 * Renders delayed backlinks.
 *
 * @param options - The options for rendering delayed backlinks.
 */
export function renderDelayedBacklinks(options: RenderDelayedBacklinksOptions): void {
  const {
    dv,
    files,
    title = "Backlinks"
  } = options;
  renderCallout({
    dv,
    header: title,
    async contentProvider() {
      await renderBacklinksTable(dv, files);
    }
  });
}

/**
 * Options for rendering delayed backlinks for a folder.
 */
type RenderDelayedBacklinksForFolderOptions = {
  /**
   * The DataviewInlineApi instance.
   */
  dv: DataviewInlineApi;

  /**
   * The folder path. If not provided, the current file's folder will be used.
   */
  folder?: string;

  /**
   * The title for the rendered backlinks. Defaults to "Folder Backlinks".
   */
  title?: string;
};

/**
 * Renders delayed backlinks for a specific folder.
 *
 * @param options - The options for rendering delayed backlinks.
 */
export function renderDelayedBacklinksForFolder(options: RenderDelayedBacklinksForFolderOptions): void {
  const {
    dv,
    folder,
    title = "Folder Backlinks"
  } = options;
  const folder2 = folder ?? dv.current().file.folder;
  renderDelayedBacklinks({
    dv,
    files: getMarkdownFiles(dv.app, folder2, true),
    title
  });
}

/**
 * Renders a backlinks table using the provided DataviewInlineApi and optional array of PathOrAbstractFile.
 *
 * @param dv - The DataviewInlineApi instance.
 * @param pathOrFiles - An optional array of PathOrAbstractFile.
 * @returns A Promise that resolves when the backlinks table has been rendered.
 */
export async function renderBacklinksTable(dv: DataviewInlineApi, pathOrFiles?: PathOrAbstractFile[]): Promise<void> {
  if (!pathOrFiles) {
    pathOrFiles = [];
  }
  const files: TFile[] = pathOrFiles.flatMap((abstractFileOrPath) => {
    const abstractFile = getAbstractFileOrNull(dv.app, abstractFileOrPath);
    if (!abstractFile) {
      return [];
    }

    if (isFile(abstractFile)) {
      return [abstractFile];
    }

    return getMarkdownFiles(dv.app, abstractFile as TFolder, true);
  });

  const backlinkRows: [Link, string[]][] = [];

  for (const file of files) {
    const link = fixTitle(dv, file.path);
    const backlinks = await getBacklinksForFileSafe(dv.app, file);
    const backlinkLinks = backlinks.keys().map((backLinkPath) => {
      const markdownLink = generateMarkdownLink({
        app: dv.app,
        pathOrFile: dv.app.metadataCache.getFirstLinkpathDest(backLinkPath, file.path)!,
        sourcePathOrFile: dv.current().file.path,
      });

      return `${markdownLink} (${backLinkPath})`;
    });
    if (backlinkLinks.length) {
      backlinkRows.push([link, backlinkLinks]);
    }
  }

  await renderPaginatedTable({
    dv,
    headers: ["Note", "Backlinks"],
    rows: backlinkRows,
  });
}
