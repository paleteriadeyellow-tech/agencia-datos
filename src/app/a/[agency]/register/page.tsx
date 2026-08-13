import { redirect } from "next/navigation";

/** Registro público desactivado: solo un admin crea cuentas en Managers. */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ agency: string }>;
}) {
  const { agency } = await params;
  redirect(`/a/${agency}/login`);
}
