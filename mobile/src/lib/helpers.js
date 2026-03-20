export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getStoragePath(fileUrl) {
  try {
    const marker = '/object/public/cbc-reports/'
    const idx = fileUrl.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(fileUrl.slice(idx + marker.length))
  } catch {
    return null
  }
}

export function getExt(fileName) {
  return fileName?.split('.').pop()?.toUpperCase() || 'FILE'
}
