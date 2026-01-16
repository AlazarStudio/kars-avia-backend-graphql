import { prisma } from "../../prisma.js"

export const dedupe = (arr) => {
  return Array.from(new Set(arr.filter(Boolean)))
}

export const fetchSubtreeByRoot = async (rootId) => {
  const out = []
  const queue = [rootId]

  while (queue.length) {
    const parentId = queue.shift()
    const kids = await prisma.documentation.findMany({
      where: { parentId },
      select: { id: true, parentId: true, clientKey: true, images: true }
    })
    out.push(...kids)
    for (const k of kids) queue.push(k.id)
  }

  return out
}

export const getDescendantIds = async (id) => {
  const children = await prisma.documentation.findMany({
    where: { parentId: id }
  })
  let ids = children.map((c) => c.id)
  for (const child of children) {
    const childDescendants = await getDescendantIds(child.id)
    ids = ids.concat(childDescendants)
  }
  return ids
}

