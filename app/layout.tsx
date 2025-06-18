import type { Metadata } from "next";
import { Cinzel, Roboto } from "next/font/google";
import "./globals.css";

// Importando as fontes do Google
const cinzel = Cinzel({ 
  subsets: ["latin"], 
  weight: "700",
  variable: '--font-cinzel' 
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: '--font-roboto'
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
      {/* A classe 'font-sans' vem do tailwind.config.js que vamos ajustar.
        As variáveis das fontes são aplicadas aqui no body.
      */}
      <body className={`${cinzel.variable} ${roboto.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
