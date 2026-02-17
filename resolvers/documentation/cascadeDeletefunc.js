 import { prisma } from "../../prisma.js"
 
 // Рекурсивное удаление раздела со всеми подразделами и статьями
export async function deleteSectionCascade(sectionId) {
    // Находим все дочерние разделы
    const childSections = await prisma.section.findMany({
        where: { parentId: sectionId }
    });

    // Рекурсивно удаляем дочерние разделы
    for (const child of childSections) {
        await deleteSectionCascade(child.id);
    }

    // Удаляем все статьи в этом разделе
    await prisma.article.deleteMany({
        where: { sectionId: sectionId }
    });

    // Удаляем сам раздел
    await prisma.section.delete({
        where: { id: sectionId }
    });
}
