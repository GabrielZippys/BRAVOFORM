
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORMBRAVO",
  description: "Plataforma Inteligente de Formulários",
};

import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <title>Cependant Formulários</title>
      </head>
      <body>{children}</body>
    </html>
  );
}