const css = require('./css')
const msgDelivered = require('./msgDelivered')
const helpers = require('./libs/helpers')
const domEvent = require('./libs/domEvent')
const { startBlink, stopBlink } = require('./libs/faviconBlink')
const Template = require('./template').default
const msgStory = require('./msgStory')
const translations = require('./translations')
const Sound = require('./sound').default
const mute = require('./mute')
const ImagePreview = require('./imagePreview').default
const ProductSlide = require('./productSlide').default
const { Translate } = require('./translate')

export default class View {
  constructor (app) {
    this.history = null
    this.collapsed = helpers.getUrlParameter('mkz_expand_chat') !== 'true'
    this.oldCollapsed = true
    this.windowFocus = true
    this.app = app
    this.previewMode = app.previewMode
    this.libs = app.libs
    this.allowSending = false
    this.typingTimeout = 1000
    this.noticeShowTimeout = 1000
    this.noticeHideTimeout = 10000
    this.width = null
    this.focusOnHistory = false
    this.template = new Template(this)
    this.containerBeaconClassName = 'mkz-c_beacon_show'
    this.containerAvatarClassName = 'mkz-c_avatar_show'
    this.containerChatClassName = 'mkz-c_chat_show'
    this.containerValidMessageClassName = 'mkz-c_valid-message_yes'
    this.htmlClassName = 'mkz-c-fixed'
    this.mobileClassName = 'mkz-c-mobile'
    this.actionClassName = 'mkz-c__footer-action_disabled_yes'
    this.translate = new Translate(this.app.locale)

    this.validationOptions = {
      invalidClassName: 'mkz-f__invalid',
      invalidParentClassName: 'mkz-f__invalid-wrap'
    }

    this.sound = new Sound(app.settings.appearance.client_sound_path)
  }
  destroy () {
    const chatAttachmentPlugin = this.app.getPlugin('chatAttachment')
    if (chatAttachmentPlugin) chatAttachmentPlugin.app.destroy()

    if (!this.el || !this.el.parentNode) return
    this.el.parentNode.removeChild(this.el)
  }
  bind () {
    domEvent.add(this.elInput, 'keyup', this.renderForm.bind(this))
    domEvent.add(this.elInput, 'cut', this.renderForm.bind(this))
    domEvent.add(this.elInput, 'paste', this.renderForm.bind(this))

    domEvent.add(this.elToggle, 'click', this.showChat.bind(this))
    domEvent.add(this.elClose, 'click', this.hideChat.bind(this))

    domEvent.add(this.elScroll, 'mouseenter', () => {
      this.focusOnHistory = true
    })
    domEvent.add(this.elScroll, 'mouseleave', () => {
      this.focusOnHistory = false
    })

    if (this.previewMode) return

    domEvent.add(window, 'focus', this.onFocus.bind(this))
    domEvent.add(window, 'blur', this.onBlur.bind(this))
    domEvent.add(window, 'resize', this.setZoom.bind(this))

    domEvent.add(this.elSubmit, 'click', this.sendMsg.bind(this))

    domEvent.add(this.elInput, 'keydown', (e) => {
      if (e.keyCode == 13 && !e.shiftKey) {
        e.preventDefault()
        this.sendMsg()
      } else {
        this.startTyping()
      }
    })

    mute.bind(this)
  }
  bindMessage (elMessage) {
    if (this.previewMode) return

    const elProductActions = elMessage.querySelectorAll('.mkz-c-o-js-action')
    for (const elProductAction of elProductActions) {
      domEvent.add(elProductAction, 'click', this.clickProductAttachment.bind(this))
    }

    const elForms = elMessage.querySelectorAll('.mkz-f-js')
    for (const elForm of elForms) {
      domEvent.add(elForm, 'submit', this.submitSurveyForm.bind(this))
    }

    const elImages = elMessage.querySelectorAll('.mkz-c-i-js')
    for (const elImage of elImages) {
      domEvent.add(elImage, 'click', (e) => this.renderPreviewImages(e, elImage, elImages))
    }

    new ProductSlide(elMessage)
  }
  renderPreviewImages (e, elImage, elImages) {
    e.preventDefault()
    const index = Array.prototype.indexOf.call(elImages, elImage)
    new ImagePreview(this, index, elImages)
  }
  renderForm () {
    setTimeout(() =>{
      this.setMsgHeight()
      this.renderFormValidate()
    }, 0)
  }
  renderFormValidate () {
    if (this.elInput.value.length > 0) helpers.addClass(this.elContainer, this.containerValidMessageClassName)
    else helpers.removeClass(this.elContainer, this.containerValidMessageClassName)
  }
  setZoom () {
    // Disable form iframe mode
    if (window.self !== window.top) return
    if (!this.app.isMobile) return

    const zoom = helpers.getScale()
    this.elContainer.style.zoom = zoom > 1 ? zoom : 1
  }
  submitSurveyForm (e) {
    e.preventDefault()
    const el = e.target
    const valid = (new this.libs.Validation(el, this.validationOptions)).valid()
    const muid = el.dataset.uid

    if (!valid) return

    let form = new this.libs.FormToObject(el)
    const msg = msgStory.findMsg(muid)

    // Save form values into message stories
    if (msg) {
      msg.custom_fields.elements.map((element) => {
        element.value = form[element.field] || ''
      })
      msgStory.addMsg(msg)
    }

    // Converting format of variables
    if (msg && msg.custom_fields) {
      const elements = msg.custom_fields.elements
      form = helpers.entries(form)
        .reduce((data, [key, value]) => {
          data[key] = value

          const element = elements.find((element) => element.field === key)
          if (element) {
            switch(element.display_type) {
              case 'boolean':
                if (value === 'true') data[key] = true
                if (value === 'false') data[key] = false
                break
              case 'numeric':
                if (value !== '') data[key] = parseFloat(value)
                break
              case 'integer':
                if (value !== '') data[key] = parseInt(value)
                break
            }
          }

          return data
        }, {})
    }

    // Move custom fields to properties by name prefix
    const prefix = 'properties.'
    form = helpers.entries(form)
      .reduce((data, [key, value]) => {
        if (key.indexOf(prefix) === 0) {
          data.properties = data.properties || {}
          data.properties[key.replace(prefix, '')] = value
        } else {
          data[key] = value
        }
        return data
      }, {})

    this.app.pusherNewSurveyMsg(muid, form)
    el.querySelector('button').disabled = true
  }
  clickProductAttachment (e) {
    const el = e.target
    const offer = JSON.parse(el.dataset.data)
    const callbackLabel = el.dataset.callback_label
    const settings = this.app.settings.behavior.attachment_cta.product

    const callback = () => {
      if (callbackLabel) el.innerHTML = callbackLabel
      if (settings.callback) eval(settings.callback)(offer)
    }

    if (el.handlerDone) return
    el.handlerDone = true
    el.setAttribute('disabled', true)

    eval(settings.handler)(offer, callback)
  }
  onFocus () {
    this.windowFocus = true
    stopBlink()
  }
  onBlur () {
    this.windowFocus = false
  }
  showChat () {
    if (this.app.settings.beaconState === 'disabled') return
    this.collapsed = false
    this.renderChatToggle()

    if (this.previewMode) return
    this.libs.eEmit.emit('plugin.chat.showed')
  }
  hideChat () {
    this.collapsed = true
    this.renderChatToggle()

    if (this.previewMode) return
    this.libs.eEmit.emit('plugin.chat.hid')
  }
  notifyNewMsg (msg, ignoreCollapsed = false) {
    if (this.app.settings.beaconState === 'disabled') return

    if (!this.windowFocus) {
      startBlink( translations[this.app.locale]['new_message'] )
    }

    if (!mute.getState() && (this.collapsed || ignoreCollapsed || !this.windowFocus)) {
      this.sound.play()
    }
  }
  renderChatToggle () {
    const updatedState = this.collapsed !== this.oldCollapsed
    this.oldCollapsed = this.collapsed

    if (this.collapsed) {
      helpers.removeClass(document.documentElement, this.htmlClassName)
      helpers.removeClass(this.elContainer, this.containerChatClassName)

      this.showBeacon()
    } else {
      helpers.addClass(document.documentElement, this.htmlClassName)
      helpers.addClass(this.elContainer, this.containerChatClassName)

      this.hideBeacon()
    }

    if (this.previewMode || !updatedState) return

    this.app.handlerCollapse(this.collapsed)

    if (!this.collapsed) {
      setTimeout(() => {
        this.elInput.focus()
      }, 100)
    }
  }
  showBeacon (hasMessage) {
    if (this.app.settings.beaconState === 'disabled') return this.hideBeacon()

    if (this.app.settings.beaconState === 'hidden' && !hasMessage) return this.hideBeacon()

    helpers.addClass(this.elContainer, this.containerBeaconClassName)
  }
  hideBeacon () {
    helpers.removeClass(this.elContainer, this.containerBeaconClassName)
  }
  connected () {
    this.enableSending()
  }
  disconnected () {
    this.disableSending()
  }
  startTyping () {
    if (this.timeoutTyping) return
    this.timeoutTyping = setTimeout((() => {
      this.sendTyping()
      this.stopTyping()
    }), this.typingTimeout)
  }
  stopTyping () {
    clearTimeout(this.timeoutTyping)
    this.timeoutTyping = null
  }
  sendTyping () {
    const text = this.elInput.value
    this.app.pusherTyping(text)
  }
  sendMsg () {
    if (!this.allowSending) return
    const text = this.elInput.value.trim()
    if (!text) return
    this.stopTyping()
    this.disableSending()
    this.app.pusherNewMsg(text)
      .receive('ok', () => {
        this.elInput.value = null
        this.renderFormValidate()
        this.setMsgHeight()
        this.enableSending()
      })
      .receive('error', () => this.enableSending.bind(this))
      .receive('timeout', () => this.enableSending.bind(this))
  }
  setMsgHeight () {
    this.elInput.style.height = 'auto'
    const newH = this.elInput.scrollHeight
    this.elInput.style.height = newH + 'px'
  }
  disableSending () {
    this.allowSending = false
    if (this.elSubmit) helpers.addClass(this.elSubmit, this.actionClassName)
  }
  enableSending () {
    this.allowSending = true
    if (this.elSubmit) helpers.removeClass(this.elSubmit, this.actionClassName)
  }
  visibleChat () {
    helpers.addClass(this.elContainer, 'mkz-c_display_yes')
    this.scrollBottom()
  }
  assignAgent () {
    helpers.addClass(this.elContainer, 'mkz-c_agent_assign')
    this.renderAgents()
  }
  unassignAgent () {
    helpers.removeClass(this.elContainer, 'mkz-c_agent_assign')
    this.renderAgents()
  }
  renderAgents () {
    if (this.app.currentAgent) {
      this.elAgentName.innerText = this.app.currentAgent.name || ''
      if (this.app.settings.appearance.agent_post) {
        this.elAgentPost.innerText = this.app.currentAgent.job_title || ''
      }
    }
    const avatars = []
    if (this.app.settings.appearance.agent_avatar) {
      if (!this.app.agentIsOnline) {
        const agents = Object.values(this.app.agents).filter((a) => a.id !== this.app.currentAgent.id)
        const limit = 2
        for (let i = 1; i <= limit && i <= agents.length; i++) {
          avatars.push(agents[i - 1].avatar_url)
        }
      }
      if (this.app.currentAgent) avatars.push(this.app.currentAgent.avatar_url)
      helpers.addClass(this.elContainer, this.containerAvatarClassName)
    } else {
      helpers.removeClass(this.elContainer, this.containerAvatarClassName)
    }
    this.elAgentAvatar.innerHTML = this.template.avatars(avatars)
  }
  onlineAgents () {
    helpers.addClass(this.elContainer, 'mkz-c_agent_online')
    this.renderAgents()
  }
  offlineAgents () {
    helpers.removeClass(this.elContainer, 'mkz-c_agent_online')
    this.renderAgents()
  }
  toggleNotice () {
    if (this.previewMode) return

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
      this.el = helpers.appendHTML(document.body, this.template.content())
      this.elContainer = this.el.querySelector('.mkz-c-js')
      this.elCard = this.el.querySelector('.mkz-c-js-card')
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
      this.bind()
      this.showBeacon()
      this.toggleNotice()
      this.renderMessages()

      if (!this.previewMode) {
        this.setZoom()

        const chatAttachmentPlugin = this.app.getPlugin('chatAttachment')
        if (chatAttachmentPlugin) chatAttachmentPlugin.app.create()
      }

      if (this.app.isMobile) helpers.addClass(document.documentElement, this.mobileClassName)
      else helpers.removeClass(document.documentElement, this.mobileClassName)
    }

