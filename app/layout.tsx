import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// O AuthProvider foi removido, pois não é utilizado no seu projeto.

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BRAVOFORM",
  description: "Plataforma de formulários Bravo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {/* Renderiza diretamente os componentes filhos sem o AuthProvider */}
        {children}
      </body>
    </html>
  );
}
