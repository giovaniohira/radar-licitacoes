"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/** A select that submits its form as soon as the value changes. */
export function AutoSelect(props: ComponentProps<"select">) {
  const { pending } = useFormStatus();
  return <select {...props} disabled={pending || props.disabled} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
