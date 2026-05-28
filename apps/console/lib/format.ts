const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const formatUsdCents = (cents: number | null | undefined): string => {
  if (cents === null || cents === undefined) {
    return "—"
  }
  return usdFormatter.format(cents / 100)
}

export const formatUsdCentsCompact = (
  cents: number | null | undefined
): string => {
  if (cents === null || cents === undefined) {
    return "—"
  }
  return usdCompactFormatter.format(cents / 100)
}

const numberFormatter = new Intl.NumberFormat("en-US")

export const formatInt = (value: number): string =>
  numberFormatter.format(value)

export const formatMonth = (date: Date): string =>
  date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
