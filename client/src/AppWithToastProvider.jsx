import React from "react";
import App from "./App";
import ToastProvider from "./components/ui/ToastProvider";
import { TradingModeProvider } from "./context/TradingModeContext";

export default function AppWithToastProvider() {
  return (
    <TradingModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </TradingModeProvider>
  );
}
