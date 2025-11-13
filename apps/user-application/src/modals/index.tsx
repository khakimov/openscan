import {
  lazy,
  Suspense,
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Loader2Icon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ModalContent } from "./Modal/Container";

// Loading component for lazy loaded modals
const Loading = () => (
  <ModalContent className="flex items-center justify-center p-16">
    <Loader2Icon className="animate-spin" size={40} />
  </ModalContent>
);

// Import simple modals directly to avoid loading state
import AddDiscovery from "./AddDiscovery";
import AddDevice from "./AddDevice";
import AddProject from "./AddProject";
import DeleteDeviceConfirm from "./DeleteDeviceConfirm";
import EditDevice from "./EditDevice";
import CreateSchedule from "./CreateSchedule";

// Define available modals - add your modals here
const modals = {
  Confirm: lazy(() => import("./Confirm")),
  DateRangerPicker: lazy(() => import("./DateRangerPicker")),
  AddDiscovery: AddDiscovery, // Direct import, no loading state
  AddDevice: AddDevice, // Direct import, no loading state
  AddProject: AddProject, // Direct import, no loading state
  DeleteDeviceConfirm: DeleteDeviceConfirm, // Direct import, no loading state
  EditDevice: EditDevice, // Direct import, no loading state
  CreateSchedule: CreateSchedule, // Direct import, no loading state
  // Add more modals as needed:
  // EditProfile: lazy(() => import('./EditProfile')),
};

type ModalName = keyof typeof modals;
type ModalProps = Record<string, any>;

interface ModalStackItem {
  name: ModalName;
  props: ModalProps;
  id: string;
}

interface ModalContextType {
  modalStack: ModalStackItem[];
  pushModal: (name: ModalName, props?: ModalProps) => void;
  popModal: (name?: ModalName) => void;
  replaceWithModal: (name: ModalName, props?: ModalProps) => void;
  popAllModals: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);

  const pushModal = useCallback((name: ModalName, props: ModalProps = {}) => {
    const id = `${name}-${Date.now()}`;
    setModalStack((prev) => [...prev, { name, props, id }]);
  }, []);

  const popModal = useCallback((name?: ModalName) => {
    setModalStack((prev) => {
      if (name) {
        // Pop specific modal
        const index = prev.findIndex((m) => m.name === name);
        if (index >= 0) {
          return [...prev.slice(0, index), ...prev.slice(index + 1)];
        }
        return prev;
      }
      // Pop last modal
      return prev.slice(0, -1);
    });
  }, []);

  const replaceWithModal = useCallback(
    (name: ModalName, props: ModalProps = {}) => {
      const id = `${name}-${Date.now()}`;
      setModalStack((prev) => [...prev.slice(0, -1), { name, props, id }]);
    },
    [],
  );

  const popAllModals = useCallback(() => {
    setModalStack([]);
  }, []);

  const contextValue = {
    modalStack,
    pushModal,
    popModal,
    replaceWithModal,
    popAllModals,
  };

  // Set global modal context for convenience functions
  useEffect(() => {
    modalContext = contextValue;
    return () => {
      modalContext = null;
    };
  }, [contextValue]);

  const currentModal = modalStack[modalStack.length - 1];

  return (
    <ModalContext.Provider
      value={{
        modalStack,
        pushModal,
        popModal,
        replaceWithModal,
        popAllModals,
      }}
    >
      {children}
      {currentModal && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) popModal();
          }}
        >
          {(() => {
            const ModalComponent = modals[currentModal.name];

            // Check if it's a lazy component (has $$typeof React element)
            const isLazyComponent =
              ModalComponent && typeof ModalComponent === "object" && "$$typeof" in ModalComponent;

            if (isLazyComponent) {
              const LazyModal = ModalComponent as React.LazyExoticComponent<React.ComponentType<any>>;
              return (
                <Suspense fallback={<Loading />}>
                  <LazyModal {...currentModal.props} />
                </Suspense>
              );
            } else {
              // Direct component, no suspense needed
              const DirectModal = ModalComponent as React.ComponentType<any>;
              return <DirectModal {...currentModal.props} />;
            }
          })()}
        </Dialog>
      )}
    </ModalContext.Provider>
  );
};

// Hook to use modal context
export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}

// Hook to listen for when a specific modal opens/closes
export function useOnPushModal(
  modalName: ModalName,
  callback: (isOpen: boolean) => void,
) {
  const context = useContext(ModalContext);

  useEffect(() => {
    if (!context) {
      // If no ModalProvider, always call with false
      callback(false);
      return;
    }

    const isOpen = context.modalStack.some((modal) => modal.name === modalName);
    callback(isOpen);
  }, [context?.modalStack, modalName, callback, context]);
}

// Export convenience functions
let modalContext: ModalContextType | null = null;

export function setModalContext(context: ModalContextType) {
  modalContext = context;
}

export function pushModal(name: ModalName, props?: ModalProps) {
  if (modalContext) {
    modalContext.pushModal(name, props);
  } else {
    console.warn(
      "Modal context not initialized. Make sure ModalProvider is mounted.",
    );
  }
}

export function popModal(name?: ModalName) {
  if (modalContext) {
    modalContext.popModal(name);
  }
}

export function replaceWithModal(name: ModalName, props?: ModalProps) {
  if (modalContext) {
    modalContext.replaceWithModal(name, props);
  }
}

export function popAllModals() {
  if (modalContext) {
    modalContext.popAllModals();
  }
}

// Helper for confirm modal
export interface ConfirmProps {
  title: string;
  text: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const showConfirm = (props: ConfirmProps) => pushModal("Confirm", props);

// Helper for add discovery modal
export interface AddDiscoveryProps {
  onConfirm?: (target: string) => void;
}

export const showAddDiscovery = (props?: AddDiscoveryProps) =>
  pushModal("AddDiscovery", props);

// Helper for edit device modal
export interface EditDeviceProps {
  deviceId: string;
  device?: any;
  onSuccess?: () => void;
}

export const showEditDevice = (props: EditDeviceProps) =>
  pushModal("EditDevice", props);
