import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, History, Eye, Share2, Globe } from 'lucide-react';
import { useEditor } from '../../hooks/useEditor.js';
import { RichTextEditor } from '../../components/editor/RichTextEditor.jsx';
import { CollaboratorsPanel } from '../../components/editor/CollaboratorsPanel.jsx';
import { VersionHistoryPanel } from '../../components/editor/VersionHistoryPanel.jsx';
import { ShareModal } from '../../components/editor/ShareModal.jsx';
import { SaveStatus } from '../../components/editor/SaveStatus.jsx';
import { LoadingScreen } from '../../components/common/LoadingScreen.jsx';
import { ThemeToggle } from '../../components/layout/ThemeToggle.jsx';
import { ROLE_LABELS } from '../../constants/roles.js';
import { canEdit } from '../../constants/roles.js';
import { cn } from '../../utils/cn.js';

export default function EditorPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const {
    document,
    collaborators,
    typingUsers,
    remoteCursors,
    saveStatus,
    loading,
    error,
    versions,
    updateContent,
    updateCursor,
    handleBlur,
    loadVersions,
    restoreVersion,
    setDocument,
  } = useEditor(documentId);

  useEffect(() => {
    if (showHistory) loadVersions();
  }, [showHistory, loadVersions]);

  if (loading) return <LoadingScreen message="Opening document..." />;
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
        <p className="text-red-600 font-medium">{error}</p>
        <Link to="/dashboard" className="text-brand-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const readOnly = !canEdit(document?.role);
  const isPublic = document?.publicAccess && document?.publicAccess !== 'restricted';

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-surface-elevated px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-surface-muted"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
                {document?.title}
              </h1>
              {isPublic && (
                <span
                  title="Anyone with the link can access"
                  className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full"
                >
                  <Globe className="h-3 w-3" />
                  Public
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <SaveStatus status={saveStatus} />
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                  readOnly
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}
              >
                {readOnly ? (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Viewer
                  </span>
                ) : (
                  ROLE_LABELS[document?.role] || 'Editor'
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              showHistory
                ? 'bg-brand-500/10 text-brand-700'
                : 'text-[var(--text-secondary)] hover:bg-surface-muted',
            )}
          >
            <History className="h-4 w-4" />
            History
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {readOnly && (
            <div className="mb-3 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
              You have view-only access. Editing is disabled.
            </div>
          )}
          <RichTextEditor
            content={document?.content}
            onChange={updateContent}
            onBlur={handleBlur}
            onCursorChange={updateCursor}
            readOnly={readOnly}
            remoteCursors={remoteCursors}
            collaborators={collaborators}
            typingUsers={typingUsers}
          />
        </div>

        {showHistory ? (
          <VersionHistoryPanel
            versions={versions}
            role={document?.role}
            onRestore={async (id) => {
              await restoreVersion(id);
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
          />
        ) : (
          <CollaboratorsPanel
            collaborators={collaborators}
            typingUsers={typingUsers}
            remoteCursors={remoteCursors}
            onOpenShare={() => setShowShare(true)}
          />
        )}
      </div>

      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        document={document}
        onDocumentUpdate={setDocument}
      />
    </div>
  );
}
