"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEED_COL = exports.TRADES_COL = exports.MESSAGES_COL = exports.AGENT_DOC = exports.FieldValue = exports.db = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
if (!(0, app_1.getApps)().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccount) {
        (0, app_1.initializeApp)({ credential: (0, app_1.cert)(JSON.parse(serviceAccount)) });
    }
    else {
        // Cloud Run: use Application Default Credentials (no key needed)
        (0, app_1.initializeApp)({ projectId: 'slugs-run' });
    }
}
exports.db = (0, firestore_1.getFirestore)();
exports.AGENT_DOC = exports.db.doc('agents/slug-001');
exports.MESSAGES_COL = exports.db.collection('agents/slug-001/messages');
exports.TRADES_COL = exports.db.collection('agents/slug-001/trades');
exports.FEED_COL = exports.db.collection('feed_events');
