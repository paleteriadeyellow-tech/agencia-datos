import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAChHFEHEkgwR3qA8lPadHbvAppHyjxdIA",
  authDomain: "internoagencia-18258.firebaseapp.com",
  databaseURL: "https://internoagencia-18258-default-rtdb.firebaseio.com",
  projectId: "internoagencia-18258",
  storageBucket: "internoagencia-18258.firebasestorage.app",
  messagingSenderId: "347809402394",
  appId: "1:347809402394:web:0d1a6a25c759ddc1708ba3",
  measurementId: "G-MGQFDP9ER6",
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const firebaseApp = app;
export const firebaseDb = getDatabase(app);
export const firebaseAuth = getAuth(app);

export const AGENCIA_ROOT = "agencias/streamers_federation";
export const BONOS_ROOT = `${AGENCIA_ROOT}/registro_bonos_oficial`;
/** Envío de KPI (stats por mes) — ruta limpia */
export const KPI_ROOT = `${AGENCIA_ROOT}/kpi_envio`;
/** Ruta antigua a limpiar al iniciar */
export const KPI_LEGACY_ROOT = `${AGENCIA_ROOT}/federation_stats_v1`;
