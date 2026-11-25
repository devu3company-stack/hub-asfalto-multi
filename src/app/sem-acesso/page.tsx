import Link from "next/link";

export default function SemAcesso() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-sm text-center flex flex-col gap-3">
        <h1 className="font-display font-extrabold text-xl">Sem acesso</h1>
        <p className="text-sm text-graphite-muted">Seu perfil não tem permissão para esta área. Fale com o administrador.</p>
        <Link href="/" className="btn-outline">Voltar</Link>
      </div>
    </main>
  );
}
