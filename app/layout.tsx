import type { Metadata } from "next";
import { Cinzel, Roboto } from "next/font/google";
import "./globals.css";

// Importando as fontes do Google da forma correta para o Next.js App Router
const cinzel = Cinzel({ 
  subsets: ["latin"], 
  weight: "700",
  variable: '--font-cinzel' // Define uma variável CSS para a fonte
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: '--font-roboto' // Define uma variável CSS para a fonte
});

export const metadata: Metadata = {
  title: "FORMBRAVO",
  description: "Plataforma Inteligente de Formulários",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* Aplicando as variáveis das fontes ao corpo do documento */}
      <body className={`${cinzel.variable} ${roboto.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
