import preview from './preview.html'

export function html(data: { [key: string]: string | number | boolean | object }) {
  let text = preview
  for (let i in data) {
    text = text.replaceAll(`{{${i}}}`, data[i].toString())
  }
  return text
}

