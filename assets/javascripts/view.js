const css = require('raw-loader!sass-loader!./../stylesheets/application.sass')
const msgDelivered = require('./msgDelivered')
const helpers = require('./helpers')
const translations = require('./translations')

export default class View {
  constructor (app) {
    this.collapsed = true
    this.windowFocus = true
    this.app = app
    this.libs = app.libs
    this.allowSending = false
    this.typingTimeout = 1000
    this.noticeShowTimeout = 1000
    this.noticeHideTimeout = 10000
  }
  destroy () {
    const el = document.querySelector('[mkz-c]')
    if (!el) return
    el.parentNode.removeChild(el)
  }
  bind () {
    this.libs.domEvent.add(window, 'focus', this.focus.bind(this))
    this.libs.domEvent.add(window, 'blur', this.blur.bind(this))
    this.libs.domEvent.add(this.elSubmit, 'click', this.sendMsg.bind(this))
    this.libs.domEvent.add(this.elInput, 'keyup', this.setMsgHeight.bind(this))
    this.libs.domEvent.add(this.elInput, 'keydown', (e) => {
      if (e.keyCode == 13 && !e.shiftKey) {
        e.preventDefault()
        this.sendMsg()
      } else {
        if (!this.disableTyping) {
          clearTimeout(this.timeoutTyping)
          this.disableTyping = true
          this.timeoutTyping = setTimeout((() => {
            this.disableTyping = false
            this.sendTyping()
          }), this.typingTimeout)
        }
      }
    })
    this.libs.domEvent.add(this.elToggle, 'click', this.collapse.bind(this))
    this.libs.domEvent.add(this.elClose, 'click', this.collapse.bind(this))
  }
  focus () {
    this.windowFocus = true
  }
  blur () {
    this.windowFocus = false
  }
  collapse () {
    const containerClassName = 'mkz-c_collapse_yes'
    const htmlClassName = 'mkz-c-fixed'
    this.collapsed = !this.collapsed
    if (this.collapsed) {
      helpers.removeClass(document.documentElement, htmlClassName)
      helpers.addClass(this.elContainer, containerClassName)
    } else {
      helpers.addClass(document.documentElement, htmlClassName)
      helpers.removeClass(this.elContainer, containerClassName)
    }
    this.app.handlerCollapse(this.collapsed)
  }
  connected () {
    this.enableSending()
  }
  disconnected () {
    this.disableSending()
  }
  sendTyping () {
    const text = this.elInput.value
    this.app.pusherTyping(text)
  }
  sendMsg () {
    if (!this.allowSending) return
    const text = this.elInput.value.trim()
    if (!text) return
    this.app.pusherNewMsg(text)
      .receive('ok', () => {
        this.elInput.value = null
        this.setMsgHeight()
        this.enableSending()
      })
      .receive('error', () => this.enableSending.bind(this))
      .receive('timeout', () => this.enableSending.bind(this))
    this.disableSending()
  }
  setMsgHeight () {
    this.elInput.style.height = 'auto'
    const newH = this.elInput.scrollHeight
    this.elInput.style.height = newH + 'px'
  }
  disableSending () {
    this.allowSending = false
    if (this.elSubmit) helpers.addClass(this.elSubmit, 'mkz-c__submit_disabled_yes')
  }
  enableSending () {
    this.allowSending = true
    if (this.elSubmit) helpers.removeClass(this.elSubmit, 'mkz-c__submit_disabled_yes')
  }
  assignAgent () {
    this.elAgentName.innerText = this.app.currentAgent.name || ''
    if (this.app.options.agent_post) this.elAgentPost.innerText = this.app.currentAgent.post || ''
    if (this.app.options.agent_avatar && this.app.currentAgent.avatar_url) {
      this.elAgentAvatar.src = this.app.currentAgent.avatar_url
      this.elAgentAvatar.style.display = 'block'
    } else this.elAgentAvatar.style.display = 'none'
    helpers.addClass(this.elContainer, 'mkz-c_agent_assign')
  }
  unassignAgent () {
    helpers.removeClass(this.elContainer, 'mkz-c_agent_assign')
  }
  onlineAgents () {
    helpers.addClass(this.elContainer, 'mkz-c_agent_online')
  }
  offlineAgents () {
    helpers.removeClass(this.elContainer, 'mkz-c_agent_online')
  }
  toggleNotice () {
    const storeName = 'mkz_c_tooltip_hidden'
    if (sessionStorage.getItem(storeName)) return
    sessionStorage.setItem(storeName, true)
    setTimeout(() => {
      this.showNotice()
    }, this.noticeShowTimeout)
    setTimeout(() => {
      this.hideNotice()
    }, this.noticeShowTimeout + this.noticeHideTimeout)
  }
  showNotice () {
    helpers.addClass(this.elContainer, 'mkz-c_tooltip_yes')
  }
  hideNotice () {
    helpers.removeClass(this.elContainer, 'mkz-c_tooltip_yes')
  }
  render () {
    // Can be called multiple times on one page
    if (!this.el) {
      this.el = helpers.appendHTML(document.body, this.htmlTemplate())
      this.elContainer = this.el.querySelector('.mkz-c-js')
      this.elInput = this.el.querySelector('.mkz-c-js-input')
      this.elSubmit = this.el.querySelector('.mkz-c-js-submit')
      this.elUnread = this.el.querySelector('.mkz-c-js-unread')
      this.elClose = this.el.querySelector('.mkz-c-js-close')
      this.elToggle = this.el.querySelector('.mkz-c-js-toggle')
      this.elHistory = this.el.querySelector('.mkz-c-js-history')
      this.elScroll = this.el.querySelector('.mkz-c-js-scroll')
      this.elAgentName = this.el.querySelector('.mkz-c-js-agent-name')
      this.elAgentPost = this.el.querySelector('.mkz-c-js-agent-post')
      this.elAgentAvatar = this.el.querySelector('.mkz-c-js-agent-avatar')
      // No libraries in preview mode
      if (this.libs.domEvent) this.bind()
      this.toggleNotice()
    }
    this.renderMessages()
    this.renderUnread()
  }
  renderMessages () {
    const html = this.app.history.map((msg) => this.htmlMessage(msg)).join('')
    this.elHistory.innerHTML = html
  }
  renderUnread () {
    if (!this.elUnread) return
    const unreadCount = msgDelivered.getList().length
    this.elUnread.innerHTML = unreadCount
    this.elUnread.style.display = unreadCount === 0 ? 'none' : 'block'
  }
  renderAgentState () {
    if (this.app.agentIsOnline) this.onlineAgents()
    else this.offlineAgents()
  }
  scrollBottom () {
    setTimeout(() => {
      this.elScroll.scrollTop = this.elScroll.scrollHeight
    }, 0)
  }
  t (key) {
    return translations[this.app.locale][key]
  }
  safe (str) {
    return helpers.htmlToText(str)
  }
  htmlMessage (msg) {
    const htmlAvatar = msg.sender_avatar_url ? `<img src="${this.safe(msg.sender_avatar_url)}" class="mkz-c__i-avatar" alt="" title="${this.safe(msg.sender_name)}" />` : ''
    const text = msg.text.split("\n").join('<br />')
    const bg = msg.agent_id ? this.app.options.agent_msg_bg : this.app.options.client_msg_bg
    const color = msg.agent_id ? this.app.options.agent_msg_color : this.app.options.client_msg_color
    return `
            <div class="mkz-c__i mkz-c__i_type_${msg.agent_id ? 'agent' : 'client'}">
              ${htmlAvatar}
              <div class="mkz-c__i-content">
                <div class="mkz-c__i-msg" style="background-color: ${this.safe(bg)}; color: ${this.safe(color)}">
                  <div class="mkz-c__i-msg-overflow">
                    ${text}
                  </div>
                </div>
              </div>
            </div>`
  }
  htmlTemplate () {
    const htmlCopy = !this.app.options.markeaze_link ? '' : `
        <a class="mkz-c__copy" href="https://markeaze.com" target="_blank" style="background-color: ${this.safe(this.app.options.list_bg)};">
          <svg width="11" height="9" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.94727 2.8471C2.12716 2.49158 2.57173 2.38949 2.87918 2.63311C3.12176 2.82531 3.19515 3.17138 3.05276 3.45164L1.17079 7.15577C0.991709 7.50824 0.550808 7.60949 0.24532 7.3683C0.0037509 7.17757 -0.0698014 6.83352 0.0713545 6.55454L1.94727 2.8471Z" fill="#FC4566"/>
            <path d="M5.35667 1.9023C5.54038 1.55555 5.9926 1.45484 6.30746 1.69056C6.55814 1.87824 6.63496 2.21903 6.48885 2.49519L4.02121 7.15912C3.83664 7.50797 3.38122 7.60839 3.06569 7.36982C2.81616 7.18115 2.74036 6.8407 2.88648 6.5649L5.35667 1.9023Z" fill="#0EC52C"/>
            <path d="M8.81247 0.351483C8.99329 -0.00816918 9.44199 -0.111851 9.75226 0.134322C9.99632 0.327953 10.0705 0.67639 9.92784 0.959046L6.80213 7.15236C6.62323 7.50684 6.18144 7.61011 5.87387 7.36934C5.62976 7.17824 5.55453 6.83147 5.6961 6.54989L8.81247 0.351483Z" fill="#7261FF"/>
          </svg>
          ${this.t('copyright')}
        </a>`
    const htmlNotice = !this.app.options.notice_text ? '' : `
      <div class="mkz-c__tooltip mkz-c__tooltip_picture_yes" style="color: ${this.safe(this.app.options.notice_color)}; background-color: ${this.safe(this.app.options.notice_bg)}">
        <img src="${this.safe(this.app.options.notice_icon_url)}" class="mkz-c__tooltip-picture" alt="" />
        <div class="mkz-c__tooltip-text">
          ${this.safe(this.app.options.notice_text)}
        </div>
      </div>`
    const chatPosition = ['l-t', 'l-b'].indexOf(this.app.options.bar_position) > -1 ? 'left' : 'right' 
    return `
<div mkz-c>
  <div class="mkz-c mkz-c_collapse_yes mkz-c-js">

    <div class="mkz-c__handler mkz-c__handler_type_${this.safe(this.app.options.bar_type)} mkz-c__handler_position_${this.safe(this.app.options.bar_position)}" style="margin: ${this.safe(this.app.options.bar_padding_y)} ${this.safe(this.app.options.bar_padding_x)}">
      ${htmlNotice}
      <div class="mkz-c__btn mkz-c-js-toggle" style="background-color: ${this.app.options.bar_bg}; color: ${this.safe(this.app.options.bar_color)};">
        <div class="mkz-c__btn-text">
          <span class="mkz-c__btn-text-online">${this.safe(this.app.options.bar_text_online)}</span>
          <span class="mkz-c__btn-text-offline">${this.safe(this.app.options.bar_text_offline)}</span>
        </div>
        <svg width="27" height="27" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" class="mkz-c__btn-picture">
          <path d="M20.6429 10.4641C20.6466 11.8783 20.3162 13.2733 19.6786 14.5355C18.9226 16.0481 17.7605 17.3204 16.3223 18.2098C14.8841 19.0992 13.2267 19.5706 11.5357 19.5713C10.1216 19.5749 8.72659 19.2445 7.46432 18.607L1.35718 20.6427L3.39289 14.5355C2.75532 13.2733 2.42492 11.8783 2.42861 10.4641C2.42926 8.77313 2.90069 7.11573 3.79009 5.67755C4.67949 4.23937 5.95174 3.07721 7.46432 2.32125C8.72659 1.68368 10.1216 1.35328 11.5357 1.35696H12.0715C14.3047 1.48017 16.414 2.42278 17.9955 4.00431C19.5771 5.58585 20.5197 7.69516 20.6429 9.92839V10.4641Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="mkz-c__btn-unread mkz-c-js-unread">0</div>
      </div>
    </div>

    <div class="mkz-c__chat mkz-c__chat_position_${chatPosition}">
      <div class="mkz-c__cart-shadow" style="box-shadow: 0 0 10px ${this.safe(this.app.options.title_bg)};"></div>
      <div class="mkz-c__cart">
        <div class="mkz-c__head" style="color: ${this.safe(this.app.options.title_color)}; background-color: ${this.safe(this.app.options.title_bg)};">
          <div class="mkz-c__head-state">
            <div class="mkz-c__state-wrap">
              <img class="mkz-c__m-assign-avatar mkz-c-js-agent-avatar" alt="" />
              <div class="mkz-c__state"></div>
            </div>
          </div>
          <div class="mkz-c__head-m">
            <div class="mkz-c__m-assign-text mkz-c-js-agent-name"></div>
            <div class="mkz-c__m-assign-post mkz-c-js-agent-post"></div>
            <div class="mkz-c__m-unassign-text">${this.safe(this.app.options.bar_text_offline)}</div>
          </div>
          <div class="mkz-c__head-action">
            <div class="mkz-c__close mkz-c-js-close">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.4287 4.57129L4.57153 11.4284" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4.57153 4.57129L11.4287 11.4284" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="mkz-c__content mkz-c-js-scroll">
          <div class="mkz-c__list mkz-c-js-history"></div>
        </div>
        ${htmlCopy}
        <div class="mkz-c__footer">
          <div class="mkz-c__footer-msg">
            <textarea class="mkz-c__input mkz-c-js-input" rows="1" placeholder="${this.t('placeholder')}"></textarea>
          </div>
          <div class="mkz-c__footer-btn">
            <div class="mkz-c__submit mkz-c-js-submit">
              <svg width="19" height="18" viewBox="0 0 19 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.9675 0.949039L12.9784 17.6706C12.9069 17.8682 12.7194 17.9999 12.5092 18H12.3495C12.1535 18 11.9749 17.8874 11.8903 17.7105L9.53462 12.719C9.18774 11.9831 9.322 11.1103 9.874 10.5128L12.8686 7.23833C13.0524 7.04551 13.0524 6.74232 12.8686 6.5495L12.4893 6.17015C12.2965 5.98633 11.9933 5.98633 11.8005 6.17015L8.52644 9.16505C7.92893 9.71711 7.05625 9.85139 6.32044 9.50447L1.32949 7.14848C1.13702 7.076 1.00706 6.89483 1.00009 6.68926V6.52953C0.982409 6.30492 1.11738 6.09631 1.32949 6.0204L18.0492 0.0306031C18.2289 -0.0354106 18.4306 0.00725579 18.5682 0.140416L18.8278 0.399974C18.9838 0.536262 19.0394 0.754748 18.9675 0.949039Z" fill="currentColor"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <style type="text/css">${css}</style>

</div>
    `
  }
}