export default function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-amber-100/80">{children}</div>
    </div>
  );
}
