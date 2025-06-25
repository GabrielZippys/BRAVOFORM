import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cependant Formulários",
  description: "Plataforma Inteligente de Formulários",
};

import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}