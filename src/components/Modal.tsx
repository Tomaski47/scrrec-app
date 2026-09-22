import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, onDismiss, children }: { title: string; onDismiss: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); dismiss.current(); }}
      onClick={event => { if (event.target === event.currentTarget) dismiss.current(); }}>
      <div className="app-dialog-content">
        <div className="app-dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="footer-button footer-link" aria-label={`Close ${title}`} onClick={onDismiss}>×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
