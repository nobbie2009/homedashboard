/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
    readonly VITE_GIT_COMMIT_HASH: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
