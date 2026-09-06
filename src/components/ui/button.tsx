import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-maroon text-white hover:bg-maroon-dark",
        gold: "bg-gold text-stone-950 hover:brightness-95",
        outline: "border border-stone-300 bg-white hover:bg-stone-100",
        ghost: "hover:bg-stone-200/70",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
