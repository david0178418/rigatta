# Rigatta

Rigatta is a local, desktop-oriented web editor for building rigid cutout animations from separate image parts. It provides focused rigging and timeline workflows and exports rendered sprite sheets for PixiJS projects.

Rigatta authors animations; it does not provide a skeletal-animation runtime for games. Each clip is sampled into image frames during export.

## Current capabilities

- Import PNG, JPEG, and WebP images individually, by directory, or with drag and drop.
- Build one rigid forward-kinematic rig from bones, slots, and image attachments.
- Add point and rectangle attachments for gameplay metadata.
- Author multiple clips with transform, opacity, attachment, draw-order, enabled-state, and event tracks.
- Edit keys in a dopesheet with stepped, linear, and cubic Bezier interpolation.
- Undo and redo project changes, autosave locally, reopen recent projects, and exchange self-contained `.rigatta` archives.
- Export selected clips together or separately as PixiJS-compatible sprite-sheet ZIP files with companion gameplay metadata.
- Generate grid atlases and, when configured in project data, trimmed packed and multipage atlases.

The supported environment is current desktop Google Chrome with mouse and keyboard input. Rigatta is a local, single-user application with no backend service. The tested desktop viewport range starts at 1120 by 720 pixels.

## Development

Install the locked dependencies and start the development server:

```sh
bun install --frozen-lockfile
bun run dev
```

The editor is then available at `http://localhost:3000`.

Run the primary validation gate with:

```sh
bun run check
```

Run the Chromium browser suite separately with:

```sh
bun run test:e2e
```

## Deployment

Pushes to `master` are validated and deployed to GitHub Pages by the `Deploy to GitHub Pages` workflow. Before the first deployment, set the repository's Pages source to **GitHub Actions** under **Settings → Pages**.

The deployed application is available at `https://david0178418.github.io/rigatta/`. The workflow obtains the site base path from GitHub Pages and passes it to the production build, so repository renames and custom domains do not require a hardcoded asset path.

## Documentation

- [Product specification](PRODUCT.md) describes the implemented feature set, supported environment, limitations, and non-goals.
- [Architecture](ARCHITECTURE.md) describes the application boundaries, state ownership, persistence, rendering, and export pipeline.
- [Contributing](CONTRIBUTING.md) records project conventions and validation expectations.
