"use strict";
// In-memory cache shared between poller and chat listener
// Avoids Firestore reads in the chat handler for data the poller just fetched
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCached = setCached;
exports.getCached = getCached;
const cache = new Map();
function setCached(firestoreId, snap) {
    cache.set(firestoreId, { ...snap, updatedAt: Date.now() });
}
function getCached(firestoreId) {
    return cache.get(firestoreId) ?? null;
}
