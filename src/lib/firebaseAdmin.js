import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, './fbk.json');
let initialized = false;

try {
  const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
  const serviceAccount = JSON.parse(raw);

  const hasRequiredFields =
    serviceAccount &&
    serviceAccount.type === 'service_account' &&
    serviceAccount.project_id &&
    serviceAccount.private_key &&
    serviceAccount.client_email;

  if (!hasRequiredFields) {
    throw new Error('Invalid Firebase service account JSON structure');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  initialized = true;
} catch (error) {
  // Не падаем всем приложением: backend может работать без отправки push.
  console.error('[FIREBASE] Firebase Admin init failed:', error.message);
}

export const isFirebaseReady = () => initialized && admin.apps.length > 0;

export default admin;