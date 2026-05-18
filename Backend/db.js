// backend/db.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT_PATH is not set in environment variables');
  console.warn('   Will use in-memory storage (data lost on restart)');
}

let firestore;
let isConnected = false;

const loadServiceAccount = () => {
  if (!serviceAccountPath) return null;
  const resolvedPath = path.resolve(serviceAccountPath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw);
};

const normalizeFirestoreDoc = (doc) => {
  if (!doc) return doc;
  const out = { ...doc };
  const dateKeys = ['createdAt', 'updatedAt', 'startedAt', 'endedAt', 'lastLoginAt'];
  dateKeys.forEach((key) => {
    const value = out[key];
    if (value && typeof value.toDate === 'function') {
      out[key] = value.toDate();
    }
  });
  return out;
};

const makeCollection = (name) => {
  const col = firestore.collection(name);

  return {
    async insertOne(doc) {
      if (name === 'rooms' && doc?.roomId) {
        const ref = col.doc(doc.roomId);
        await ref.set({ ...doc, roomId: doc.roomId }, { merge: true });
        return { insertedId: ref.id };
      }
      if (name === 'users' && doc?.googleSub) {
        const ref = col.doc(doc.googleSub);
        await ref.set({ ...doc, googleSub: doc.googleSub }, { merge: true });
        return { insertedId: ref.id };
      }
      const ref = await col.add(doc);
      return { insertedId: ref.id };
    },

    async findOne(filter) {
      if (name === 'rooms' && filter?.roomId) {
        const ref = col.doc(filter.roomId);
        const snap = await ref.get();
        if (!snap.exists) return null;
        return normalizeFirestoreDoc({ ...snap.data(), roomId: snap.id });
      }

      if (name === 'users' && filter?.googleSub) {
        const ref = col.doc(filter.googleSub);
        const snap = await ref.get();
        if (!snap.exists) return null;
        return normalizeFirestoreDoc({ ...snap.data(), googleSub: snap.id });
      }

      return null;
    },

    async updateOne(filter, update, options = {}) {
      const data = update?.$set || {};
      const setOnInsert = update?.$setOnInsert || {};

      if (name === 'users' && filter?.googleSub) {
        const ref = col.doc(filter.googleSub);
        const snap = await ref.get();
        if (!snap.exists && options.upsert) {
          await ref.set({ googleSub: filter.googleSub, ...setOnInsert, ...data }, { merge: true });
          return { upsertedId: ref.id, matchedCount: 0, modifiedCount: 1 };
        }
        await ref.set({ ...data }, { merge: true });
        return { matchedCount: snap.exists ? 1 : 0, modifiedCount: 1 };
      }

      if (name === 'rooms' && filter?.roomId) {
        const ref = col.doc(filter.roomId);
        if (options.upsert) {
          await ref.set({ roomId: filter.roomId, ...setOnInsert, ...data }, { merge: true });
          return { upsertedId: ref.id, matchedCount: 1, modifiedCount: 1 };
        }
        await ref.set({ ...data }, { merge: true });
        return { matchedCount: 1, modifiedCount: 1 };
      }

      return { matchedCount: 0, modifiedCount: 0 };
    },

    async deleteOne(filter) {
      if (name === 'rooms' && filter?.roomId) {
        await col.doc(filter.roomId).delete();
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },

    find(filter) {
      let query = col;
      if (filter?.userId) {
        query = query.where('userId', '==', filter.userId);
      }

      return {
        sort(sortSpec) {
          const [[field, direction]] = Object.entries(sortSpec || {});
          if (field) {
            query = query.orderBy(field, direction === -1 ? 'desc' : 'asc');
          }
          return this;
        },
        async toArray() {
          const snap = await query.get();
          return snap.docs.map((docSnap) => {
            const data = normalizeFirestoreDoc(docSnap.data());
            return { _id: docSnap.id, ...data };
          });
        },
      };
    },
  };
};

export async function connectDB() {
  if (!serviceAccountPath) {
    console.log('💾 Using in-memory storage (no Firebase service account provided)');
    return null;
  }

  try {
    if (!admin.apps.length) {
      const serviceAccount = loadServiceAccount();
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    }

    firestore = admin.firestore();
    isConnected = true;
    console.log('✅ Firestore Connected Successfully');
    return firestore;
  } catch (err) {
    console.error('❌ Firestore Connection Failed:', err.message);
    console.warn('⚠️  Will use in-memory storage instead');
    isConnected = false;
    return null;
  }
}

export function getDB() {
  return firestore;
}

export function getRoomsCollection() {
  if (!isConnected || !firestore) return null;
  return makeCollection('rooms');
}

export function getUsersCollection() {
  if (!isConnected || !firestore) return null;
  return makeCollection('users');
}

export function getTripsCollection() {
  if (!isConnected || !firestore) return null;
  return makeCollection('trips');
}

export function isDBConnected() {
  return isConnected;
}

export async function closeDB() {
  if (isConnected && admin.apps.length) {
    try {
      await admin.app().delete();
      isConnected = false;
      console.log('🔌 Firestore Connection Closed');
    } catch (err) {
      console.error('Error closing Firestore:', err.message);
    }
  }
}
