export default function Home() {
  return (
    <main className="page">
      <section className="panel">
        <div className="avatarPlaceholder" aria-hidden="true">
          AI
        </div>

        <header className="intro">
          <h1>ECHO</h1>
          <p>{"AI-\u043f\u043e\u043c\u0456\u0447\u043d\u0438\u043a \u0443\u0447\u0438\u0442\u0435\u043b\u044f \u043c\u0438\u0441\u0442\u0435\u0446\u0442\u0432\u0430"}</p>
        </header>

        <div className="actions">
          <button type="button" className="primaryButton">
            {"\u041f\u043e\u0447\u0430\u0442\u0438"}
          </button>
          <button type="button">
            {"\u0412\u0438\u043c\u043a\u043d\u0443\u0442\u0438 \u043c\u0456\u043a\u0440\u043e\u0444\u043e\u043d"}
          </button>
          <button type="button">
            {"\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438"}
          </button>
        </div>
      </section>
    </main>
  );
}
