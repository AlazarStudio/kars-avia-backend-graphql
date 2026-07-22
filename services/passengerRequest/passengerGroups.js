import { v4 as uuidv4 } from "uuid"

const KINDS = ["FAMILY", "ESCORT", "COLLEAGUES", "GROUP", "OTHER"]
const LEVELS = ["ROOM", "HOTEL"]

const rosterIds = (roster) =>
  new Set(
    (Array.isArray(roster) ? roster : []).map((p) => p?.personId).filter(Boolean)
  )

/**
 * Upsert группы по groupId. Гарантии: dedupe участников, мягкая фильтрация
 * по ростеру, «один человек — одна группа» (участник убирается из прочих групп),
 * опустевшие группы удаляются.
 */
export const upsertGroup = (groups, input, roster) => {
  const list = Array.isArray(groups) ? [...groups] : []
  const ids = rosterIds(roster)
  const members = [
    ...new Set((input?.memberPersonIds ?? []).filter((id) => ids.has(id)))
  ]

  const groupId = input?.groupId || uuidv4()
  const existing = list.find((g) => g.groupId === groupId)
  const next = {
    groupId,
    label:
      input?.label != null
        ? String(input.label).trim() || null
        : (existing?.label ?? null),
    kind: KINDS.includes(input?.kind) ? input.kind : (existing?.kind ?? "OTHER"),
    togetherLevel: LEVELS.includes(input?.togetherLevel)
      ? input.togetherLevel
      : (existing?.togetherLevel ?? null),
    color: input?.color ?? existing?.color ?? null,
    memberPersonIds: members,
    createdAt: existing?.createdAt ?? new Date()
  }

  // один человек — одна группа: убрать новых участников из прочих групп
  const cleaned = list
    .filter((g) => g.groupId !== groupId)
    .map((g) => ({
      ...g,
      memberPersonIds: (g.memberPersonIds ?? []).filter(
        (id) => !members.includes(id)
      )
    }))
    .filter((g) => g.memberPersonIds.length > 0)

  return [...cleaned, next]
}

export const removeGroup = (groups, groupId) =>
  (Array.isArray(groups) ? groups : []).filter((g) => g.groupId !== groupId)

/** Убрать человека из всех групп (удаление из реестра); пустые группы удалить. */
export const stripPersonFromGroups = (groups, personId) =>
  (Array.isArray(groups) ? groups : [])
    .map((g) => ({
      ...g,
      memberPersonIds: (g.memberPersonIds ?? []).filter((id) => id !== personId)
    }))
    .filter((g) => g.memberPersonIds.length > 0)
