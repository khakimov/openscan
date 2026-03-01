'use client';

import { Button } from '@/components/ui/button';
import { DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { cn } from '@/utils/cn';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { popModal } from '..';

interface ModalContentProps extends DialogContentProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  hideCloseButton?: boolean;
}

export function ModalContent({ children, title, description, hideCloseButton, className, ...props }: ModalContentProps) {
  return (
    <DialogContent className={cn(hideCloseButton && "[&>button]:hidden", className)} {...props}>
      <VisuallyHidden.Root>
        <DialogTitle>{title || 'Modal'}</DialogTitle>
      </VisuallyHidden.Root>
      <VisuallyHidden.Root>
        <DialogDescription>{description || 'Modal dialog'}</DialogDescription>
      </VisuallyHidden.Root>
      {children}
    </DialogContent>
  );
}

interface ModalHeaderProps {
  title: string | React.ReactNode;
  text?: string | React.ReactNode;
  onClose?: (() => void) | false;
  className?: string;
}

export function ModalHeader({
  title,
  text,
  onClose,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'relative -m-6 mb-4 flex justify-between rounded-t-lg p-6 pb-0',
        className,
      )}
    >
      <div className="flex relative w-full items-start justify-between gap-4">
        <div className="flex flex-col mt-1 flex-1 gap-2">
          <div className="text-xl font-semibold">{title}</div>
          {text && (
            <div className="text-lg text-muted-foreground leading-normal">
              {text}
            </div>
          )}
        </div>
        {onClose !== false && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (onClose ? onClose() : popModal())}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </div>
  );
}