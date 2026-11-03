"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Catalog } from "../lib/types";

interface CatalogState {
  data: Catalog | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const CatalogContext = createContext<CatalogState | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch("/data/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("The card catalog didn't load.");
        return response.json() as Promise<Catalog>;
      })
      .then((catalog) => {
        if (!cancel) setData(catalog);
      })
      .catch(() => {
        if (!cancel) setError("The card catalog didn't load.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [tick]);

  return (
    <CatalogContext.Provider value={{ data, loading, error, reload: () => setTick((n) => n + 1) }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogState {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider");
  return value;
}
