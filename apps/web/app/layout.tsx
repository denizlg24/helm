import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import {
  ClientToolsProvider,
  DataInvalidationProvider,
  SurfaceContextProvider,
} from "@workspace/ui/assistant/bridge"
import { Toaster } from "@workspace/ui/components/sonner"
import { BackgroundActivityProvider } from "@workspace/ui/lib/background-activity"
import { cn } from "@workspace/ui/lib/utils"
import { AssistantDock } from "@/components/assistant-dock"
import { CommandPalette } from "@/components/command-palette"
import { PomodoroHostProvider } from "@/components/pomodoro-host-provider"
import { SettingsProvider } from "@/components/settings/settings-provider"
import { ThemeProvider } from "@/components/theme-provider"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body>
        <ThemeProvider>
          <SettingsProvider>
            <SurfaceContextProvider>
              <ClientToolsProvider>
                <DataInvalidationProvider>
                  <BackgroundActivityProvider>
                    <PomodoroHostProvider>
                      {children}
                      <AssistantDock />
                      <CommandPalette />
                      <Toaster position="bottom-right" />
                    </PomodoroHostProvider>
                  </BackgroundActivityProvider>
                </DataInvalidationProvider>
              </ClientToolsProvider>
            </SurfaceContextProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
