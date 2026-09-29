import "./globals.css";

export const metadata = {
  title: "ECHO",
  description: "AI-\u043f\u043e\u043c\u0456\u0447\u043d\u0438\u043a \u0443\u0447\u0438\u0442\u0435\u043b\u044f \u043c\u0438\u0441\u0442\u0435\u0446\u0442\u0432\u0430",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
