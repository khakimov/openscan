import { Button } from '@/components/ui/button';
import { popModal, type ConfirmProps } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

export default function Confirm({
  title,
  text,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <ModalContent hideCloseButton={true} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
      <ModalHeader title={title} onClose={false} />
      <p className="text-lg -mt-2">{text}</p>
      <div className="flex gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            popModal('Confirm');
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            popModal('Confirm');
            onConfirm();
          }}
        >
          Yes
        </Button>
      </div>
    </ModalContent>
  );
}