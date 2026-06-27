import * as monaco from 'monaco-editor';
// eslint-disable-next-line import/default -- Vite's ?worker suffix exports a Worker constructor as the default
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

/**
 * Self-host Monaco instead of @monaco-editor/react's default CDN loader — Dex is
 * designed to run offline/restricted (see apps/agent model.ts, which avoids the
 * models.dev gateway for the same reason). YAML only needs the base editor worker
 * (tokenization/highlighting); no language-service worker is required.
 *
 * Importing this module once (from ModelYamlEditor) wires the worker + points the
 * loader at the bundled monaco.
 */
(self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
