'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** Label for the confirm button. Caller is responsible for i18n. */
  confirmLabel: string;
  /** Label for the cancel button. Caller is responsible for i18n. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    // Pressing Escape or clicking the overlay fires onOpenChange(false) → onCancel
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" onClick={onCancel} className="wev-btn wev-btn-secondary">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="wev-btn wev-btn-primary">
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
