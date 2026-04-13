"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldValue = exports.db = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)(); // ADC — works automatically on Cloud Run
}
exports.db = (0, firestore_1.getFirestore)();
