module.exports = {
  removeClass (el, className) {
    if (el.classList) el.classList.remove(className)
    else {
      el.className = el.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ')
    }
  },
  addClass (el, className) {
    if (el.classList) el.classList.add(className)
    else el.className += ' ' + className
  },
  appendHTML (container, html) {
    const tmpEl = document.createElement('div')
    tmpEl.innerHTML = html
    const el = this.getFirstChild(tmpEl)
    container.appendChild(el)
    return el
  },
  beforeHTML (container, html) {
    const tmpEl = document.createElement('div')
    tmpEl.innerHTML = html
    const el = this.getFirstChild(tmpEl)
    container.parentNode.insertBefore(el, container)
    return el
  },
  getFirstChild (el) {
    let firstChild = el.firstChild
    while(firstChild != null && firstChild.nodeType == 3) firstChild = firstChild.nextSibling
    return firstChild
  },
  htmlToText (str) {
    const temp = document.createElement('div')
    temp.textContent = str || ''
    return temp.innerHTML
  },
  srcset (src) {
    const getSrcSet = (src, size) => {
      const delimeter = '/'
      const t = src.split(delimeter)
      const lastKey = t.length - 1
      t[lastKey] = `x${size}_${t[lastKey]}`
      return `${t.join(delimeter)} ${size}x`
    }
    return `${getSrcSet(src, 2)}, ${getSrcSet(src, 3)}`
  }
}
