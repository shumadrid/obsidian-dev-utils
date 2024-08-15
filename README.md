# Obsidian Dev Utils

`Obsidian Dev Utils` is a collection of essential functions and CLI tools designed to streamline your Obsidian plugin development process. Whether you're building a plugin from scratch or enhancing an existing one, these utilities are here to simplify your workflow.

## What is Obsidian?

[Obsidian](https://obsidian.md/) is a powerful knowledge base that works on top of a local folder of plain text Markdown files. It's a tool that lets you take notes and organize them, and it supports a rich plugin ecosystem that allows for extensive customization.

## Who Should Use This Package?

This package is ideal for developers who are building or maintaining plugins for Obsidian. It provides a range of tools to make the development process easier, including automated builds, linting, spellchecking, and more.

## Installation

To install the package, run the following command:

```bash
npm install obsidian-dev-utils
```

## Usage

### CLI Commands

The package offers several CLI commands to facilitate common development tasks:

#### Build Production Version

```bash
npx obsidian-dev-utils build
```

Compiles the production version of your plugin into the `dist/build` folder.

#### Build Development Version

```bash
npx obsidian-dev-utils dev
```

Compiles the development version of your plugin into the `dist/dev` folder. If the environment variable `OBSIDIAN_CONFIG_DIR` is set (e.g., `path/to/my/vault/.obsidian`), the command automatically copies the compiled plugin to the specified Obsidian configuration directory and triggers the [Hot Reload](https://github.com/pjeby/hot-reload) plugin, if installed.

#### Lint Code

```bash
npx obsidian-dev-utils lint
```

Lints your code, enforcing a code convention to minimize common errors.

#### Lint and Fix Code

```bash
npx obsidian-dev-utils lint-fix
```

Lints your code and automatically applies fixes where possible.

#### Spellcheck Code

```bash
npx obsidian-dev-utils spellcheck
```

Checks your code for spelling errors.

#### Version Management

```bash
npx obsidian-dev-utils version <versionUpdateType>
```

Runs build checks before updating the version and releases if all checks pass. The `<versionUpdateType>` can be `major`, `minor`, `patch`, `beta`, or a specific version like `x.y.z[-suffix]`.

#### Simplified Usage

To simplify the usage of these commands, you can add them to your `package.json`:

```json
{
  "scripts": {
    "build": "obsidian-dev-utils build",
    "dev": "obsidian-dev-utils dev",
    "lint": "obsidian-dev-utils lint",
    "lint-fix": "obsidian-dev-utils lint-fix",
    "spellcheck": "obsidian-dev-utils spellcheck",
    "version": "obsidian-dev-utils version"
  },
  ...
}
```

This setup allows you to run the commands using `npm run`, like `npm run build`.

### Helper Functions

`Obsidian Dev Utils` also provides a range of general-purpose and Obsidian-specific helper functions.

You can use these functions as follows:

```typescript
// Import the entire module and use it with the module prefix
import { Async } from "obsidian-dev-utils";
await Async.timeout(1000);

// Import an individual function, and use it without the module prefix
import { timeout } from "obsidian-dev-utils/Async";
await timeout(1000);

// Import the entire module and use it with the module prefix, from a subfolder
import { MetadataCache } from "obsidian-dev-utils/obsidian";
await MetadataCache.getCacheSafe(app, file);

// Import the entire module and use it without the module prefix, from a subfolder
import { getCacheSafe } from "obsidian-dev-utils/obsidian/MetadataCache";
await getCacheSafe(app, file);
```

## License

© [Michael Naumov](https://github.com/mnaoumov/)
