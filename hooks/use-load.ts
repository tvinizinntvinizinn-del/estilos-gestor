"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "../data";
import { on, type Topic } from "../events";

/**
 * Carrega dados e recarrega automaticamente quando algum tópico do barramento é emitido
 * (ex.: depois de registrar uma venda, gráficos e indicadores se atualizam sozinhos).
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[], topics: Topic[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = await loaderRef.current();
      if (mine === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(friendlyError(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const topicKey = topics.join(",");
  useEffect(() => {
    if (!topicKey) return;
    return on(topicKey.split(",") as Topic[], () => void reload());
  }, [topicKey, reload]);

  return { data, error, loading, reload, setData };
}
