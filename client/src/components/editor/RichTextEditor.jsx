import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useState, useMemo } from 'react';
import { EditorToolbar } from './EditorToolbar.jsx';
import { canEdit } from '../../constants/roles.js';

export function RichTextEditor({
  content,
  onChange,
  onBlur,
  onCursorChange,
  readOnly,
  remoteCursors = {},
  collaborators = [],
  typingUsers = [],
}) {
  const isIncomingUpdate = useRef(false);
  const containerRef = useRef(null);
  const [renderedCursors, setRenderedCursors] = useState([]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: 'Start writing your document...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
    ],
    content: content || '<p></p>',
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      // Only emit local changes when not applying a remote incoming update
      if (!isIncomingUpdate.current) {
        onChange?.(e.getHTML());
      }
    },
    onSelectionUpdate: ({ editor: e }) => {
      if (!isIncomingUpdate.current) {
        const { from, to } = e.state.selection;
        onCursorChange?.({ from, to });
      }
    },
    onBlur: () => onBlur?.(),
  });

  // Keep editor content in sync with incoming remote updates
  useEffect(() => {
    if (!editor || content === undefined || content === null) return;
    const currentHTML = editor.getHTML();
    if (content !== currentHTML) {
      isIncomingUpdate.current = true;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content, false);

      // Restore cursor position if editor is focused and position is within bounds
      try {
        const maxPos = editor.state.doc.content.size;
        if (editor.isFocused && from <= maxPos) {
          editor.commands.setTextSelection({
            from: Math.min(from, maxPos),
            to: Math.min(to, maxPos),
          });
        }
      } catch {}

      // Reset incoming flag in microtask so local typing right after is captured
      Promise.resolve().then(() => {
        isIncomingUpdate.current = false;
      });
    }
  }, [content, editor]);

  // Recalculate remote cursor positions
  useEffect(() => {
    if (!editor || !editor.view || !containerRef.current) return;
    const list = [];
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    Object.values(remoteCursors || {}).forEach((rc) => {
      if (!rc?.cursor?.from) return;
      try {
        const maxPos = editor.state.doc.content.size;
        const pos = Math.min(Math.max(1, rc.cursor.from), maxPos);
        const coords = editor.view.coordsAtPos(pos);
        if (coords) {
          list.push({
            userId: rc.userId,
            displayName: rc.displayName || 'Collaborator',
            color: rc.color || '#3b82f6',
            top: coords.top - containerRect.top + container.scrollTop,
            left: coords.left - containerRect.left + container.scrollLeft,
            height: coords.bottom - coords.top || 20,
          });
        }
      } catch {
        // Fallback gracefully if coordinates fail to calculate
      }
    });

    setRenderedCursors(list);
  }, [remoteCursors, editor, content]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Names of other users actively typing
  const typingNames = useMemo(() => {
    if (!typingUsers || typingUsers.length === 0) return [];
    return typingUsers
      .map((uid) => {
        const found = collaborators.find((c) => c.userId === uid);
        return found?.displayName || 'Someone';
      })
      .filter(Boolean);
  }, [typingUsers, collaborators]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white dark:bg-slate-900/50 shadow-soft relative">
      <EditorToolbar editor={editor} readOnly={readOnly} />

      <div
        ref={containerRef}
        className="editor-content relative flex-1 overflow-y-auto px-8 py-6"
      >
        {/* Render live remote collaborator cursors */}
        {renderedCursors.map((c) => (
          <div
            key={c.userId}
            className="pointer-events-none absolute z-20 transition-all duration-100 ease-out"
            style={{
              top: `${c.top}px`,
              left: `${c.left}px`,
              height: `${c.height}px`,
            }}
          >
            <div
              className="w-[2px] h-full rounded shadow-sm animate-pulse-soft"
              style={{ backgroundColor: c.color }}
            />
            <div
              className="absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-md select-none"
              style={{ backgroundColor: c.color }}
            >
              {c.displayName}
            </div>
          </div>
        ))}

        <EditorContent editor={editor} className="prose-editor min-h-[60vh] max-w-3xl mx-auto" />

        {/* Floating typing indicator pill */}
        {typingNames.length > 0 && (
          <div className="sticky bottom-3 left-0 right-0 mx-auto max-w-sm pointer-events-none z-30">
            <div className="flex items-center justify-center gap-2 rounded-full bg-surface-elevated/95 backdrop-blur px-4 py-1.5 border border-[var(--border)] shadow-md text-xs text-[var(--text-secondary)]">
              <span className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-bounce [animation-delay:0.3s]" />
              </span>
              <span>
                <strong className="text-[var(--text-primary)]">{typingNames.join(', ')}</strong>{' '}
                {typingNames.length === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function useEditorReadOnly(role) {
  return !canEdit(role);
}

export default RichTextEditor;
