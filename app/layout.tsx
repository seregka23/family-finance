import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { isEmailAllowed } from "./access-control";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Семейные финансы",
  description: "Закрытый финансовый кабинет семьи.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireChatGPTUser("/");
  const allowed = isEmailAllowed(user.email);

  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {allowed ? children : (
          <main className="access-page">
            <section className="access-card">
              <span className="access-mark">FF</span>
              <p>Семейные финансы</p>
              <h1>Нет доступа</h1>
              <span>Аккаунт <b>{user.email}</b> не добавлен в список разрешённых пользователей.</span>
              <a href={chatGPTSignOutPath("/")}>Войти с другим аккаунтом</a>
            </section>
          </main>
        )}
      </body>
    </html>
  );
}
