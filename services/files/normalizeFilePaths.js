/**
 * Нормализует пути к файлам для защищенного доступа
 * Преобразует старые пути (/uploads/...) в новые защищенные пути (/files/uploads/...)
 * 
 * @param {string|string[]} filePath - путь к файлу или массив путей
 * @returns {string|string[]} нормализованный путь или массив путей
 */
export function normalizeFilePaths(filePath) {
  if (!filePath) return filePath
  
  if (Array.isArray(filePath)) {
    return filePath.map(path => normalizeSinglePath(path))
  }
  
  return normalizeSinglePath(filePath)
}

/**
 * Нормализует один путь к файлу
 */
function normalizeSinglePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return filePath
  }
  
  // Если путь уже имеет префикс /files/, возвращаем как есть
  if (filePath.startsWith('/files/')) {
    return filePath
  }
  
  // Если путь начинается с /uploads/, /reports/ или /reserve_files/, добавляем префикс /files/
  if (filePath.startsWith('/uploads/') || 
      filePath.startsWith('/reports/') || 
      filePath.startsWith('/reserve_files/')) {
    return '/files' + filePath
  }
  
  // Если путь начинается без слеша, но содержит uploads/reports/reserve_files, добавляем префикс
  if (filePath.startsWith('uploads/') || 
      filePath.startsWith('reports/') || 
      filePath.startsWith('reserve_files/')) {
    return '/files/' + filePath
  }
  
  // Для всех остальных случаев возвращаем как есть
  return filePath
}
