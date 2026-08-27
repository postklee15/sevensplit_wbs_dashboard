import type { User } from "firebase/auth";
import { TEST_LOGIN_EMAIL, TEST_LOGIN_UID } from "./acl";

export const TEST_TOKEN_STORAGE_KEY = "wbs_test_token";

export function makeTestUser(token: string): User {
  return {
    uid: TEST_LOGIN_UID,
    email: TEST_LOGIN_EMAIL,
    displayName: "WBS 테스트",
    emailVerified: true,
    isAnonymous: false,
    metadata: { creationTime: "", lastSignInTime: "" },
    providerData: [],
    refreshToken: "",
    tenantId: null,
    phoneNumber: null,
    photoURL: null,
    providerId: "custom",
    delete: async () => undefined,
    getIdToken: async () => token,
    getIdTokenResult: async () => ({
      token,
      authTime: "",
      issuedAtTime: "",
      expirationTime: "",
      signInProvider: "custom",
      signInSecondFactor: null,
      claims: {},
    }),
    reload: async () => undefined,
    toJSON: () => ({ uid: TEST_LOGIN_UID, email: TEST_LOGIN_EMAIL }),
  } as User;
}

export function clearTestToken() {
  try {
    sessionStorage.removeItem(TEST_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readTestToken(): string {
  try {
    return sessionStorage.getItem(TEST_TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeTestToken(token: string) {
  try {
    sessionStorage.setItem(TEST_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}
