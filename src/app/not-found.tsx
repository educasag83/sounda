import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">No encontré eso</h1>
      <Link href="/" className="mt-4 inline-block text-accent">Volver al inicio</Link>
    </div>
  );
}
