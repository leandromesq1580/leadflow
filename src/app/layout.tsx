import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n-client";
import { getLocale } from "@/lib/locale";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lead4Pro — Leads Exclusivos de Seguro de Vida",
  description: "Receba leads frescos de brasileiros nos EUA interessados em seguro de vida. Exclusivos, em tempo real.",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: { capable: true, title: "Lead4Pro", statusBarStyle: "default" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Idioma para TODA a árvore (Onda 1 do i18n, 2026-08-11): cookie NEXT_LOCALE e, na
  // primeira visita, o idioma do navegador — americano cai em EN, hispano em ES já no
  // login/cadastro. O provider do dashboard continua existindo (mesmo valor, inócuo).
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
