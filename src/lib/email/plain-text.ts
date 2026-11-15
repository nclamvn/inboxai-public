const quotedBoundary = /^(?:>|--(?:\s|$)|-{2,}\s*(?:original message|forwarded message|thư gốc|thư được chuyển tiếp)|begin forwarded message:|from:|từ:|on .+ wrote:|vào .+ đã viết:)/iu

export function isQuotedMailBoundary(line: string) {
  return quotedBoundary.test(line)
}
