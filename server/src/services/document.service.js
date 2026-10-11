import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../utils/ApiError.js';
import { ROLES, canPerform } from '../constants/roles.js';
import { createDocumentPayload, createVersionSnapshot } from '../models/document.model.js';
import {
  getDocumentsCollection,
  getDocumentRef,
  getFirestoreDb,
  getVersionsCollection,
  getUsersCollection,
} from './firestore.placeholder.js';
import { getAuth } from '../config/firebase.js';

function prepareDocumentResponse(doc, userId, userEmail = null) {
  const role = documentService.resolveRole(doc, userId, userEmail);
  return {
    ...doc,
    role: role || ROLES.VIEWER,
  };
}

async function fetchDocumentSnapshot(docId) {
  const docRef = getDocumentRef(docId);
  return docRef.get();
}

export const documentService = {
  resolveRole(doc, userId, userEmail = null) {
    if (doc.ownerId === userId) return ROLES.OWNER;
    const cleanEmail = userEmail?.toLowerCase();
    const collab = doc.collaborators?.find(
      (c) =>
        (userId && c.userId === userId) ||
        (cleanEmail && c.email?.toLowerCase() === cleanEmail),
    );
    if (collab?.role) return collab.role;
    if (doc.publicAccess === 'editor') return ROLES.EDITOR;
    if (doc.publicAccess === 'viewer') return ROLES.VIEWER;
    return null;
  },

  async listByUser(userId, { search = '', limit = 50 } = {}) {
    const query = search.toLowerCase().trim();
    const documentsById = new Map();
    const docsCollection = getDocumentsCollection();

    const [ownerSnapshot, memberSnapshot] = await Promise.all([
      docsCollection.where('ownerId', '==', userId).get(),
      docsCollection.where('memberIds', 'array-contains', userId).get(),
    ]);

    ownerSnapshot.forEach((docSnap) => {
      documentsById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    memberSnapshot.forEach((docSnap) => {
      documentsById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });

    return Array.from(documentsById.values())
      .filter((doc) => !query || doc.title.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit)
      .map((doc) => prepareDocumentResponse(doc, userId));
  },

  async getById(docId, userId, userEmail = null) {
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };
    let role = this.resolveRole(doc, userId, userEmail);

    // If invited by email but user's UID was not linked yet, link it now
    if (userEmail) {
      const cleanEmail = userEmail.toLowerCase();
      const emailCollab = doc.collaborators?.find((c) => c.email?.toLowerCase() === cleanEmail);
      if (emailCollab && emailCollab.userId !== userId) {
        emailCollab.userId = userId;
        const memberIds = Array.from(new Set([...(doc.memberIds || []), userId]));
        await getDocumentRef(docId).update({
          collaborators: doc.collaborators,
          memberIds,
        });
        role = emailCollab.role;
      }
    }

    if (!role) throw ApiError.forbidden('You do not have access to this document');
    return { ...doc, role };
  },

  async create(userId, { title } = {}) {
    const id = uuidv4();
    const doc = createDocumentPayload({
      id,
      title: title || 'Untitled Document',
      ownerId: userId,
      role: ROLES.OWNER,
      publicAccess: 'restricted',
    });

    const docRef = getDocumentRef(id);
    await docRef.set(doc);

    const version = createVersionSnapshot(doc, userId);
    await getVersionsCollection(id).doc(version.id).set(version);

    return { ...doc, role: ROLES.OWNER, storage: 'firestore' };
  },

  async update(docId, userId, updates) {
    const now = new Date().toISOString();
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };
    const role = this.resolveRole(doc, userId);
    if (!canPerform(role, 'write')) throw ApiError.forbidden('Viewer cannot edit this document');

    const changes = {};
    if (updates.title !== undefined) {
      if (!canPerform(role, 'rename')) {
        throw ApiError.forbidden('Only the owner can rename this document');
      }
      changes.title = updates.title;
    }

    let versionSnapshot = null;
    if (updates.content !== undefined) {
      changes.content = updates.content;
      changes.version = (doc.version || 0) + 1;
      versionSnapshot = createVersionSnapshot({ ...doc, ...changes }, userId);
    }

    changes.updatedAt = now;
    changes.lastEditedBy = userId;

    await getDocumentRef(docId).update(changes);
    if (versionSnapshot) {
      await getVersionsCollection(docId).doc(versionSnapshot.id).set(versionSnapshot);
    }

    return { ...doc, ...changes, role };
  },

  async rename(docId, userId, title) {
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };
    const role = this.resolveRole(doc, userId);
    if (!canPerform(role, 'rename')) {
      throw ApiError.forbidden('Only the owner can rename this document');
    }
    return this.update(docId, userId, { title });
  },

  async delete(docId, userId) {
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };
    const role = this.resolveRole(doc, userId);
    if (!canPerform(role, 'delete')) throw ApiError.forbidden('Only the owner can delete this document');

    const db = getFirestoreDb();
    const batch = db.batch();
    const versionSnapshot = await getVersionsCollection(docId).get();
    versionSnapshot.forEach((versionDoc) => batch.delete(versionDoc.ref));
    batch.delete(getDocumentRef(docId));
    await batch.commit();

    return { id: docId, deleted: true };
  },

  async getVersions(docId, userId) {
    await this.getById(docId, userId);
    const snapshot = await getVersionsCollection(docId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  },

  async restoreVersion(docId, userId, versionId) {
    const doc = await this.getById(docId, userId);
    if (!canPerform(doc.role, 'write')) throw ApiError.forbidden('Cannot restore version as viewer');

    const versionSnapshot = await getVersionsCollection(docId).doc(versionId).get();
    if (!versionSnapshot.exists) throw ApiError.notFound('Version not found');
    const version = { id: versionSnapshot.id, ...versionSnapshot.data() };

    return this.update(docId, userId, {
      content: version.content,
      title: version.title,
    });
  },

  async getRaw(docId) {
    const snapshot = await fetchDocumentSnapshot(docId);
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async applyContent(docId, userId, content) {
    const now = new Date().toISOString();
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) return null;
    const doc = { id: snapshot.id, ...snapshot.data() };
    const role = this.resolveRole(doc, userId);
    if (!canPerform(role, 'write')) return null;

    const updates = {
      content,
      updatedAt: now,
      lastEditedBy: userId,
    };
    await getDocumentRef(docId).update(updates);
    return { ...doc, ...updates };
  },

  async addCollaborator(docId, userId, { email, role = ROLES.EDITOR }) {
    if (!['editor', 'viewer'].includes(role)) {
      throw ApiError.badRequest('Invalid role. Must be editor or viewer');
    }
    if (!email || typeof email !== 'string') {
      throw ApiError.badRequest('Email is required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };

    const currentRole = this.resolveRole(doc, userId);
    if (currentRole !== ROLES.OWNER) {
      throw ApiError.forbidden('Only the document owner can manage collaborators');
    }

    let collaboratorUserId = null;
    let collaboratorName = cleanEmail.split('@')[0];
    let photoURL = null;

    // Search existing user in Firestore
    try {
      const userSnap = await getUsersCollection().where('email', '==', cleanEmail).limit(1).get();
      if (!userSnap.empty) {
        const u = userSnap.docs[0].data();
        collaboratorUserId = u.uid;
        collaboratorName = u.displayName || collaboratorName;
        photoURL = u.photoURL || null;
      } else {
        const auth = getAuth();
        if (auth) {
          const authUser = await auth.getUserByEmail(cleanEmail);
          collaboratorUserId = authUser.uid;
          collaboratorName = authUser.displayName || collaboratorName;
          photoURL = authUser.photoURL || null;
        }
      }
    } catch {
      // User might not have signed up yet; invitation will link when they sign in
    }

    if (collaboratorUserId && collaboratorUserId === doc.ownerId) {
      throw ApiError.badRequest('Owner is already a collaborator on this document');
    }

    const collaborators = doc.collaborators || [];
    const existingIndex = collaborators.findIndex(
      (c) =>
        (collaboratorUserId && c.userId === collaboratorUserId) ||
        c.email?.toLowerCase() === cleanEmail,
    );

    const newCollaborator = {
      userId: collaboratorUserId,
      email: cleanEmail,
      displayName: collaboratorName,
      photoURL,
      role,
      addedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      collaborators[existingIndex] = {
        ...collaborators[existingIndex],
        ...newCollaborator,
      };
    } else {
      collaborators.push(newCollaborator);
    }

    const memberIds = Array.from(
      new Set([doc.ownerId, ...collaborators.map((c) => c.userId).filter(Boolean)]),
    );

    const now = new Date().toISOString();
    await getDocumentRef(docId).update({
      collaborators,
      memberIds,
      updatedAt: now,
    });

    return {
      ...doc,
      collaborators,
      memberIds,
      updatedAt: now,
      role: currentRole,
    };
  },

  async removeCollaborator(docId, userId, targetIdentifier) {
    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };

    const currentRole = this.resolveRole(doc, userId);
    if (currentRole !== ROLES.OWNER) {
      throw ApiError.forbidden('Only the document owner can remove collaborators');
    }

    const target = targetIdentifier.trim().toLowerCase();
    const collaborators = (doc.collaborators || []).filter(
      (c) => c.userId !== targetIdentifier && c.email?.toLowerCase() !== target,
    );

    const memberIds = Array.from(
      new Set([doc.ownerId, ...collaborators.map((c) => c.userId).filter(Boolean)]),
    );

    const now = new Date().toISOString();
    await getDocumentRef(docId).update({
      collaborators,
      memberIds,
      updatedAt: now,
    });

    return {
      ...doc,
      collaborators,
      memberIds,
      updatedAt: now,
      role: currentRole,
    };
  },

  async updateAccess(docId, userId, publicAccess) {
    if (!['restricted', 'viewer', 'editor'].includes(publicAccess)) {
      throw ApiError.badRequest('Invalid publicAccess setting');
    }

    const snapshot = await fetchDocumentSnapshot(docId);
    if (!snapshot.exists) throw ApiError.notFound('Document not found');
    const doc = { id: snapshot.id, ...snapshot.data() };

    const currentRole = this.resolveRole(doc, userId);
    if (currentRole !== ROLES.OWNER) {
      throw ApiError.forbidden('Only the document owner can change access settings');
    }

    const now = new Date().toISOString();
    await getDocumentRef(docId).update({
      publicAccess,
      updatedAt: now,
    });

    return {
      ...doc,
      publicAccess,
      updatedAt: now,
      role: currentRole,
    };
  },
};

export default documentService;
