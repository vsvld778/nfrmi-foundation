import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "НФРМИ — Развитие регионов и международное сотрудничество", template: "%s · НФРМИ" },
  description: "Национальный фонд развития и международной интеграции. Подготовка проектов, межрегиональная и международная производственная кооперация.",
  icons: {
    icon: "/images/nfrmi-logo.webp",
    shortcut: "/images/nfrmi-logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
