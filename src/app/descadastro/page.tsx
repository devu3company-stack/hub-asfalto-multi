import { conferir } from "@/lib/email/envio";
import { descadastrarPorToken } from "@/lib/email/descadastrar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Descadastro — Asfalto Multi" };

async function confirmar(form: FormData) {
  "use server";
  const { redirect } = await import("next/navigation");
  const ok = await descadastrarPorToken(String(form.get("t") ?? ""));
  redirect(ok ? "/descadastro?feito=1" : "/descadastro");
}

export default function Descadastro({ searchParams }: { searchParams: { t?: string; feito?: string } }) {
  const valido = Boolean(conferir(searchParams.t));
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <div className="card max-w-md w-full flex flex-col gap-4 text-center">
        <img src="/logo.png" alt="Asfalto Multi" className="h-12 mx-auto" />
        {searchParams.feito ? (
          <>
            <h1 className="font-display font-bold text-xl">Pronto, você foi descadastrado</h1>
            <p className="text-sm text-graphite">Não vamos mais enviar e-mails de marketing para você.</p>
          </>
        ) : valido ? (
          <>
            <h1 className="font-display font-bold text-xl">Não quer mais receber nossos e-mails?</h1>
            <p className="text-sm text-graphite">Confirme abaixo e paramos os envios de marketing.</p>
            <form action={confirmar}>
              <input type="hidden" name="t" value={searchParams.t} />
              <button className="btn-primary w-full">Confirmar descadastro</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-display font-bold text-xl">Link inválido</h1>
            <p className="text-sm text-graphite">Use o link do final do e-mail ou responda a mensagem pedindo o descadastro.</p>
          </>
        )}
      </div>
    </main>
  );
}
