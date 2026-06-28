import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import '@/lib/monacoSetup';

/** A structured YAML error (from the backend) → an inline Monaco marker. */
export interface YamlMarker {
  message: string;
  line?: number;
  col?: number;
}

/** Imperative handle the studio's tab bar uses to drive the (single) editor. */
export interface YamlEditorHandle {
  foldAll: () => void;
  unfoldAll: () => void;
}

/**
 * The studio's Monaco YAML editor — a single instance whose `value` follows the
 * active file. Server-side parse/validation errors render as inline red markers
 * (line/col). Fold/unfold is exposed imperatively so the tab bar's "Fold
 * definitions" control can drive it.
 */
export const StudioYamlEditor = forwardRef<
  YamlEditorHandle,
  {
    value: string;
    onChange: (v: string) => void;
    markers?: YamlMarker[];
    readOnly?: boolean;
    /** Save the active file's draft (⌘S / Ctrl+S). */
    onSave?: () => void;
  }
>(function StudioYamlEditor({ value, onChange, markers, readOnly, onSave }, ref) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useImperativeHandle(ref, () => ({
    foldAll: () => editorRef.current?.getAction('editor.foldAll')?.run(),
    unfoldAll: () => editorRef.current?.getAction('editor.unfoldAll')?.run(),
  }));

  const applyMarkers = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const m = editor?.getModel();
    if (!editor || !monaco || !m) return;
    monaco.editor.setModelMarkers(
      m,
      'dex',
      (markers ?? []).map((mk) => ({
        severity: monaco.MarkerSeverity.Error,
        message: mk.message,
        startLineNumber: mk.line ?? 1,
        startColumn: mk.col ?? 1,
        endLineNumber: mk.line ?? 1,
        endColumn: (mk.col ?? 1) + 1,
      })),
    );
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
    applyMarkers();
  };

  // Re-apply whenever the marker set changes (e.g. after a failed save).
  useEffect(applyMarkers, [markers]);

  return (
    <MonacoEditor
      language="yaml"
      theme="vs"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        tabSize: 2,
        folding: true,
        wordWrap: 'on',
        automaticLayout: true,
        renderLineHighlight: 'line',
        overviewRulerBorder: false,
        padding: { top: 10, bottom: 24 },
      }}
    />
  );
});
