import { createContext, useContext, forwardRef, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// Only the selected, finalized BM is locked. Navigation and explicitly marked
// consultation controls stay interactive; mutation controls are disabled by default.
const BillingReadOnly = createContext(false);
export const BillingReadOnlyProvider = BillingReadOnly.Provider;
export const useBillingReadOnly = () => useContext(BillingReadOnly);
type Consultation = { allowReadOnly?: boolean };
export const BillingButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & Consultation
>(({ allowReadOnly = false, disabled, ...props }, ref) => {
  const readOnly = useBillingReadOnly();
  return <Button {...props} ref={ref} disabled={disabled || (readOnly && !allowReadOnly)} />;
});
BillingButton.displayName = "BillingButton";
export const BillingInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof Input> & Consultation
>(({ allowReadOnly = false, disabled, ...props }, ref) => {
  const readOnly = useBillingReadOnly();
  return <Input {...props} ref={ref} disabled={disabled || (readOnly && !allowReadOnly)} />;
});
BillingInput.displayName = "BillingInput";
export function BillingSelect({
  allowReadOnly = false,
  disabled,
  ...props
}: ComponentProps<typeof Select> & Consultation) {
  const readOnly = useBillingReadOnly();
  return <Select {...props} disabled={disabled || (readOnly && !allowReadOnly)} />;
}
export const BillingCheckbox = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Checkbox> & Consultation
>(({ allowReadOnly = false, disabled, ...props }, ref) => {
  const readOnly = useBillingReadOnly();
  return <Checkbox {...props} ref={ref} disabled={disabled || (readOnly && !allowReadOnly)} />;
});
BillingCheckbox.displayName = "BillingCheckbox";
export const BillingTextarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<typeof Textarea> & Consultation
>(({ allowReadOnly = false, disabled, ...props }, ref) => {
  const readOnly = useBillingReadOnly();
  return <Textarea {...props} ref={ref} disabled={disabled || (readOnly && !allowReadOnly)} />;
});
BillingTextarea.displayName = "BillingTextarea";
