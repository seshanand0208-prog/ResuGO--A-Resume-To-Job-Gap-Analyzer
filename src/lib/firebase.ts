import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
];

const googleProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never localStorage/sessionStorage)
let cachedGoogleAccessToken: string | null = null;
const workspaceListeners = new Set<(connected: boolean) => void>();

function notifyWorkspaceListeners() {
  const connected = Boolean(cachedGoogleAccessToken);
  for (const listener of workspaceListeners) {
    listener(connected);
  }
}

export function setGoogleAccessToken(token: string | null) {
  cachedGoogleAccessToken = token;
  notifyWorkspaceListeners();
}

export function clearGoogleAccessToken() {
  cachedGoogleAccessToken = null;
  notifyWorkspaceListeners();
}

export function getGoogleAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function subscribeGoogleWorkspaceStatus(
  listener: (connected: boolean) => void
): () => void {
  workspaceListeners.add(listener);
  listener(Boolean(cachedGoogleAccessToken));
  return () => {
    workspaceListeners.delete(listener);
  };
}

export function formatFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${window.location.hostname}) is not yet added to Firebase Authorized Domains. Add it in Firebase Console → Authentication → Settings → Authorized domains, or continue in Guest Mode.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is disabled in Firebase Console. Enable Email/Password and Google in Firebase Console → Authentication → Sign-in method.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please check your credentials or reset your password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error contacting Firebase Auth. Please check your connection and try again.';
  }
  return err?.message || 'Authentication failed. Please try again.';
}

export function subscribeAuthState(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }
      return result.user;
    }
  } catch {
    // ignore redirect check errors
  }
  return null;
}

export async function signInWithGoogle(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setGoogleAccessToken(credential.accessToken);
    }
    return { user: result.user, accessToken: cachedGoogleAccessToken };
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked') {
      const inIframe = window.self !== window.top;
      if (inIframe) {
        throw new Error(
          'Google Sign-In popup was blocked by your browser. Allow popups or sign in with Email & Password below.'
        );
      }
      await signInWithRedirect(auth, googleProvider);
      throw new Error('Redirecting to Google Sign-In...');
    }
    throw err;
  }
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await result.user.getIdToken(true);
  return result.user;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string
) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (name.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
    await result.user.reload();
  }
  await result.user.getIdToken(true);
  try {
    await sendEmailVerification(result.user);
  } catch {
    // Non-blocking if email verification fails to dispatch
  }
  return result.user;
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function resendVerificationEmail() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

const LOCAL_SESSION_KEY = 'resugo_session_token';

export function setLocalSessionToken(token: string) {
  try {
    window.localStorage.setItem(LOCAL_SESSION_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function getLocalSessionToken(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearLocalSessionToken() {
  try {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function logoutUser() {
  clearGoogleAccessToken();
  clearLocalSessionToken();
  await signOut(auth);
}

export async function getFirebaseIdToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export function getOrCreateGuestSessionId(): string {
  const key = 'resugo_guest_session_id';
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = `guest_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

export function getOrCreateDeviceId(): string {
  const key = 'resugo_device_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, cb: () => void) => void;
    };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
      picker?: {
        PickerBuilder: new () => {
          addView: (view: unknown) => any;
          setOAuthToken: (token: string) => any;
          setCallback: (cb: (data: any) => void) => any;
          setOrigin: (origin: string) => any;
          build: () => { setVisible: (visible: boolean) => void };
        };
        ViewId: {
          DOCS: unknown;
        };
        Action: {
          PICKED: string;
          CANCEL?: string;
        };
      };
    };
  }
}

let gsiLoadPromise: Promise<void> | null = null;

function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => {
            gsiLoadPromise = null;
            reject(new Error('Failed to load Google Identity Services.'));
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null;
      reject(new Error('Failed to load Google Identity Services.'));
    };
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

// Preload GIS script immediately so click-triggered Workspace popups aren't delayed or blocked
if (typeof window !== 'undefined') {
  loadGoogleGsiScript().catch(() => {});
}

export async function connectGoogleWorkspace(forceConsent = false): Promise<string> {
  const clientId = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId;

  if (clientId) {
    await loadGoogleGsiScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (oauth2) {
      return await new Promise<string>((resolve, reject) => {
        let settled = false;
        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: WORKSPACE_SCOPES.join(' '),
          callback: (resp) => {
            if (settled) return;
            settled = true;
            if (resp.error || !resp.access_token) {
              reject(
                new Error(
                  resp.error_description ||
                    resp.error ||
                    'Google Workspace authorization was not completed.'
                )
              );
              return;
            }
            setGoogleAccessToken(resp.access_token);
            resolve(resp.access_token);
          },
          error_callback: (err) => {
            if (settled) return;
            settled = true;
            if (err?.type === 'popup_closed') {
              reject(new Error('Google authorization popup was closed before completing.'));
              return;
            }
            if (err?.type === 'popup_failed_to_open') {
              reject(
                new Error(
                  'Google authorization popup was blocked. Please allow popups for this site and retry.'
                )
              );
              return;
            }
            reject(new Error(err?.message || 'Google Workspace authorization failed.'));
          },
        });
        client.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
      });
    }
  }

  // Fallback to Firebase Google popup if GIS client is unavailable
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Could not obtain Google Workspace access token.');
  }
  setGoogleAccessToken(credential.accessToken);
  return credential.accessToken;
}

export async function ensureGoogleAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedGoogleAccessToken) {
    return cachedGoogleAccessToken;
  }
  return connectGoogleWorkspace(forceRefresh);
}

function loadGooglePickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }

    const loadPickerLib = () => {
      if (!window.gapi) {
        reject(new Error('Google API script did not initialize.'));
        return;
      }
      window.gapi.load('picker', () => resolve());
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]'
    );
    if (existing) {
      if (window.gapi) {
        loadPickerLib();
      } else {
        existing.addEventListener('load', loadPickerLib);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = loadPickerLib;
    script.onerror = () => reject(new Error('Failed to load Google Picker script.'));
    document.body.appendChild(script);
  });
}

export async function openGoogleDrivePicker(
  accessToken: string,
  onPicked: (file: { id: string; name: string; mimeType: string }) => void,
  onCancel?: () => void
): Promise<void> {
  await loadGooglePickerApi();
  if (!window.google?.picker) {
    throw new Error('Google Picker library unavailable.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  const picker = new window.google.picker.PickerBuilder()
    .addView(window.google.picker.ViewId.DOCS)
    .setOAuthToken(accessToken)
    .setOrigin(pickerOrigin)
    .setCallback((data: any) => {
      if (data.action === window.google?.picker?.Action.PICKED && data.docs?.[0]) {
        const doc = data.docs[0];
        onPicked({
          id: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
        });
      } else if (data.action === 'cancel') {
        onCancel?.();
      }
    })
    .build();

  picker.setVisible(true);
}
