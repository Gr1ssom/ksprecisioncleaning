import { useState } from "react";

/**
 * Local state that starts from a prop and resets whenever the server sends a new value
 * (after a refresh). Used for taps shown at once and kept while the phone is offline.
 */
export function useSynced<T>(value: T): [T, (v: T) => void] {
  const [state, setState] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setState(value); }
  return [state, setState];
}
