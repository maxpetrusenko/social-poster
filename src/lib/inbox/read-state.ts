export function shouldMarkIncomingSeen(input: {
  sentAt: Date | null;
  createdAt: Date;
  seenAt: Date | null;
}) {
  if (!input.seenAt) return false;
  const receivedAt = input.sentAt ?? input.createdAt;
  return receivedAt.getTime() <= input.seenAt.getTime();
}
