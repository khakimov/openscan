import { ReactNode } from "react";

interface LayoutContentProps {
  children: ReactNode;
}

export function LayoutContent({ children }: LayoutContentProps) {
  return (
    <div className="pb-20 transition-all lg:pl-72 max-w-screen-2xl">
      {children}
    </div>
  );
}
