const autoMsgStory = require('./autoMsgStory')

module.exports = {
  cached: false,
  init (app) {
    this.app = app
    this.libs = app.libs
    this.cached = false
    this.items = autoMsgStory.getItems()
    this.rendered = false
    this.timers = {}

    this.libs.eEmit.subscribe('plugin.chat.auto_messages', this.saveWithTimer.bind(this))
    this.libs.eEmit.subscribe('plugin.chat.channel.entered', () => {
      this.rendered = true
      this.renderNewItems()
    })
  },
  getHistory () {
    this.cached = true
    return this.items.map((item) => item.payload)
  },
  getTime () {
    return Math.round(+new Date / 1000)
  },
  startTimer (item, callback) {
    const delay = item.display_at - this.getTime()
    if (!delay || delay < 0) return false
    this.timers[item.uid] = setTimeout(callback, delay * 1000)
    return true
  },
  stopTimer (item) {
    if (!this.timers[item.uid]) return

    clearTimeout(this.timers[item.uid])
    delete this.timers[item.uid]
  },
  saveWithTimer (items) {
    if (items.length === 0) return

    const itemsWithoutTimer = items.filter((item) => {
      return !this.startTimer(item, () => this.save([item]))
    })
    if (itemsWithoutTimer.length > 0) this.save(itemsWithoutTimer)
  },
  save (items) {
    this.cached = false
    const uid = this.app.store.uid
    this.items = autoMsgStory.addItems(items.map((item) => {
      this.stopTimer(item)
      const sentAt = this.app.getDateTime()
      const timestamp = +(new Date(sentAt))
      const agent = this.app.getAgent(item.sender_id)
      return {
        payload: {
          auto_message_uid: item.uid,
          agent_id: item.sender_id,
          attachments: [],
          muid: `${uid}:a:${timestamp}`,
          msg_type: 'message:auto',
          sender_type: item.sender_type,
          sender_avatar_url: agent ? agent.avatar_url : null,
          sender_name: agent ? agent.name : null,
          sent_at: sentAt,
          text: item.text,
          exclude: true,
          custom_fields: item
        },
        state: 'new',
        sent_at: sentAt
      }
    }))

    if (this.rendered) this.renderNewItems()
  },
  renderNewItems () {
    const items = this.items.filter((item) => item.state === 'new')
    if (items.length === 0) return

    this.cached = false
    for (const item of items) {
      const msg = item.payload
      this.app.addMsg(msg)
      if (msg.agent_id) this.app.setCurrentAgent(msg.agent_id)

      this.trackShow(msg.custom_fields.uid)

      item.state = 'sent'
    }
    this.app.view.showChat()

    autoMsgStory.setItems(this.items)
  },
  removeItem (muid) {
    this.cached = false
    this.items = autoMsgStory.removeItem(muid)
  },
  trackShow (uid) {
    mkz('trackAutoMessageShow', {
      auto_message_uid: uid
    })
  },
  trackReply (muid) {
    const item = this.items.find((item) => item.payload.muid === muid)
    if (!item) return

    const customFields = item.payload.custom_fields
    mkz('trackAutoMessageReply', {
      auto_message_uid: customFields.uid,
      reply_text: customFields.text,
      reply_once: customFields.reply_once
    })
  }
}