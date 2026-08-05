import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and lets the later one win.
 *
 * @remarks
 * `clsx` handles the conditionals; `tailwind-merge` is what makes a component's
 * `className` prop an override rather than an append — without it a caller
 * passing `px-2` to something already carrying `px-4` gets both, and which one
 * applies comes down to stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
