export const truncateMiddle = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  const half = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`
}
