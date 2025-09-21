/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CALDAV_SERVER_URL: string
  readonly VITE_CALDAV_USERNAME: string
  readonly VITE_CALDAV_PASSWORD: string
  readonly VITE_CALDAV_CALENDAR_FILTER: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
