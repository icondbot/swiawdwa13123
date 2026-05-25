import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Read the API secret injected by the server into the page
const apiSecret = (window as Window & { __API_SECRET__?: string }).__API_SECRET__ ?? "";
if (apiSecret) {
  setAuthTokenGetter(() => apiSecret);
}

createRoot(document.getElementById("root")!).render(<App />);
