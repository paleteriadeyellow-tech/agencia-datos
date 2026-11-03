import { getSupabaseAdmin } from "@/lib/supabase";

export const EVIDENCE_BUCKET = "task-evidence";

let bucketReady = false;

type StorageResult =
  | { storage: ReturnType<NonNullable<ReturnType<typeof getSupabaseAdmin>>["storage"]["from"]>; error?: undefined }
  | { storage?: undefined; error: string };

/** Almacenamiento con el bucket privado de evidencias (se crea la primera vez). Si falla, devuelve la causa. */
export async function evidenceStorage(): Promise<StorageResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { error: "faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en la configuración de la app" };
  }
  if (!bucketReady) {
    // Primero se mira si ya existe (no necesita permisos de creación)
    const listed = await supabase.storage.listBuckets();
    if (listed.error) {
      console.error("[evidence] listBuckets:", listed.error.message);
      return { error: `Supabase rechazó la llave de servicio (${listed.error.message})` };
    }
    if (!listed.data.some((b) => b.name === EVIDENCE_BUCKET)) {
      const { error } = await supabase.storage.createBucket(EVIDENCE_BUCKET, { public: false });
      if (error && !/already exists|duplicate/i.test(error.message)) {
        console.error("[evidence] createBucket:", error.message);
        return { error: `no se pudo crear el espacio de fotos (${error.message})` };
      }
    }
    bucketReady = true;
  }
  return { storage: supabase.storage.from(EVIDENCE_BUCKET) };
}
