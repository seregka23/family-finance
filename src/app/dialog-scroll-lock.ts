// Multiple native dialogs can overlap; restore the original style after the last closes.
const locks = new WeakMap<Document, { count: number; overflow: string }>();

export function lockDialogScroll(document: Document): () => void {
  const existing = locks.get(document);
  if (existing) existing.count++;
  else {
    locks.set(document, { count: 1, overflow: document.body.style.overflow });
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const lock = locks.get(document);
    if (!lock || --lock.count > 0) return;
    document.body.style.overflow = lock.overflow;
    locks.delete(document);
  };
}
