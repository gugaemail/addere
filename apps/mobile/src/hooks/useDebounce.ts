import { useEffect, useState } from 'react'

// Retorna o valor apenas depois de `delayMs` sem mudanças.
// Evita uma requisição por tecla digitada nas buscas.
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
