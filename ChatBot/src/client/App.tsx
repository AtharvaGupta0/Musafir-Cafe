import { useCallback, useEffect, useState } from "react";
import { Chat } from "./components/Chat";
import { fetchHealth } from "./lib/api";

type Connection = "connecting" | "online" | "offline";

const STATUS_LABEL: Record<Connection, string> = {
  connecting: "Connecting",
  online: "Online",
  offline: "Offline",
};

function BrandHeader({ state }: { state: Connection }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          M
        </span>
        <div>
          <p className="brand__name">
            Musafir <em>Café</em>
          </p>
          <p className="brand__tagline">Coffee for the dreamer</p>
        </div>
      </div>
      <p className={`status status--${state}`} role="status">
        <span className={`status__dot status__dot--${state}`} aria-hidden="true" />
        {STATUS_LABEL[state]}
      </p>
    </header>
  );
}

export default function App() {
  const [state, setState] = useState<Connection>("connecting");

  const checkConnection = useCallback(() => {
    setState("connecting");
    fetchHealth()
      .then(() => setState("online"))
      .catch(() => setState("offline"));
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return (
    <div className="app">
      <div className="app__frame">
        <BrandHeader state={state} />

        {state === "online" && <Chat />}

        {state === "connecting" && (
          <div className="gate">
            <p className="gate__text" role="status">
              Connecting to Musafir Café…
            </p>
          </div>
        )}

        {state === "offline" && (
          <div className="gate">
            <div className="gate__card">
              <h2 className="gate__title">Musafir Café is offline</h2>
              <p className="gate__text">
                We couldn't reach the assistant service. Check that the chatbot backend is
                running, then try again.
              </p>
              <div className="gate__actions">
                <button type="button" className="btn" onClick={checkConnection}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