    this.renderChatToggle()
    this.renderUnread()

  }
  renderMessages () {
    this.scrollBottom()
    this.renderWelcomeMsg()

    const history = this.history || msgStory.getHistory()
    for (const msg of history) this.renderMessageItem(msg)
  }
  renderMessageItem (msg, nextMsg) {
    const html = this.template.message(msg)
    let msgEl = this.findMsg(msg.muid)
    if (msgEl) {
      msgEl.innerHTML = html
    } else {
      const nextMsgEl = nextMsg && this.findMsg(nextMsg.muid)
      if (nextMsgEl) msgEl = helpers.beforeHTML(nextMsgEl, html)
      else msgEl = helpers.appendHTML(this.elHistory, html)
    }
    this.bindMessage(msgEl)

    this.removeWelcomeMsg()
  }
  renderMessage (msg, nextMsg) {
    this.scrollBottom()
    this.renderMessageItem(msg, nextMsg)
  }
  renderWelcomeMsg () {
    const msg = this.app.getWelcomeMsg()
    const msgEl = this.findMsg(msg.muid)
    if (!this.app.settings.appearance.welcome_message || msgEl) return
    const html = this.template.message(msg)
    this.bindMessage(helpers.appendHTML(this.elHistory, html))
  }
  removeWelcomeMsg () {
    const msg = this.app.getWelcomeMsg()
    const msgEl = this.findMsg(msg.muid)
    if (!msgEl) return
    msgEl.parentNode.removeChild(msgEl)
  }
  findMsg (muid) {
    return this.elHistory.querySelector(`[data-id="${muid}"]`)
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
    if (this.focusOnHistory && this.elScroll.scrollTop !== this.elScroll.scrollHeight - this.elScroll.clientHeight) return

    setTimeout(() => {
      this.elScroll.scrollTop = this.elScroll.scrollHeight
    }, 0)
  }
}