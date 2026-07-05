import { createContext, useContext, useState } from 'react';

const SymbolContext = createContext(undefined);

export function SymbolProvider({ children }) {
  const [symbol, setSymbol] = useState(null);
  return (
    <SymbolContext.Provider value={{ symbol, setSymbol }}>
      {children}
    </SymbolContext.Provider>
  );
}

export function useSymbol() {
  const ctx = useContext(SymbolContext);
  if (!ctx) {
    throw new Error('useSymbol must be used within a SymbolProvider');
  }
  return ctx;
}
