import {
  deleteFiles,
  uploadFiles
} from "../files/uploadFiles.js"

export const PASSENGER_REQUEST_FILES_BUCKET = "passenger-requests"

/**
 * Канонический путь для сравнения (как в БД после uploadFiles).
 */
export const canonicalFilePath = (filePath) => {
  if (!filePath) return ""
  let p = String(filePath).trim().replace(/\\/g, "/")

  if (p.startsWith("/files/")) {
    return p
  }
  if (p.startsWith("files/")) {
    return `/${p}`
  }
  if (p.startsWith("/uploads/") || p.startsWith("uploads/")) {
    return p.startsWith("/") ? `/files${p}` : `/files/${p}`
  }
  if (p.startsWith("/reports/") || p.startsWith("reports/")) {
    return p.startsWith("/") ? `/files${p}` : `/files/${p}`
  }
  if (p.startsWith("/reserve_files/") || p.startsWith("reserve_files/")) {
    return p.startsWith("/") ? `/files${p}` : `/files/${p}`
  }

  return p
}

export const filePathsMatch = (a, b) =>
  canonicalFilePath(a) === canonicalFilePath(b)

export const uploadPassengerRequestFiles = async (requestId, files) => {
  if (!files?.length) return []

  const paths = []
  for (const file of files) {
    const uploadedPath = await uploadFiles(file, {
      bucket: PASSENGER_REQUEST_FILES_BUCKET,
      entityId: requestId
    })
    paths.push(uploadedPath)
  }
  return paths
}

export const deletePassengerRequestFileFromDisk = async (filePath) => {
  if (!filePath) return
  await deleteFiles(filePath)
}

export const deleteAllPassengerRequestFilesFromDisk = async (filePaths) => {
  for (const filePath of filePaths || []) {
    await deletePassengerRequestFileFromDisk(filePath)
  }
}

export const findPassengerRequestFileIndex = (files, filePath) =>
  (files || []).findIndex((stored) => filePathsMatch(stored, filePath))
