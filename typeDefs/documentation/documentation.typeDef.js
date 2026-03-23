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
        documentationType: DocumentationType
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
        documentationType: DocumentationType
    }


    input createSectionInput {
        title: String
        parentId: String
        type: Type
        documentationType: DocumentationType
    }

    input updateSectionInput {
        title: String
        parentId: String
        type: Type
        documentationType: DocumentationType
    }


    input createArticleInput {
        title: String
        content: Json
        sectionId: String
        type: Type
        documentationType: DocumentationType
    }

    input updateArticleInput {
        title: String
        content: Json
        sectionId: String
        type: Type
        documentationType: DocumentationType
    }

    type Query {
        articles(documentationType: DocumentationType): [Article!]!
        article(id: ID): Article!
        
        sectionsWithHierarhy(type: Type, documentationType: DocumentationType): Json!
        sections(type: Type, documentationType: DocumentationType): [Section!]!
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
