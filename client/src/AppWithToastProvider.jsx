import React from "react";
import App from "./App";
import ToastProvider from "./components/ui/ToastProvider";

export default function AppWithToastProvider() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
