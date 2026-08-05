import { useEffect, useRef, useState } from "react";

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const COMMIT_DELAY_MS = 250;

/**
 * A text filter that is typed into an input and stored in the URL.
 *
 * @remarks
 * The two halves run at different speeds, which is the whole reason this exists.
 * Navigation is asynchronous, so a field whose value came straight back from the
 * search string re-rendered with the *previous* letter still in it and threw
 * away everything typed in between — eight keystrokes arrived as one letter.
 *
 * So the input reads from local state, which is always current, and the URL
 * catches up once the typing pauses. The effect below re-seeds the draft
 * whenever the URL changes from anywhere else: the back button, a shared link,
 * or a "clear filters" control, none of which would otherwise reach a field that
 * only ever writes outward.
 *
 * @param value - What the URL currently says the filter is.
 * @param commit - Writes a new value back to the URL. `undefined` clears it,
 * which is what keeps an empty field from leaving `?q=` behind.
 */
export function useUrlTextFilter(
  value: string,
  commit: (next: string | undefined) => void,
): Readonly<{ draft: string; setDraft: (next: string) => void }> {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    draft,
    setDraft: (next: string) => {
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => commit(next.trim().length === 0 ? undefined : next),
        COMMIT_DELAY_MS,
      );
    },
  };
}
