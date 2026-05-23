import { redirect } from "next/navigation"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string }>
}) {
  const { user_code: userCode } = await searchParams
  redirect(
    userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device"
  )
}
