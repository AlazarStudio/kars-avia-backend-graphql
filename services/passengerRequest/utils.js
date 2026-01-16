export const resolveUserId = (context, inputCreatedById) => {
  return (
    inputCreatedById ||
    context.currentUser?.id ||
    context.user?.id ||
    context.userId
  )
}

export const updateTimes = (prev, status) => {
  const now = new Date()
  const times = { ...(prev || {}) }

  switch (status) {
    case "ACCEPTED":
      if (!times.acceptedAt) times.acceptedAt = now
      break
    case "IN_PROGRESS":
      if (!times.inProgressAt) times.inProgressAt = now
      break
    case "COMPLETED":
      if (!times.finishedAt) times.finishedAt = now
      break
    case "CANCELLED":
      if (!times.cancelledAt) times.cancelledAt = now
      break
  }

  return times
}

