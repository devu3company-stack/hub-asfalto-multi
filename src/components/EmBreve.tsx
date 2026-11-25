import { PageHeader } from "./ui";

export default function EmBreve({ title, fase, itens }: { title: string; fase: string; itens: string[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Módulo previsto para a ${fase}.`} />
      <section className="card flex flex-col gap-2">
        <h2 className="font-display font-bold text-lg">O que vai ter aqui</h2>
        <ul className="list-disc pl-5 text-sm flex flex-col gap-1 text-graphite">
          {itens.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </section>
    </>
  );
}
