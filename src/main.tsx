// Self-hosted Inter (Google Fonts was blocked by the CSP and leaks user IPs).
import '@fontsource-variable/inter';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
