import { redirect } from "next/navigation";
import { entregadorAtual } from "@/lib/entregador-auth";
import { EntrarForm } from "../Forms";

export const dynamic = "force-dynamic";

export default async function Entrar({ searchParams }: { searchParams: { volta?: string } }) {
  if (await entregadorAtual()) redirect(searchParams.volta?.startsWith("/entregador/") ? searchParams.volta : "/entregador");
  return (
    <>
      <div>
        <h1 className="font-display font-bold text-2xl">Entrar</h1>
        <p className="text-sm text-graphite">Use o WhatsApp e a senha que a Asfalto Multi te enviou.</p>
      </div>
      <EntrarForm volta={searchParams.volta} />
    </>
  );
}
