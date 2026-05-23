import { invoke } from "@tauri-apps/api/core"

const TOKEN_KEY = "helm.access_token"

export const keychain = {
  setToken: (value: string) =>
    invoke<void>("keychain_set", { key: TOKEN_KEY, value }),
  getToken: () => invoke<string | null>("keychain_get", { key: TOKEN_KEY }),
  clearToken: () => invoke<void>("keychain_delete", { key: TOKEN_KEY }),
}
