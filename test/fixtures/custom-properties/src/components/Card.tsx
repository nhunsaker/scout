export function Card({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
