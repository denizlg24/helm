"use client"

import {
  coreModuleIds,
  defaultEnabledModuleIds,
  moduleDefinitions,
} from "@workspace/module-registry"
import type {
  BillingCatalogEntry,
  BillingSummaryResponse,
  OnboardingRecommendationAnswer,
  OnboardingRecommendationResponse,
  PlanId,
} from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Wordmark } from "@workspace/ui/components/auth-shell"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowRightIcon, CheckIcon } from "lucide-react"
import Link from "next/link"
import type * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiClient } from "../../lib/api-client"

const planOrder = ["starter", "pro", "enterprise"] as const

const INBOX_MODULE_ID = "imap-inbox"
const TRIAGE_MODULE_ID = "triage"

const planCopy: Record<
  PlanId,
  {
    summary: string
    allowance: string
    limit: string
  }
> = {
  starter: {
    summary: "For getting your daily operating system online.",
    allowance: "$0.50 monthly AI allowance",
    limit: "60 requests / min",
  },
  pro: {
    summary: "For heavier assistant use and a fuller command center.",
    allowance: "$20 monthly AI allowance",
    limit: "240 requests / min",
  },
  enterprise: {
    summary: "For intensive usage, publishing, and larger workflows.",
    allowance: "$250 monthly AI allowance",
    limit: "600 requests / min",
  },
}

const moduleDescriptions: Record<string, string> = {
  notes: "Capture, connect, and retrieve private knowledge.",
  whiteboard: "Sketch systems, plans, and open-ended thinking.",
  spreadsheets: "Track structured personal data and lightweight models.",
  timetable: "Plan recurring routines with a fixed weekly shape.",
  journal: "Keep a dated private record of decisions and days.",
  pomodoro: "Run focused sessions from the dashboard and desktop.",
  people: "Maintain a private CRM for relationships and reminders.",
  "imap-inbox": "Bring mail into Helm without making email the center.",
  triage: "Use assistant-powered sorting for incoming messages.",
  resources: "Monitor personal infrastructure, domains, and services.",
  blog: "Publish long-form writing from selected private material.",
  projects: "Show public work without exposing private workspace data.",
  timeline: "Publish chronological updates and milestones.",
  now: "Maintain a public snapshot of what has your attention.",
  comments: "Receive public responses without shared sessions.",
  "contact-form": "Accept public messages through a controlled endpoint.",
}

const groupLabels: Record<string, string> = {
  knowledge: "Knowledge",
  work: "Work",
  relationships: "Relationships",
  communications: "Communications",
  infrastructure: "Infrastructure",
  publish: "Publish",
}

const formatPrice = (priceUsdCents: number | null | undefined) => {
  if (priceUsdCents === null || priceUsdCents === undefined) {
    return "TBD"
  }
  if (priceUsdCents === 0) {
    return "$0"
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: priceUsdCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceUsdCents / 100)
}

const planPriceLabel = (
  plan: PlanId,
  entry: BillingCatalogEntry | undefined
) => {
  if (entry) {
    return `${formatPrice(entry.priceUsdCents)}/mo`
  }
  return plan === "starter" ? "Free" : "Unavailable"
}

const modulePriceLabel = (entry: BillingCatalogEntry | undefined) =>
  entry ? `${formatPrice(entry.priceUsdCents)}/mo` : "Not in catalog"

const paidModuleIds: ReadonlySet<string> = new Set(
  moduleDefinitions
    .filter(
      (moduleDefinition) =>
        !coreModuleIds.includes(
          moduleDefinition.id as (typeof coreModuleIds)[number]
        ) &&
        !defaultEnabledModuleIds.includes(
          moduleDefinition.id as (typeof defaultEnabledModuleIds)[number]
        )
    )
    .map((moduleDefinition) => moduleDefinition.id)
)

