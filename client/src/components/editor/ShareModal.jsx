import { useState } from 'react';
import {
  Link2,
  Check,
  Globe,
  Lock,
  UserPlus,
  Trash2,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Avatar } from '../common/Avatar.jsx';
import { documentApi } from '../../services/api/documentApi.js';
import { useAuth } from '../../hooks/useAuth.js';

export function ShareModal({ open, onClose, document, onDocumentUpdate }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);

  if (!document) return null;

  const isOwner = document.ownerId === user?.uid || document.role === 'owner';
  const publicAccess = document.publicAccess || 'restricted';

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await documentApi.addCollaborator(document.id, {
        email: email.trim(),
        role,
      });
      if (res.data) {
        onDocumentUpdate?.(res.data);
      }
      setSuccess(`Invited ${email.trim()} as ${role}`);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to add collaborator');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (collaborator) => {
    setError('');
    setSuccess('');
    const targetId = collaborator.userId || collaborator.email;
    try {
      const res = await documentApi.removeCollaborator(document.id, targetId);
      if (res.data) {
        onDocumentUpdate?.(res.data);
      }
      setSuccess(`Removed ${collaborator.displayName || collaborator.email}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to remove collaborator');
    }
  };

  const handleAccessChange = async (newAccess) => {
    setAccessLoading(true);
    setError('');
    try {
      const res = await documentApi.updateAccess(document.id, newAccess);
      if (res.data) {
        onDocumentUpdate?.(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update access');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/editor/${document.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Share document" size="md">
      <div className="space-y-6">
        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Invite by Email */}
        {isOwner && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Invite people
            </label>
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="email"
                placeholder="Enter collaborator email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--border)] bg-surface px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-surface px-3 py-2 text-sm text-[var(--text-primary)] focus:border-brand-500 focus:outline-none"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button type="submit" loading={loading} disabled={!email.trim()}>
                <UserPlus className="h-4 w-4" />
                Invite
              </Button>
            </form>
          </div>
        )}

        {/* Collaborators List */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            People with access
          </label>
          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-surface">
            {/* Owner Row */}
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  name={document.ownerName || 'Owner'}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {document.ownerId === user?.uid ? 'You (Owner)' : 'Document Owner'}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    Original creator
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300">
                <Shield className="h-3 w-3" />
                Owner
              </span>
            </div>

            {/* Collaborators Rows */}
            {document.collaborators && document.collaborators.length > 0 ? (
              document.collaborators.map((c) => (
                <div
                  key={c.userId || c.email}
                  className="flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={c.displayName || c.email}
                      src={c.photoURL}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {c.displayName || c.email}
                        {c.userId === user?.uid && ' (You)'}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {c.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] capitalize">
                      {c.role}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => handleRemove(c)}
                        title="Remove collaborator"
                        className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-[var(--text-muted)]">
                No extra collaborators added yet
              </div>
            )}
          </div>
        </div>

        {/* General Access / Link Sharing */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            General access
          </label>
          <div className="rounded-xl border border-[var(--border)] bg-surface p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-[var(--text-primary)]">
                  {publicAccess === 'restricted' ? (
                    <Lock className="h-4 w-4 text-[var(--text-muted)]" />
                  ) : (
                    <Globe className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {publicAccess === 'restricted'
                      ? 'Restricted'
                      : publicAccess === 'editor'
                      ? 'Anyone with the link can edit'
                      : 'Anyone with the link can view'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {publicAccess === 'restricted'
                      ? 'Only people invited above can open this document'
                      : 'Anyone on the internet with this link can access'}
                  </p>
                </div>
              </div>

              {isOwner && (
                <select
                  value={publicAccess}
                  disabled={accessLoading}
                  onChange={(e) => handleAccessChange(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] focus:border-brand-500 focus:outline-none"
                >
                  <option value="restricted">Restricted</option>
                  <option value="viewer">Anyone (Viewer)</option>
                  <option value="editor">Anyone (Editor)</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Copy Link */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                <span>Copy link</span>
              </>
            )}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ShareModal;
