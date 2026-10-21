"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
export default function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <Button
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </Button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
