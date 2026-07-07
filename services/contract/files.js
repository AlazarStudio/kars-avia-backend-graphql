import path from "path"
import { GraphQLError } from "graphql"
import { deleteFiles, uploadFiles } from "../files/uploadFiles.js"
import { canonicalFilePath, filePathsMatch } from "../passengerRequest/files.js"

export { canonicalFilePath, filePathsMatch }

/**
 * Извлекает отображаемое имя из системного пути (для миграции legacy-записей).
 * Пример: /files/uploads/misc/2026/07/07/1234567890-dogovor.pdf → dogovor.pdf
 */
export const deriveDisplayNameFromPath = (filePath) => {
  if (!filePath) return "Файл"
  const basename = path.basename(String(filePath).replace(/\\/g, "/"))
  const withoutTimestamp = basename.replace(/^\d+-/, "")
  return withoutTimestamp || basename || "Файл"
}

/**
 * Нормализует files: legacy string[] → ContractFile[].
 */
export const normalizeContractFiles = (files) => {
  if (!files?.length) return []

  return files.map((item) => {
    if (typeof item === "string") {
      return {
        name: deriveDisplayNameFromPath(item),
        url: item
      }
    }

    return {
      name: String(item?.name ?? "").trim() || deriveDisplayNameFromPath(item?.url),
      url: item?.url ?? ""
    }
  })
}

export const extractFileUrls = (files) =>
  normalizeContractFiles(files)
    .map((file) => file.url)
    .filter(Boolean)

export const validateContractFileUploadInput = (files, fileNames) => {
  if (!files?.length) return

  if (!fileNames?.length) {
    throw new GraphQLError("fileNames is required when files are provided")
  }

  if (files.length !== fileNames.length) {
    throw new GraphQLError("files and fileNames must have the same length")
  }

  for (const name of fileNames) {
    if (!String(name ?? "").trim()) {
      throw new GraphQLError("Each file name must be a non-empty string")
    }
  }
}

export const uploadContractFiles = async (files, fileNames) => {
  validateContractFileUploadInput(files, fileNames)
  if (!files?.length) return []

  const uploaded = []
  for (let i = 0; i < files.length; i++) {
    const url = await uploadFiles(files[i])
    uploaded.push({
      name: String(fileNames[i]).trim(),
      url
    })
  }
  return uploaded
}

export const deleteContractFileFromDisk = async (fileUrl) => {
  if (!fileUrl) return
  await deleteFiles(fileUrl)
}

export const deleteAllContractFilesFromDisk = async (files) => {
  for (const fileUrl of extractFileUrls(files)) {
    await deleteContractFileFromDisk(fileUrl)
  }
}

export const findContractFileIndex = (files, fileUrl) =>
  normalizeContractFiles(files).findIndex((stored) =>
    filePathsMatch(stored.url, fileUrl)
  )

export const mergeContractFiles = (existingFiles, newFiles) => [
  ...normalizeContractFiles(existingFiles),
  ...normalizeContractFiles(newFiles)
]

export const removeContractFileFromList = (files, fileUrl) => {
  const normalized = normalizeContractFiles(files)
  const index = findContractFileIndex(normalized, fileUrl)
  if (index === -1) return { files: normalized, removed: null, index: -1 }

  const removed = normalized[index]
  return {
    files: normalized.filter((_, i) => i !== index),
    removed,
    index
  }
}

/**
 * Заменяет url в массиве ContractFile (для migrateUploads).
 */
export const replaceUrlInContractFiles = (files, oldVariants, newPath) => {
  const normalized = normalizeContractFiles(files)
  let changed = false

  const updated = normalized.map((file) => {
    for (const oldPath of oldVariants) {
      if (filePathsMatch(file.url, oldPath)) {
        changed = true
        return { ...file, url: newPath }
      }
    }
    return file
  })

  return changed ? updated : files
}
