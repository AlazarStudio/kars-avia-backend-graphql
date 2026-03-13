const documentationTypeDef = `#graphql
    scalar Date
    scalar Upload

    enum Type {
        DISPATCHER
        AIRLINE
        HOTEL
        REPRESENTATION
    }

    type Section {
        id: ID
        title: String!
        createdAt: Date
        updatedAt: Date

        parentId: String
        parent: Section

        children: [Section]
        articles: [Article]

        type: Type
    }

    type Article {
        id: ID
        title: String!
        createdAt: Date
        updatedAt: Date

        content: Json

        sectionId: String
        section: Section

        type: Type
    }


    input createSectionInput {
        title: String
        parentId: String
        type: Type
   }

    input updateSectionInput {
        title: String
        parentId: String
        type: Type
    }


    input createArticleInput {
        title: String
        content: Json
        sectionId: String
        type: Type
    }

    input updateArticleInput {
        title: String
        content: Json
        sectionId: String
        type: Type
    }

    type Query {
        articles: [Article!]!
        article(id: ID): Article!
        
        sectionsWithHierarhy: Json!
        sections(type: Type): [Section!]!
        section(id: ID): Section!
    }

    type Mutation {
        createArticle(input: createArticleInput): Article!
        updateArticle(id: ID input: updateArticleInput): Article!
        deleteArticle(id: ID): String!

        uploadDocumentationImage(file: Upload!): String!
        uploadDocumentationFile(file: Upload!): String!

        createSection(input: createSectionInput): Section!
        updateSection(id: ID input: updateSectionInput): Section!
        deleteSection(id: ID): String!
    }
    
`

export default documentationTypeDef