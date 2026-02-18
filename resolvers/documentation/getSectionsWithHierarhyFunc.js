import { prisma } from "../../prisma.js"

// Альтернативная версия с использованием более эффективного подхода
export async function getSectionsHierarchyJSONOptimized() {
  // Получаем все разделы одним запросом
  const allSections = await prisma.section.findMany({
    include: {
      articles: {
        select: {
          id: true,
          title: true,
          content: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  })

  // Создаем карту разделов по ID для быстрого доступа
  const sectionsMap = new Map()
  allSections.forEach((section) => {
    sectionsMap.set(section.id, {
      ...section,
      childrens: [] // Инициализируем пустой массив для детей
    })
  })

  // Строим иерархию
  const rootSections = []

  sectionsMap.forEach((section) => {
    if (section.parentId) {
      const parent = sectionsMap.get(section.parentId)
      if (parent) {
        parent.childrens.push(section)
      }
    } else {
      rootSections.push(section)
    }
  })

  // Рекурсивная функция для преобразования в JSON
  function buildSectionJSON(section) {
    const result = {
      id: section.id,
      title: section.title,
      type: "section"
    }

    // Добавляем детей, если они есть
    if (section.childrens && section.childrens.length > 0) {
      result.childrens = section.childrens.map(buildSectionJSON)
    }

    // Добавляем статьи, если они есть
    if (section.articles && section.articles.length > 0) {
      result.articles = section.articles.map((article) => ({
        id: article.id,
        title: article.title,
        content: article.content
      }))
    }

    return result
  }

  // Преобразуем корневые разделы
  const jsonResult = rootSections.map(buildSectionJSON)

  // Добавляем статьи без раздела (sectionId: null)
  const rootArticles = await prisma.article.findMany({
    where: { sectionId: null },
    select: { id: true, title: true, content: true },
    orderBy: { createdAt: "asc" }
  })

  const rootArticlesJSON = rootArticles.map((article) => ({
    id: article.id,
    title: article.title,
    content: article.content,
    type: "article"
  }))

  const combined = [...jsonResult, ...rootArticlesJSON]

  return combined.length === 1 ? combined[0] : combined
}
