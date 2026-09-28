import type { Metadata } from "next";
// Fontes embutidas no repositório (28/09/2026): next/font/google quebrava o build na Vercel
// de forma intermitente quando o Google devolvia URL sem extensão (/l/font?kit=…&skey=…) —
// bug aberto vercel/next.js#99114. Com next/font/local o build não depende de rede.
import localFont from "next/font/local";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n-client";
import { getLocale } from "@/lib/locale";

const geistSans = localFont({
  src: "../fonts/geist-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
  display: "swap",
  fallback: ["system-ui", "arial"],
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
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
  // Tema no servidor (reconcept Fase 2): cookie l4p-theme → html já nasce escuro
  // pra quem escolheu escuro (sem flash branco). Padrão: claro, como sempre foi.
  const { cookies } = await import("next/headers");
  const tema = (await cookies()).get("l4p-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang={locale}
      data-theme={tema}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
