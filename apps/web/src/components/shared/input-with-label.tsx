import { forwardRef, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { BanIcon, InfoIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltiper } from "@/components/ui/tooltip";

type WithLabel = {
  children: ReactNode;
  label: string;
  error?: string | undefined;
  info?: ReactNode;
  className?: string;
};
type InputWithLabelProps = ComponentPropsWithoutRef<typeof Input> &
  Omit<WithLabel, "children">;

export const WithLabel = ({
  children,
  className,
  label,
  info,
  error,
}: WithLabel) => {
  return (
    <div className={className}>
      <div className="mb-2 flex items-end justify-between">
        <Label
          className="mb-0 flex flex-1 shrink-0 items-center gap-1 whitespace-nowrap"
          htmlFor={label}
        >
          {label}
          {info && (
            <Tooltiper content={info}>
              <InfoIcon size={14} />
            </Tooltiper>
          )}
        </Label>
        {error && (
          <Tooltiper
            asChild
            content={error}
            tooltipClassName="max-w-80 leading-normal"
            align="end"
          >
            <div className="flex items-center gap-1 leading-none text-destructive">
              Issues
              <BanIcon size={14} />
            </div>
          </Tooltiper>
        )}
      </div>
      {children}
    </div>
  );
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ label, error, info, className, ...inputProps }, ref) => {
    return (
      <WithLabel label={label} error={error} info={info} className={className}>
        <Input ref={ref} id={label} {...inputProps} />
      </WithLabel>
    );
  },
);

InputWithLabel.displayName = "InputWithLabel";
