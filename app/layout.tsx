import type { Metadata } from "next";
import { isEmailAllowed } from "./access-control";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";
import "./fonts.css";
import "./globals.css";

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
      <body className="antialiased">
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
