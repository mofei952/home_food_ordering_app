import { useEffect, useRef, type ReactNode } from "react";

import { IconX } from "./icons";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="bottom-sheet"
      open
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="bottom-sheet__header">
        <h2 className="bottom-sheet__title">{title}</h2>
        <button
          type="button"
          className="btn--ghost btn--icon"
          aria-label="关闭"
          onClick={onClose}
        >
          <IconX width={20} height={20} />
        </button>
      </div>
      <div className="bottom-sheet__body">{children}</div>
    </dialog>
  );
}
