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

  PassengerRequest: {
    files: (parent) => normalizeFilePaths(parent.files || [])
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

  // Contract file items
  ContractFile: {
    url: (parent) => {
      if (!parent?.url) return parent?.url
      const normalized = normalizeFilePaths(parent.url)
      return Array.isArray(normalized) ? normalized[0] : normalized
    }
  },

  // User
  User: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // Airline
  Airline: {
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
      Object.keys(parent.documents).forEach((key) => {
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

  HotelPreview: {
    images: (parent) => normalizeFilePaths(parent.images || []),
    gallery: (parent) => normalizeFilePaths(parent.gallery || [])
  },

  // Hotel nested entities
  Room: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  RoomKind: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  AdditionalServices: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // Organization
  Organization: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    }
  },

  // Support/docs
  PatchNote: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    },
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
    }
  },

  Documentation: {
    images: (parent) => {
      return normalizeFilePaths(parent.images || [])
    },
    files: (parent) => {
      return normalizeFilePaths(parent.files || [])
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
