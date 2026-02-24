import { normalizeFilePaths } from "../../services/files/normalizeFilePaths.js"

/**
 * Field resolvers для нормализации путей к файлам
 * Автоматически преобразует старые пути (/uploads/...) в защищенные пути (/files/uploads/...)
 */
const filePathsResolver = {
  // Request
  Request: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  // Reserve
  Reserve: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    },
    passengerList: (parent) => {
      return normalizeFilePaths(parent.passengerList || [])
    }
  },

  // Contract types
  AirlineContract: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  HotelContract: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  OrganizationContract: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  AdditionalAgreement: {
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  // User
  User: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // AirlinePersonal
  AirlinePersonal: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // Driver
  Driver: {
    documents: (parent) => {
      if (!parent.documents) return null
      
      const normalized = {}
      Object.keys(parent.documents).forEach(key => {
        normalized[key] = normalizeFilePaths(parent.documents[key] || [])
      })
      return normalized
    }
  },

  // Hotel
  Hotel: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    },
    gallery: (parent) => {
      return normalizeFilePaths(parent.gallery || [])
    }
  },

  // Organization
  Organization: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // ReportFile (уже имеет правильный формат, но на всякий случай)
  ReportFile: {
    url: (parent) => {
      return normalizeFilePaths(parent.url)
    }
  }
}

export default filePathsResolver
