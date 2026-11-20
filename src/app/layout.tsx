import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sounda", template: "%s · Sounda" },
  description: "Descubre qué serie o película estás viendo, guárdala en tu biblioteca y sigue tus capítulos.",
  appleWebApp: { capable: true, title: "Sounda", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0d12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        <Suspense>
          <Header />
        </Suspense>
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
