import { createUserPayload } from '../models/user.model.js';
import { getUsersCollection } from './firestore.placeholder.js';

export const userService = {
  async upsertFromAuth(decodedToken) {
    const now = new Date().toISOString();
    const payload = createUserPayload({
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name || decodedToken.displayName,
      photoURL: decodedToken.picture || decodedToken.photoURL,
      createdAt: now,
    });

    const userRef = getUsersCollection().doc(payload.uid);
    const snapshot = await userRef.get();
    const existing = snapshot.exists ? snapshot.data() : null;
    const data = {
      ...existing,
      ...payload,
      createdAt: existing?.createdAt || payload.createdAt,
      updatedAt: now,
    };
    await userRef.set(data, { merge: true });
    return data;
  },

  async getProfile(uid) {
    const snapshot = await getUsersCollection().doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
  },

  async updateProfile(uid, updates) {
    const now = new Date().toISOString();
    const userRef = getUsersCollection().doc(uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) return null;
    const data = {
      ...snapshot.data(),
      ...updates,
      updatedAt: now,
    };
    await userRef.set(data, { merge: true });
    return data;
  },
};

export default userService;
