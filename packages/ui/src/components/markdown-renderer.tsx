"use client"

import "katex/dist/katex.min.css"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { StyledLink } from "@workspace/ui/components/styled-link"
import { cn } from "@workspace/ui/lib/utils"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

type CodeComponent = NonNullable<Components["code"]>
type ExtendedComponents = Components & {
  parameter: CodeComponent
}

const getClassName = (node: unknown) => {
  if (
    typeof node === "object" &&
    node !== null &&
    "properties" in node &&
    typeof node.properties === "object" &&
    node.properties !== null &&
    "className" in node.properties &&
    Array.isArray(node.properties.className)
  ) {
    return node.properties.className
      .filter((item): item is string => typeof item === "string")
      .join(" ")
  }
  return ""
}

const hasImageChild = (node: unknown) => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return false
  }
  return node.children.some(
    (child) =>
      typeof child === "object" &&
      child !== null &&
      "type" in child &&
      child.type === "element" &&
      "tagName" in child &&
      child.tagName === "img"
  )
}

const staticComponents = {
  p: ({ node, ...props }) => (
    <p
      className="mb-[24px] break-words text-[15px] text-foreground/90 leading-[24px] tracking-[-0.003em] sm:text-[16px] sm:leading-[26px] md:text-[17px] md:leading-[28px]"
      {...props}
    />
  ),

  h1: ({ node, ...props }) => (
    <h1
      className="mt-[36px] mb-[8px] font-bold font-calistooga text-[26px] text-foreground lowercase leading-[1.1] tracking-[-0.022em] sm:mt-[40px] sm:text-[32px] md:mt-[44px] md:text-[38px]"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mt-[28px] mb-[8px] font-bold font-calistooga text-[22px] text-foreground lowercase leading-[1.15] tracking-[-0.022em] sm:mt-[32px] sm:text-[26px] md:mt-[36px] md:text-[30px]"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="mt-[24px] mb-[8px] font-bold font-calistooga text-[19px] text-foreground lowercase leading-[1.2] tracking-[-0.019em] sm:mt-[26px] sm:text-[22px] md:mt-[28px] md:text-[26px]"
      {...props}
    />
  ),
  h4: ({ node, ...props }) => (
    <h4
      className="mt-[18px] mb-[8px] font-bold font-calistooga text-[17px] text-foreground lowercase leading-[1.22] tracking-[-0.015em] sm:mt-[20px] sm:text-[19px] md:mt-[22px] md:text-[22px]"
      {...props}
    />
  ),
  h5: ({ node, ...props }) => (
    <h5
      className="mt-[16px] mb-[8px] font-calistooga font-semibold text-[16px] text-foreground lowercase leading-[1.25] tracking-[-0.012em] sm:mt-[17px] sm:text-[17px] md:mt-[18px] md:text-[18px]"
      {...props}
    />
  ),
  h6: ({ node, ...props }) => (
    <h6
      className="mt-[14px] mb-[8px] font-calistooga font-semibold text-[15px] text-foreground lowercase leading-[1.3] tracking-[-0.01em] sm:mt-[14px] sm:text-[15px] md:mt-[16px] md:text-[16px]"
      {...props}
    />
  ),

  a: ({ node, children, ...props }) => {
    if (hasImageChild(node)) {
      return (
        <a
          {...props}
          className="inline-block transition-opacity hover:opacity-90"
        >
          {children}
        </a>
      )
    }

    const { type: _type, ...linkProps } = props

    return (
      <StyledLink className="text-foreground" {...linkProps}>
        {children}
      </StyledLink>
    )
  },

  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-[24px] mr-0 ml-0 border-foreground/80 border-l-[3px] pl-[23px] text-[16px] text-foreground/80 italic leading-[26px] sm:text-[17px] sm:leading-[28px] md:text-[18px] md:leading-[30px]"
      {...props}
    />
  ),

  ol: ({ node, ...props }) => (
    <ol
      className="mb-[24px] ml-[30px] list-outside list-decimal text-[15px] text-foreground/90 leading-[24px] sm:text-[16px] sm:leading-[26px] md:text-[17px] md:leading-[28px]"
      {...props}
    />
  ),

  code: ({ node, className, children, ...props }) => {
    const isCodeBlock = className?.includes("language-")

    if (isCodeBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }

    return (
      <code
        className="rounded-[3px] border border-border/40 bg-muted/50 px-[6px] py-[3px] font-mono text-[14px] text-foreground sm:text-[15px] md:text-[15px]"
        {...props}
      >
        {children}
      </code>
    )
  },

  pre: ({ node, children, ...props }) => (
    <pre
      className="my-[24px] overflow-x-auto rounded-lg border border-border/40 bg-muted/30 text-[13px] leading-[1.6] sm:text-[14px] md:text-[14px] [&>code]:block [&>code]:overflow-x-auto [&>code]:p-4"
      {...props}
    >
      {children}
    </pre>
  ),

  img: ({ node, alt = "", ...props }) => (
    <img
      className="mx-auto my-[42px] h-auto w-full rounded-[4px]"
      loading="lazy"
      alt={alt}
      {...props}
    />
  ),

  hr: ({ node, ...props }) => (
    <div
      className="my-[42px] flex items-center justify-center gap-[8px]"
      {...props}
    >
      <span className="h-[6px] w-[6px] rounded-full bg-foreground/40" />
      <span className="h-[6px] w-[6px] rounded-full bg-foreground/40" />
      <span className="h-[6px] w-[6px] rounded-full bg-foreground/40" />
    </div>
  ),

  table: ({ node, ...props }) => (
    <div className="my-[29px] overflow-x-auto">
      <table
        className="min-w-full border-collapse text-left text-[14px] sm:text-[15px] md:text-[16px]"
        {...props}
      />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th
      className="border-border border-b-[2px] p-[10px] font-semibold text-foreground sm:p-[11px] md:p-[12px]"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td
      className="border-border/40 border-b p-[10px] text-foreground/90 sm:p-[11px] md:p-[12px]"
      {...props}
    />
  ),

  strong: ({ node, ...props }) => (
    <strong className="font-bold text-foreground" {...props} />
  ),

  em: ({ node, ...props }) => <em className="italic" {...props} />,

  parameter: ({ node, children, ...props }) => (
    <code
      className="rounded-[3px] border border-border/40 bg-muted/50 px-[6px] py-[3px] font-mono text-[14px] text-foreground sm:text-[15px] md:text-[15px]"
      {...props}
    >
      {children}
    </code>
  ),
} satisfies ExtendedComponents

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const components = {
    ...staticComponents,

    ul: ({ node, ...props }) => {
      const isTaskList = getClassName(node).includes("contains-task-list")
      return (
        <ul
          className={cn(
            "mb-[24px] ml-[30px] list-outside list-disc text-[15px] text-foreground/90 leading-[24px] sm:text-[16px] sm:leading-[26px] md:text-[17px] md:leading-[28px]",
            isTaskList && "ml-0 list-none"
          )}
          {...props}
        />
      )
    },

    li: ({ node, children, ...props }) => {
      const isTaskItem = getClassName(node).includes("task-list-item")
      return (
        <li
          className={cn(
            "mb-[10px] pl-[5px]",
            isTaskItem && "flex list-none items-start gap-2 pl-0"
          )}
          {...props}
        >
          {children}
        </li>
      )
    },

    input: ({ node, type, checked, ...props }) => {
      if (type !== "checkbox") return <input type={type} {...props} />

      return <Checkbox checked={!!checked} className="mt-0.5 shrink-0" />
    },
  } satisfies Components

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-full [&>*:first-child]:mt-0",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeRaw, { passThrough: ["math", "inlineMath"] }],
          rehypeKatex,
          rehypeHighlight,
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