const moduleGroups = moduleDefinitions
  .filter((moduleDefinition) => paidModuleIds.has(moduleDefinition.id))
  .reduce<Record<string, (typeof moduleDefinitions)[number][]>>(
    (groups, moduleDefinition) => {
      const existing = groups[moduleDefinition.group] ?? []
      groups[moduleDefinition.group] = [...existing, moduleDefinition]
      return groups
    },
    {}
  )

const formatPlanName = (plan: PlanId) =>
  `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`

interface ChatMessage {
  id: string
  role: "assistant" | "user"
  content: string
}

export function OnboardingPlanModulesFlow() {
  const [catalog, setCatalog] = useState<BillingCatalogEntry[]>([])
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("starter")
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(
    () => new Set()
  )
  const [loading, setLoading] = useState(true)
  const [checkoutStarting, setCheckoutStarting] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [recommendation, setRecommendation] =
    useState<OnboardingRecommendationResponse | null>(null)
  const [returningFromCheckout, setReturningFromCheckout] = useState(false)

  // Guided AI interview state.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answers, setAnswers] = useState<OnboardingRecommendationAnswer[]>([])
  const [nextQuestionId, setNextQuestionId] = useState<string | null>(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [chatDone, setChatDone] = useState(false)
  const [draft, setDraft] = useState("")
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const chatStarted = useRef(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [currentWorkspace, nextSummary, nextCatalog] = await Promise.all([
          apiClient.workspace.current(),
          apiClient.billing.summary(),
          apiClient.billing.catalog(),
        ])

        if (!active) {
          return
        }

        if (currentWorkspace.workspace.onboardingCompletedAt) {
          window.location.href = "/"
          return
        }

        const checkoutReturn =
          window.location.search.includes("checkout=return")
        setSummary(nextSummary)
        setCatalog(nextCatalog.entries)

        // A Polar checkout is already in flight — the progress page owns it.
        if (nextSummary.activeCheckoutSessions.length > 0) {
          window.location.href = "/onboarding/checkout"
          return
        }

        const enabledPaidIds = nextSummary.enabledModuleIds.filter((moduleId) =>
          paidModuleIds.has(moduleId)
        )

        // A persisted selection means the user already committed in a previous
        // visit; restore it into the editable picker instead of re-running the
        // interview.
        if (nextSummary.selection) {
          setSelectedPlan(nextSummary.selection.plan)
          setSelectedModuleIds(
            new Set([...enabledPaidIds, ...nextSummary.selection.moduleIds])
          )
          setManualMode(true)
        } else {
          setSelectedPlan(nextSummary.plan)
          setSelectedModuleIds(new Set(enabledPaidIds))
          if (checkoutReturn) {
            setManualMode(true)
          }
        }

        setReturningFromCheckout(checkoutReturn)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load onboarding options"
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const planEntries = useMemo(
    () =>
      new Map(
        catalog
          .filter((entry) => entry.kind === "plan" && entry.plan)
          .map((entry) => [entry.plan as PlanId, entry])
      ),
    [catalog]
  )

  const moduleEntries = useMemo(
    () =>
      new Map(
        catalog
          .filter((entry) => entry.kind === "module" && entry.moduleId)
          .map((entry) => [entry.moduleId as string, entry])
      ),
    [catalog]
  )

  const enabledModuleIds = useMemo(
    () => new Set(summary?.enabledModuleIds ?? []),
    [summary]
  )

  useEffect(() => {
    const scroll = chatScrollRef.current
    if (!scroll) {
      return
    }
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" })
  })

  const finalizeRecommendation = useCallback(
    async (finalAnswers: OnboardingRecommendationAnswer[]) => {
      setRecommending(true)
      try {
        const nextRecommendation = await apiClient.onboarding.recommend({
          answers: finalAnswers,
          currentPlan: selectedPlan,
          currentModuleIds: Array.from(selectedModuleIds),
        })
        const nextModuleIds = [
          ...Array.from(enabledModuleIds).filter((moduleId) =>
            paidModuleIds.has(moduleId)
          ),
          ...nextRecommendation.moduleIds,
        ]
        setRecommendation(nextRecommendation)
        setSelectedPlan(nextRecommendation.plan)
        setSelectedModuleIds(new Set(nextModuleIds))
        setManualMode(true)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Setup guidance is unavailable. You can customize manually."
        )
        setManualMode(true)
      } finally {
        setRecommending(false)
      }
    },
    [enabledModuleIds, selectedModuleIds, selectedPlan]
  )

  const runChatTurn = useCallback(
    async (currentAnswers: OnboardingRecommendationAnswer[]) => {
      setAssistantBusy(true)
      try {
        const turn = await apiClient.onboarding.chat({
          answers: currentAnswers,
        })
        setMessages((previous) => [
          ...previous,
          { id: crypto.randomUUID(), role: "assistant", content: turn.message },
        ])
        setNextQuestionId(turn.nextQuestionId)
        setTotalQuestions(turn.totalQuestions)
        if (turn.done) {
          setChatDone(true)
          await finalizeRecommendation(currentAnswers)
        }
      } catch {
        toast.error(
          "Helm couldn't continue the conversation. You can set things up manually."
        )
        setManualMode(true)
      } finally {
        setAssistantBusy(false)
      }
    },
    [finalizeRecommendation]
  )

  // Kick off the interview with the assistant's greeting + first question.
  useEffect(() => {
    if (loading || manualMode || chatStarted.current) {
      return
    }
    chatStarted.current = true
    void runChatTurn([])
  }, [loading, manualMode, runChatTurn])

  const submitAnswer = async () => {
    const trimmed = draft.trim()
    if (!trimmed || !nextQuestionId || assistantBusy || recommending) {
      return
    }

    const nextAnswers = [
      ...answers,
      { questionId: nextQuestionId, answer: trimmed },
    ]
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ])
    setAnswers(nextAnswers)
    setDraft("")
    await runChatTurn(nextAnswers)
  }

  const selectedModules = useMemo(
    () =>
      moduleDefinitions.filter((moduleDefinition) =>
        selectedModuleIds.has(moduleDefinition.id)
      ),
    [selectedModuleIds]
  )

  const selectedModuleTotal = selectedModules.reduce(
    (total, moduleDefinition) => {
      const priceUsdCents = moduleEntries.get(
        moduleDefinition.id
      )?.priceUsdCents
      return total + (priceUsdCents ?? 0)
    },
    0
  )

  const selectedPlanEntry = planEntries.get(selectedPlan)
  const selectedPlanTotal = selectedPlanEntry?.priceUsdCents ?? 0
  const estimatedTotal = selectedPlanTotal + selectedModuleTotal

  const pendingPlanProduct =
    summary && selectedPlan !== summary.plan ? selectedPlanEntry : undefined

  const pendingModuleProducts = selectedModules
    .filter((moduleDefinition) => !enabledModuleIds.has(moduleDefinition.id))
    .map((moduleDefinition) => moduleEntries.get(moduleDefinition.id))
    .filter((entry): entry is BillingCatalogEntry => Boolean(entry))

  const missingPendingPlan =
    Boolean(summary && selectedPlan !== summary.plan) && !selectedPlanEntry
  const missingPendingModules = selectedModules.some(
    (moduleDefinition) =>
      !enabledModuleIds.has(moduleDefinition.id) &&
      !moduleEntries.has(moduleDefinition.id)
  )

  const checkoutTargets = [
    ...(pendingPlanProduct ? [pendingPlanProduct] : []),
    ...pendingModuleProducts,
  ]
  const checkoutTarget = checkoutTargets[0]
  const remainingCheckoutCount = Math.max(0, checkoutTargets.length - 1)
  const hasCheckoutProducts = Boolean(checkoutTarget)
  const checkoutUnavailable = missingPendingPlan || missingPendingModules

  const inboxSelected =
    enabledModuleIds.has(INBOX_MODULE_ID) ||
    selectedModuleIds.has(INBOX_MODULE_ID)

  const toggleModule = (moduleId: string) => {
    setSelectedModuleIds((current) => {
      if (enabledModuleIds.has(moduleId)) {
        return current
      }
      const next = new Set(current)
      if (next.has(moduleId)) {
        next.delete(moduleId)
        // Triage depends on the inbox — dropping the inbox drops triage too.
        if (
          moduleId === INBOX_MODULE_ID &&
          !enabledModuleIds.has(TRIAGE_MODULE_ID)
        ) {
          next.delete(TRIAGE_MODULE_ID)
        }
      } else {
        if (
          moduleId === TRIAGE_MODULE_ID &&
          !enabledModuleIds.has(INBOX_MODULE_ID) &&
          !next.has(INBOX_MODULE_ID)
        ) {
          return current
        }
        next.add(moduleId)
      }
      return next
    })
  }

  const beginCheckout = async () => {
    if (!checkoutTarget) {
      try {
        setCheckoutStarting(true)
        await apiClient.workspace.completeOnboarding()
        window.location.href = "/"
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to finish setup"
        )
        setCheckoutStarting(false)
      }
      return
    }
    if (checkoutUnavailable) {
      toast.error("Some selected items are not available for checkout yet.")
      return
    }

    try {
      setCheckoutStarting(true)
      // Persist the selection before leaving so a returning user is shown this
      // same session. Idempotent server-side, so repeat clicks are safe.
      await apiClient.onboarding.setSelection({
        plan: selectedPlan,
        moduleIds: Array.from(selectedModuleIds),
      })
      window.location.href = "/onboarding/checkout"
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start checkout"
      )
      setCheckoutStarting(false)
    }
  }

  if (loading) {
    return <OnboardingSkeleton />
  }

  if (!summary) {
    return (
      <main className="min-h-svh bg-background px-6 py-14">
        <div className="mx-auto flex min-h-[70svh] max-w-sm flex-col justify-center gap-6">
          <Wordmark />
          <div className="space-y-2">
            <h1 className="font-medium text-2xl text-foreground tracking-tight">
              Create a workspace first
            </h1>
            <p className="text-balance text-muted-foreground text-sm">
              You need a workspace before choosing a plan and modules.
            </p>
          </div>
          <Link
            className={cn(buttonVariants(), "w-fit")}
            href="/onboarding/workspace"
          >
            Create workspace
          </Link>
        </div>
      </main>
    )
  }

  if (!manualMode) {
    const answeredProgress = Math.min(answers.length + 1, totalQuestions)

    // The interview is over — swap the chat for a calm preparing screen with
    // rotating status text instead of leaving a typing animation hanging.
    if (chatDone) {
      return <PreparingSetup />
    }

    return (
      <main className="h-svh overflow-hidden bg-background text-foreground">
        <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-8">
          <header className="flex items-center justify-between">
            <Wordmark />
            <Button
              onClick={() => setManualMode(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Skip
            </Button>
          </header>

          <section className="flex min-h-0 flex-1 flex-col pt-10">
            <div
              className="min-h-0 flex-1 space-y-8 overflow-y-auto pt-2 pb-6"
              ref={chatScrollRef}
            >
              {messages.map((message) =>
                message.role === "assistant" ? (
                  <AssistantTurn key={message.id}>
                    {message.content}
                  </AssistantTurn>
                ) : (
                  <UserTurn key={message.id}>{message.content}</UserTurn>
                )
              )}

              {assistantBusy ? <TypingIndicator /> : null}
            </div>

            <div className="border-border border-t pt-4">
              <Textarea
                className="min-h-20 resize-none"
                disabled={
                  assistantBusy || recommending || chatDone || !nextQuestionId
                }
                maxLength={1000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void submitAnswer()
                  }
                }}
                placeholder="Reply to Helm Bot…"
                value={draft}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {chatDone || totalQuestions === 0
                    ? "Preparing your setup"
                    : `${answeredProgress} / ${totalQuestions}`}
                </span>
                <Button
                  disabled={!nextQuestionId || chatDone}
                  loading={assistantBusy || recommending}
                  onClick={() => void submitAnswer()}
                  type="button"
                >
                  Send
                  <ArrowRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <section className="space-y-12">
          <header className="space-y-3">
            <Wordmark className="mb-6 flex w-fit" />
            <h1 className="font-medium text-2xl text-foreground tracking-tight">
              Compose your workspace
            </h1>
            <p className="max-w-xl text-balance text-muted-foreground text-sm leading-normal">
              Choose the usage plan and the operating modules Helm should open
              with. Core, Kanban, and Calendar are already included.
            </p>
          </header>

          {recommendation ? (
            <Alert>
              <AlertDescription>{recommendation.summary}</AlertDescription>
            </Alert>
          ) : null}
          {returningFromCheckout ? (
            <Alert>
              <AlertDescription>
                Checkout returned to Helm. Completed subscriptions are marked
                enabled below; continue with any remaining pending items.
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-1">
            <SectionLabel
              description="Plans meter AI allowance. Modules stay independent."
              title="Plan"
            />
            <div className="divide-y divide-border border-border border-y">
              {planOrder.map((plan) => {
                const entry = planEntries.get(plan)
                const selected = selectedPlan === plan
                return (
                  <button
                    aria-pressed={selected}
                    className="group flex w-full items-start gap-4 py-5 text-left transition focus-visible:outline-none"
                    key={plan}
                    onClick={() => setSelectedPlan(plan)}
                    type="button"
                  >
                    <RadioIndicator selected={selected} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-4">
                        <span
                          className={cn(
                            "font-medium capitalize transition-colors",
                            selected
                              ? "text-foreground"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {plan}
                        </span>
                        <span className="font-medium text-foreground text-sm tabular-nums">
                          {planPriceLabel(plan, entry)}
                        </span>
                      </span>
                      <span className="mt-1 block text-muted-foreground text-sm leading-snug">
                        {planCopy[plan].summary}
                      </span>
                      <span className="mt-1.5 block text-muted-foreground text-xs">
                        {planCopy[plan].allowance} · {planCopy[plan].limit}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-6">
            <SectionLabel
              description="Add only the surfaces you want in the first dashboard."
              title="Modules"
            />

            {Object.entries(moduleGroups).map(([group, definitions]) => (
              <div className="space-y-1" key={group}>
                <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {groupLabels[group] ?? group}
                </h3>
                <div className="divide-y divide-border border-border border-y">
                  {definitions.map((moduleDefinition) => {
                    const entry = moduleEntries.get(moduleDefinition.id)
                    const enabled = enabledModuleIds.has(moduleDefinition.id)
                    const selected =
                      enabled || selectedModuleIds.has(moduleDefinition.id)
                    const comingSoon = !entry && !enabled
                    const dependencyLocked =
                      moduleDefinition.id === TRIAGE_MODULE_ID &&
                      !inboxSelected &&
                      !enabled
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "group flex w-full items-center gap-3 py-4 text-left transition focus-visible:outline-none",
                          (enabled || dependencyLocked) &&
                            "cursor-default opacity-60"
                        )}
                        disabled={enabled || dependencyLocked}
                        key={moduleDefinition.id}
                        onClick={() => toggleModule(moduleDefinition.id)}
                        type="button"
                      >
                        <CheckIndicator selected={selected} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground text-sm">
                            {moduleDefinition.name}
                          </span>
                          <span className="block text-muted-foreground text-sm leading-snug">
                            {moduleDescriptions[moduleDefinition.id] ??
                              "Add this module to your Helm workspace."}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            enabled
                              ? "text-foreground"
                              : comingSoon
                                ? "text-muted-foreground/70"
                                : "text-muted-foreground"
                          )}
                        >
                          {enabled
                            ? "Enabled"
                            : dependencyLocked
                              ? "Needs Inbox"
                              : comingSoon
                                ? "Coming soon"
                                : modulePriceLabel(entry)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>
        </section>

        <aside className="lg:sticky lg:top-12 lg:h-fit">
          <div className="space-y-6">
            <div>
              <p className="text-muted-foreground text-sm">Estimated monthly</p>
              <p className="font-medium text-3xl text-foreground tracking-tight">
                {formatPrice(estimatedTotal)}
                <span className="ml-1 font-normal text-muted-foreground text-sm">
                  / month
                </span>
              </p>
            </div>

            <div className="space-y-3 border-border border-t pt-6 text-sm">
              <SummaryLine
                label={`${formatPlanName(selectedPlan)} plan`}
                value={planPriceLabel(selectedPlan, selectedPlanEntry)}
              />
              <SummaryLine
                label={`${selectedModules.length} module${
                  selectedModules.length === 1 ? "" : "s"
                }`}
                value={`${formatPrice(selectedModuleTotal)}/mo`}
              />
            </div>

            <div className="space-y-1.5 border-border border-t pt-6">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Opens with
              </p>
              <p className="text-foreground text-sm leading-relaxed">
                {[
                  "Home",
                  "Assistant",
                  "Kanban",
                  "Calendar",
                  ...selectedModules.map((m) => m.name),
                ].join(", ")}
              </p>
            </div>

            <div className="space-y-3 border-border border-t pt-6">
              <Button
                className="w-full"
                disabled={hasCheckoutProducts && checkoutUnavailable}
                loading={checkoutStarting}
                onClick={beginCheckout}
                size="lg"
                type="button"
              >
                {checkoutTarget ? "Continue to checkout" : "Finish setup"}
                <ArrowRightIcon className="size-4" />
              </Button>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {hasCheckoutProducts
                  ? remainingCheckoutCount > 0
                    ? `After this checkout, Helm returns here for ${
                        remainingCheckoutCount === 1
                          ? "1 remaining subscription"
                          : `${remainingCheckoutCount} remaining subscriptions`
                      }.`
                    : "After this checkout, Helm returns here to confirm setup."
                  : "Your selected plan and modules are ready to enable."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function SectionLabel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="pb-2">
      <h2 className="font-medium text-foreground text-lg tracking-tight">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}

function RadioIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        selected ? "border-foreground" : "border-input"
      )}
    >
      {selected ? <span className="size-2 rounded-full bg-foreground" /> : null}
    </span>
  )
}

function CheckIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-input"
      )}
    >
      {selected ? <CheckIcon className="size-3" /> : null}
    </span>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function AssistantTurn({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[90%] space-y-1">
      <p className="text-muted-foreground text-xs">Helm Bot</p>
      <div className="text-foreground text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function UserTurn({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto max-w-[90%] rounded-lg bg-muted px-4 py-3">
      <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">
        {children}
      </p>
    </div>
  )
}

const preparingPhrases = [
  "Reviewing your answers",
  "Choosing your plan",
  "Selecting your modules",
  "Putting your workspace together",
] as const

function PreparingSetup() {
  const [phraseIndex, setPhraseIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % preparingPhrases.length)
    }, 1800)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <main className="grid h-svh place-items-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 animate-pulse rounded-full bg-foreground" />
          <span className="size-2 animate-pulse rounded-full bg-foreground [animation-delay:160ms]" />
          <span className="size-2 animate-pulse rounded-full bg-foreground [animation-delay:320ms]" />
        </span>
        <p
          aria-live="polite"
          className="text-muted-foreground text-sm transition-opacity"
          key={phraseIndex}
        >
          {preparingPhrases[phraseIndex]}
        </p>
      </div>
    </main>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:120ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:240ms]" />
    </div>
  )
}

function OnboardingSkeleton() {
  return (
    <main className="min-h-svh bg-background px-6 py-12">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <section className="space-y-12">
          <div className="space-y-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-20" />
            {planOrder.map((plan) => (
              <Skeleton className="h-16 w-full" key={plan} />
            ))}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-6 w-24" />
            {["knowledge", "work", "publish"].map((group) => (
              <Skeleton className="h-32 w-full" key={group} />
            ))}
          </div>
        </section>
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  )
}
