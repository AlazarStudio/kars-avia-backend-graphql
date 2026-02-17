import { prisma } from "../../prisma.js"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { uploadImage } from "../../services/files/uploadImage.js"
import { uploadFiles } from "../../services/files/uploadFiles.js"
import { allMiddleware } from "../../middlewares/authMiddleware.js"
import { deleteSectionCascade } from "./cascadeDeletefunc.js"
import { getSectionsHierarchyJSONOptimized } from "./getSectionsWithHierarhyFunc.js"

const documentationResolver = {
    Upload: GraphQLUpload,
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
        uploadDocumentationImage: async (_, { file }, context) => {
            await allMiddleware(context)
            const path = await uploadImage(file, { bucket: "documentation" })
            return path
        },
        uploadDocumentationFile: async (_, { file }, context) => {
            await allMiddleware(context)
            const path = await uploadFiles(file, { bucket: "documentation" })
            return path
        },
        createArticle: async (_, { input }, context) => {
            await allMiddleware(context)
            const newArticle = await prisma.article.create({
                data: input,
                include: {
                    section: true
                }
            })

            return newArticle
        },
        updateArticle: async (_, { id, input }, context) => {
            await allMiddleware(context)
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

