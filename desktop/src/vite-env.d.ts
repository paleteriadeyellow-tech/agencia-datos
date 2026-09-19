/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopBridge {
  platform: string;
  isDesktop: boolean;
}

interface Window {
  desktop?: DesktopBridge;
}
