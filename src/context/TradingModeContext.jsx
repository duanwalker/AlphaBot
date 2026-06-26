import React, { createContext, useContext, useEffect, useState } from "react";
import { getTradingMode, setTradingMode } from "../services/api";

export const TradingModeContext = createContext("paper");

export function TradingModeProvider({ children }) {
  const [tradingMode, setTradingModeState] = useState("paper");

  useEffect(() => {
    getTradingMode()
      .then(({ mode }) => setTradingModeState(mode ?? "paper"))
      .catch(() => {
        const local = localStorage.getItem("paperMode");
        setTradingModeState(local === "false" ? "live" : "paper");
      });
  }, []);

  async function updateTradingMode(mode) {
    localStorage.setItem("paperMode", mode === "paper" ? "true" : "false");
    setTradingModeState(mode);
    await setTradingMode(mode);
  }

  return (
    <TradingModeContext.Provider value={{ tradingMode, updateTradingMode }}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  return useContext(TradingModeContext);
}
