import { Users, Wifi, WifiOff, UserPlus } from 'lucide-react';
import { Avatar } from '../common/Avatar.jsx';
import { ROLE_LABELS } from '../../constants/roles.js';
import { useSocket } from '../../hooks/useSocket.js';

export function CollaboratorsPanel({
  collaborators = [],
  typingUsers = [],
  remoteCursors = {},
  onOpenShare,
}) {
  const { connected } = useSocket();
  const activeCursorList = Object.values(remoteCursors || {});

  return (
    <div className="flex h-full flex-col border-l border-[var(--border)] bg-surface-elevated w-64 shrink-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Active ({collaborators.length})</span>
        </div>
        <span
          className={`flex items-center gap-1 text-xs ${connected ? 'text-emerald-600' : 'text-amber-600'}`}
          title={connected ? 'Connected' : 'Reconnecting...'}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>

      {onOpenShare && (
        <div className="p-3 border-b border-[var(--border)]">
          <button
            onClick={onOpenShare}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-500/20 dark:text-brand-300 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite Collaborators
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {collaborators.length === 0 ? (
          <p className="text-center text-xs text-[var(--text-muted)] py-6">No collaborators yet</p>
        ) : (
          collaborators.map((c) => {
            const isTyping = typingUsers?.includes(c.userId);
            const hasCursor = Boolean(remoteCursors?.[c.userId]);

            return (
              <div
                key={c.socketId || c.userId}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-muted transition-colors"
              >
                <Avatar name={c.displayName} src={c.photoURL} online={c.status === 'online'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {c.displayName}
                    {isTyping && (
                      <span className="ml-1 text-xs text-brand-600 animate-pulse-soft font-normal">typing...</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span>{ROLE_LABELS[c.role] || 'Collaborator'}</span>
                    {hasCursor && (
                      <>
                        <span>•</span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">active</span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/20"
                  style={{ backgroundColor: c.color || '#33a6ff' }}
                  title="Cursor color"
                />
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 font-semibold">
          Live Cursor Tracking
        </p>
        {activeCursorList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-2.5 text-center text-xs text-[var(--text-muted)]">
            {collaborators.length > 1
              ? 'Peers will appear here as they click or select text'
              : 'Share link with another account to see live cursors'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeCursorList.map((rc) => (
              <div
                key={rc.userId}
                className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: rc.color }}
                />
                <span className="font-medium text-[var(--text-primary)] truncate flex-1">
                  {rc.displayName}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  pos {rc.cursor?.from || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollaboratorsPanel;
