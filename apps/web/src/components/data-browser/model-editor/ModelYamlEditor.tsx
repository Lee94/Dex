import { useEffect, useRef } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import styles from '../dataBrowser.module.css';
import '@/lib/monacoSetup';

/** A structured YAML error (from the backend) → an inline Monaco marker. */
export interface YamlMarker {
  message: string;
  line?: number;
  col?: number;
}

/**
 * The YAML tab of the model editor (stage B): a self-hosted Monaco editor with
 * cube.js-style YAML highlighting. Server-side parse/validation errors are
 * rendered as inline red markers (line/col) plus a message below.
 */
export function ModelYamlEditor({
  value,
  onChange,
  error,
  markers,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  markers?: YamlMarker[];
  readOnly?: boolean;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  const applyMarkers = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      'dex',
      (markers ?? []).map((m) => ({
        severity: monaco.MarkerSeverity.Error,
        message: m.message,
        startLineNumber: m.line ?? 1,
        startColumn: m.col ?? 1,
        endLineNumber: m.line ?? 1,
        endColumn: (m.col ?? 1) + 1,
      })),
    );
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyMarkers();
  };

  // Re-apply whenever the marker set changes (e.g. after a failed save).
  useEffect(applyMarkers, [markers]);

  return (
    <div>
      <div className={styles.meMonaco}>
        <MonacoEditor
          language="yaml"
          theme="vs"
          value={value}
          onChange={(v) => onChange(v ?? '')}
          onMount={onMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 12.5,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
            automaticLayout: true,
            renderLineHighlight: 'none',
            overviewRulerBorder: false,
          }}
        />
      </div>
      {error ? <div className={styles.meErr}>{error}</div> : null}
    </div>
  );
}
