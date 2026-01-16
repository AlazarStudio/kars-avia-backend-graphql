import { prisma } from "../../prisma.js"

export const buildDocumentationTree = async (id) => {
  const rootDoc = await prisma.documentation.findUnique({
    where: { id },
    select: {
      id: true,
      parentId: true,
      name: true,
      description: true,
      type: true,
      order: true,
      files: true,
      images: true
    }
  })

  if (!rootDoc) return null

  const children = await prisma.documentation.findMany({
    where: { parentId: rootDoc.id },
    select: {
      id: true,
      parentId: true,
      name: true,
      description: true,
      type: true,
      order: true,
      files: true,
      images: true
    },
    orderBy: { order: "asc" }
  })

  const childrenTree = await Promise.all(
    children.map((child) => buildDocumentationTree(child.id))
  )

  return { ...rootDoc, children: childrenTree }
}

export const sanitizeTreeInput = (node) => {
  if (!node || typeof node !== "object") return {}
  const { images, files, children, ...rest } = node
  return {
    ...rest,
    ...(Array.isArray(children) && children.length > 0
      ? { children: { create: children.map(sanitizeTreeInput) } }
      : {})
  }
}

