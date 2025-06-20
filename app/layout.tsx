
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORMBRAVO",
  description: "Plataforma Inteligente de Formulários",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
