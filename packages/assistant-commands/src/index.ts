// Slash commands are parsed client-side in the assistant composer and never
// reach the model. This package holds isomorphic declarations only; the
// web/desktop client binds the actual behavior (start a new thread, etc.).

export interface AssistantCommandDeclaration {
  // Canonical name without the leading slash, e.g. "new".
  name: string
  // Alternate names that resolve to the same command.
  aliases: readonly string[]
  // Shown in `/help`.
  description: string
  // Optional argument hint for help/autocomplete, e.g. "[title]".
  argsHint?: string
}

const newThread: AssistantCommandDeclaration = {
  name: "new",
  aliases: [],
  description: "Start a new conversation thread.",
}

const help: AssistantCommandDeclaration = {
  name: "help",
  aliases: ["?"],
  description: "List available slash commands.",
}

export const assistantCommandDeclarations: readonly AssistantCommandDeclaration[] =
  [newThread, help]

const byName: ReadonlyMap<string, AssistantCommandDeclaration> = new Map(
  assistantCommandDeclarations.flatMap((command) => [
    [command.name, command] as const,
    ...command.aliases.map((alias) => [alias, command] as const),
  ])
)

export interface ParsedAssistantCommand {
  command: AssistantCommandDeclaration
  // Raw argument string after the command token, trimmed. Empty when none.
  args: string
}

// Parses a composer value into a command + args, or returns null when the
// input is not a recognized slash command (so it is sent to the model).
export const parseAssistantCommand = (
  input: string
): ParsedAssistantCommand | null => {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null

  const firstSpace = trimmed.indexOf(" ")
  const token = (
    firstSpace === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpace)
  ).toLowerCase()
  const command = byName.get(token)
  if (!command) return null

  const args = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim()
  return { command, args }
}
