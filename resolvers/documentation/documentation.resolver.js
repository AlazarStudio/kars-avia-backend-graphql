import { prisma } from "../../prisma.js"
import { deleteSectionCascade } from "./cascadeDeletefunc.js"
import { getSectionsHierarchyJSONOptimized } from "./getSectionsWithHierarhyFunc.js"

const documentationResolver = {
    Query: {
        articles: async () => {
            return await prisma.article.findMany({
                include: {
                    section: true
                }
            })
        },
        article: async(_, { id }) => {
            return await prisma.article.findUnique({
                where: {
                    id: id
                },
                include: {
                    section: true
                }
            })
        },
        sectionsWithHierarhy: async () => {
             try {
                    const sectionsJSON = await getSectionsHierarchyJSONOptimized();          
                    return sectionsJSON;
                } 
             catch (error) {
                    return error
                }
        },
        sections: async () => {
            try {
                const sections = await prisma.section.findMany({})
                return sections
            }
            catch {
                return new Error("Ошибка запроса")
            }
        },
        section: async (_, { id }) => {
            return await prisma.section.findUnique({
                where: {
                    id: id
                },
                include: {
                    parent: true
                }
            })
        }
    },
    Mutation: {
        createArticle: async (_, { input }) => {
        
            const newArticle = await prisma.article.create({
                data: input,
                include: {
                    section: true
                }
            })

            return newArticle
        },
        updateArticle: async (_, { id, input }) => {
            return await prisma.article.update({
                where: { id: id },
                data: input,
                include: {
                    section: true
                }
            })
        },
        deleteArticle: async (_, { id }) => {
            try {
                await prisma.article.delete({
                    where: { id: id }
                })
            }
            catch(error) {
                return new Error("Было введено некорректное ID или не существующее ID")
            }
           
            return "Операция прошла успешно"
        },
        createSection: async (_, { input }) => {
            const newSection = await prisma.section.create({
                data: input,
                include: {
                    parent: true
                }
            })

            return newSection
        },
        updateSection: async (_, { id, input }) => {
            return await prisma.section.update({
                where: { id: id},
                data: input
            })
        },
        deleteSection: async (_, { id }) => {
            try {
                await deleteSectionCascade(id)
            }
            catch(error) {
                return new Error("Было введено некорректное ID или не существующее ID")
            }
           
            return "Операция прошла успешно"
        }
    }
}


export default documentationResolver

