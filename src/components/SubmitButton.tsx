"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/** A submit button that disables itself while its form's Server Action runs. */
export function SubmitButton(props: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return <button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending || undefined} />;
}
