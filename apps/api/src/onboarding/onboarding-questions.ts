// Canonical onboarding interview questions, owned by the server so the chat
// turn endpoint and the recommendation share one source of truth. The assistant
// reacts to the user's previous answer, then naturally asks the next question
// (covering `topic`). `prompt` + `helper` are the complete, self-sufficient
// wording used as the fallback when the assistant is unavailable, so the
// interview still reads coherently without AI.
export interface OnboardingQuestion {
  id: string
  prompt: string
  topic: string
  helper: string
}

export const onboardingQuestions: readonly OnboardingQuestion[] = [
  {
    id: "focus",
    prompt: "What do you want Helm to help you with first?",
    topic: "what they want Helm to help them with first",
    helper:
      "For example: planning work, notes, relationships, inbox, or publishing.",
  },
  {
    id: "usage",
    prompt: "How often do you expect to use the AI assistant?",
    topic: "how often they expect to use the AI assistant",
    helper: "A few times a week, daily, or heavily throughout the day?",
  },
  {
    id: "surface",
    prompt: "Which parts of your life should be visible on day one?",
    topic: "which parts of their life should be visible on day one",
    helper: "Think dashboards, calendar, people, email, or resources.",
  },
  {
    id: "public",
    prompt: "Do you plan to publish anything publicly from Helm?",
    topic: "whether they plan to publish anything publicly from Helm",
    helper:
      "A blog, projects, timeline, now page, comments — or nothing public?",
  },
  {
    id: "constraints",
    prompt: "Any budget or simplicity constraints I should keep in mind?",
    topic: "any budget or simplicity constraints they have",
    helper:
      "For example, the cheapest possible setup or fewer modules to start.",
  },
] as const
