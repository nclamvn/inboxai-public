export const composeFileLimit = 8 * 1024 * 1024
export const composeFileCount = 5

export const sameDraftFields = (left, right) =>
  ['to', 'cc', 'subject', 'body'].every(key => left[key] === right[key])

export function localFile(file) {
  const filename = Array.from(file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').trim()).slice(0, 255).join('')
  if (!filename || !file.size) throw new Error('Chọn tệp có tên và nội dung.')
  const mime = file.type.toLowerCase()
  return { id: crypto.randomUUID(), filename, contentType: /^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(mime)
    && mime.length <= 120 ? mime : 'application/octet-stream', size: file.size, local: true }
}

export function validateDraftFiles(files) {
  if (files.length > composeFileCount || files.reduce((size, file) => size + file.size, 0) > composeFileLimit) {
    throw new Error('Mỗi bản nháp được lưu tối đa 5 tệp với tổng dung lượng 8 MB.')
  }
}
