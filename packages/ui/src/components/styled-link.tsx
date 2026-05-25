"use client"

import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

type StyledLinkProps = React.ComponentProps<"a"> & {
  href?: string
  type?: "link" | "anchor"
  children: React.ReactNode | undefined
  className?: string
}

export const StyledLink = ({
  className,
  children,
  ...props
}: StyledLinkProps) => {
  const underlineClasses =
    "bg-[linear-gradient(currentColor,currentColor)] bg-[length:100%_2px] bg-no-repeat bg-[position:50%_100%] hover:bg-[length:0%_2px] transition-[background-size] duration-300"

  return (
    <a {...props} className={cn(underlineClasses, className, "pb-px")}>
      {children}
    </a>
  )
}
