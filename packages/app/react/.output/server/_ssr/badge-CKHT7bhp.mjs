import { c as cva } from "../_libs/class-variance-authority.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { u as useRender, m as mergeProps } from "../_libs/base-ui__react.mjs";
const badgeVariants = cva(
  "h-5 gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none before:shrink-0 before:size-1.5 before:rounded-full focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[0.1875rem] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground [a]:hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        solid: "bg-primary text-primary-foreground [a]:hover:bg-primary/90",
        destructive: "bg-muted text-foreground before:content-[''] before:bg-destructive",
        outline: "border-border text-foreground [a]:hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        success: "bg-muted text-foreground before:content-[''] before:bg-success",
        info: "bg-muted text-foreground before:content-[''] before:bg-info",
        warning: "bg-muted text-foreground before:content-[''] before:bg-warning",
        error: "bg-muted text-foreground before:content-[''] before:bg-destructive"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({
  className,
  variant = "default",
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps(
      {
        className: cn(badgeVariants({ className, variant }))
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant
    }
  });
}
export {
  Badge as B
};
