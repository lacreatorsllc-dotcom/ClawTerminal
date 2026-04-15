"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SECRETS_DOC_ID = exports.AGENT_PRIVATE_COLLECTION = void 0;
exports.fetchAgentSecrets = fetchAgentSecrets;
exports.mergeSecretsIntoAgentData = mergeSecretsIntoAgentData;
exports.getAgentDataWithSecrets = getAgentDataWithSecrets;
const firebase_1 = require("./firebase");
exports.AGENT_PRIVATE_COLLECTION = 'private';
exports.AGENT_SECRETS_DOC_ID = 'secrets';
/** Fields that must never live on the public agent document (client-readable). */
const SECRET_FIELDS = ['gemini_api_key', 'tb_api_key', 'openai_api_key', 'cabal_chat_id'];
async function fetchAgentSecrets(agentId) {
    const snap = await firebase_1.db
        .collection('agents')
        .doc(agentId)
        .collection(exports.AGENT_PRIVATE_COLLECTION)
        .doc(exports.AGENT_SECRETS_DOC_ID)
        .get();
    return snap.exists ? { ...snap.data() } : {};
}
/** Merge private secrets over public agent data; legacy top-level secrets still supported. */
function mergeSecretsIntoAgentData(publicData, secrets) {
    const out = { ...publicData };
    for (const k of SECRET_FIELDS) {
        const v = secrets[k] ?? publicData[k];
        if (v !== undefined && v !== null && v !== '')
            out[k] = v;
    }
    return out;
}
async function getAgentDataWithSecrets(snapshot) {
    const publicData = snapshot.data();
    if (!publicData)
        return {};
    const secrets = await fetchAgentSecrets(snapshot.id);
    return mergeSecretsIntoAgentData(publicData, secrets);
}
