import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase, ref, get, remove } from "firebase/database";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

const firebaseConfig = {
  apiKey: "AIzaSyAChHFEHEkgwR3qA8lPadHbvAppHyjxdIA",
  authDomain: "internoagencia-18258.firebaseapp.com",
  databaseURL: "https://internoagencia-18258-default-rtdb.firebaseio.com",
  projectId: "internoagencia-18258",
  storageBucket: "internoagencia-18258.firebasestorage.app",
  messagingSenderId: "347809402394",
  appId: "1:347809402394:web:0d1a6a25c759ddc1708ba3",
};

const BONOS_ROOT = "agencias/streamers_federation/registro_bonos_oficial";

async function main() {
  const email = process.env.NEXT_PUBLIC_BONOS_EMAIL || "agencias@tiktok.com";
  const pass = process.env.NEXT_PUBLIC_BONOS_PASSWORD || "";
  if (!pass) {
    console.log(
      "Sin NEXT_PUBLIC_BONOS_PASSWORD: no se pudieron borrar bonos en Firebase."
    );
    console.log("Borra el mes desde Bonos → Vaciar mes, o configura la contraseña.");
    return;
  }

  const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  await signInWithEmailAndPassword(auth, email, pass);

  const mesesRef = ref(db, `${BONOS_ROOT}/meses`);
  const snap = await get(mesesRef);
  if (!snap.exists()) {
    console.log("No hay meses de bonos en Firebase.");
    return;
  }
  await remove(mesesRef);
  console.log("Bonos Firebase borrados (todos los periodos).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
