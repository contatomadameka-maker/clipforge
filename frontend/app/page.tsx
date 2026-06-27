import { redirect } from "next/navigation";

export default function RootPage() {
  // Redireciona a raiz para o dashboard
  // Futuramente: verificar sessão e redirecionar para /login se não autenticado
  redirect("/dashboard");
}
