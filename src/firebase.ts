import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup as firebaseSignInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const isDummy = !firebaseConfig.apiKey || 
                firebaseConfig.apiKey === 'remixed-api-key' || 
                firebaseConfig.apiKey.includes('YOUR_') || 
                firebaseConfig.apiKey.includes('remixed');

let app: any;
let dbInstance: any;
let authInstance: any;

if (!isDummy) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    authInstance = getAuth(app);
  } catch (error) {
    console.warn("Could not initialize Firebase services, fallback to safe mock:", error);
  }
}

export const db = dbInstance || {};

// Mock Auth wrapper if needed
export const auth = authInstance || {
  currentUser: null,
};

export const googleProvider = !isDummy ? new GoogleAuthProvider() : {};

// Keep track of auth state callbacks for simulated login/logout transitions
const authAuthStateCallbacks = {
  current: [] as Array<(user: any) => void>
};

// Wrap signInWithPopup
export async function signInWithPopup(authObj: any, providerObj: any): Promise<any> {
  if (isDummy || !authInstance) {
    console.log("Simulating Google Auth popup in offline/dummy mode...");
    
    // Set auth.currentUser to a mock user with a stable persistent ID
    const mockUser = {
      uid: 'google_mock_convidado_vought',
      displayName: 'Super-Herói Convidado ⚡',
      email: 'convidado@vought.com',
      photoURL: '',
      isAnonymous: false,
    };
    
    auth.currentUser = mockUser as any;
    
    // Trigger onAuthStateChanged callbacks
    if (authAuthStateCallbacks.current) {
      authAuthStateCallbacks.current.forEach(callback => callback(mockUser));
    }
    
    return { user: mockUser };
  }
  return firebaseSignInWithPopup(authObj, providerObj);
}

// Custom simulated login helper for sandbox environments
export function simulateAuthLogin(displayName: string, email: string): any {
  // Use a stable, deterministic ID based on the email address so the score system maps correctly
  const stableId = 'google_mock_' + email.replace(/[^a-zA-Z0-9]/g, '_');
  const mockUser = {
    uid: stableId,
    displayName,
    email,
    photoURL: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(displayName)}`,
    isAnonymous: false,
  };
  auth.currentUser = mockUser as any;
  if (authAuthStateCallbacks.current) {
    authAuthStateCallbacks.current.forEach(callback => callback(mockUser));
  }
  return { user: mockUser };
}

// Wrap signOut
export async function signOut(authObj: any): Promise<void> {
  if (isDummy || !authInstance) {
    console.log("Signing out from simulated offline user...");
    auth.currentUser = null;
    if (authAuthStateCallbacks.current) {
      authAuthStateCallbacks.current.forEach(callback => callback(null));
    }
    return;
  }
  return firebaseSignOut(authObj);
}

// Wrap onAuthStateChanged
export function onAuthStateChanged(authObj: any, next: (user: any) => void): () => void {
  if (isDummy || !authInstance) {
    authAuthStateCallbacks.current.push(next);
    // Trigger initial auth state check
    setTimeout(() => {
      next(auth.currentUser);
    }, 100);
    
    // Return unsubscribe function
    return () => {
      authAuthStateCallbacks.current = authAuthStateCallbacks.current.filter(cb => cb !== next);
    };
  }
  return firebaseOnAuthStateChanged(authObj, next);
}

// Error code enum according to Firebase skill requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
