import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-navy-900 text-white shadow-sm hover:bg-navy-800 active:translate-y-px",
        accent:
          "bg-emerald-700 text-white shadow-sm shadow-emerald-950/10 hover:bg-emerald-800 active:translate-y-px",
        secondary: "bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
        outline:
          "border border-line bg-white text-ink shadow-sm hover:border-ink/20 hover:bg-mist",
        ghost: "text-ink-soft hover:bg-mist hover:text-ink",
      },
      size: {
        sm: "h-9 px-3.5 text-[0.8125rem]",
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-sm",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { asChild = false, className, size, variant, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);
