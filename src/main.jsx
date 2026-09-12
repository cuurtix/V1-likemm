/* =============================================================================
   LIKEMM — point d'entrée
   ========================================================================== */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { CONFIG_ERROR } from "./lib/config.js";
import "./styles/globals.css";

/**
 * Configuration absente (fichier .env manquant) : message clair plutôt qu'un
 * écran blanc. L'erreur vient de la configuration, pas du code.
 */
function ConfigurationError({ message }) {
  const box = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    background: "#fbfbfd", color: "#1d1d1f",
  };
  return (
    <div style={box}>
      <div style={{ maxWidth: 460 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 12px" }}>Configuration incomplète</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#424245", margin: "0 0 16px" }}>{message}</p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6e6e73", margin: 0 }}>
          Copiez <code>.env.example</code> en <code>.env</code>, renseignez{" "}
          <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>, puis relancez.
          Voir <code>docs/DEPLOY.md</code>.
        </p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    {CONFIG_ERROR ? <ConfigurationError message={CONFIG_ERROR} /> : <App />}
  </React.StrictMode>,
);
