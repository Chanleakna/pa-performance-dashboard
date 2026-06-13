import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabNav } from "./components/TabNav";

export const metadata: Metadata = {
  title: "PA Performance Dashboard",
  description:
    "Live Product Ambassador sales performance for the Abbott nutrition team — leads, attainment, new users, by team leader.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
                PA
              </div>
              <div className="leading-tight">
                <h1 className="text-sm font-semibold text-slate-900 sm:text-base">
                  PA Performance Dashboard
                </h1>
                <p className="text-[11px] text-slate-500">
                  Abbott Nutrition · Cambodia · live from Google Sheets
                </p>
              </div>
            </div>
          </div>
          <TabNav />
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-4">{children}</main>
      </body>
    </html>
  );
}
