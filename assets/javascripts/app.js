const Socket = require('phoenix/assets/js/phoenix').Socket
const msgStory = require('./msgStory')
const msgDelivered = require('./msgDelivered')
const View = require('./view').default
const autoMsg = require('./autoMsg')
const surveyForm = require('./surveyForm')
const Sound = require('./sound').default

module.exports = {

  // Plugin methods

  version: '[AIV]{version}[/AIV]',
  airbrakeProject: 254408,
  airbrakeApiKey: '84e2f7b3f257c5fffb9edf2d951f2054',
  store: {}, // Store from the main app
  libs: {}, // Libraries from the main app
  previewMode: false,
  isMobile: false,
  create (locale, settings) {
    if (this.libs.notifierInstance) {
      this.notifier = this.libs.notifierInstance(
        this.version,
        this.airbrakeProject,
        this.airbrakeApiKey,
        process.env.NODE_ENV
      )
    } else {
      this.notifier = this.libs.notifier
    }

    this.notifier.call(() => {
      this.settings = settings
      this.locale = locale
      this.log('chat', 'created')
      this.view = new View(this)
      this.sound = new Sound(this.settings.appearance.client_sound_path)

      autoMsg.init(this)

      this.libs.eEmit.subscribe('plugin.chat.show', this.view.showChat.bind(this.view))
      this.libs.eEmit.subscribe('plugin.chat.hide', this.view.hideChat.bind(this.view))

      this.isMobile = this.libs.helpers.isMobile()

      this.createConnection()
    })
  },
  destroy () {
    if (this.view) this.view.destroy()
    if (this.socket) this.socket.disconnect()
  },
  preview (locale, settings, options = {}) {
    this.previewMode = true

    this.isMobile = Boolean(options.isMobile)
    this.settings = settings
    this.locale = locale
    this.view = new View(this)
    this.view.history = (options.history || [])
    this.view.width = options.width || null
    this.view.render()
    this.view.visibleChat()

    if (options.collapsed) this.view.showNotice()
    else this.view.showChat()

    if (options.currentAgent) {
      this.currentAgent = options.currentAgent
      this.view.assignAgent()
      this.updateAgentState()
    }
  },

  // / Plugin methods

  currentAgent: null,
  agents: [],
  agentIsOnline: false,
  sessionsCount: 0,
  settings: {},
  locale: null,
  log () {
    if (this.libs.log) this.libs.log.push('chat', ...arguments)
  },
  createConnection () {
    this.notifier.call(() => {
      this.view.render()

      this.socket = new Socket(`${this.store.chatProtocol || 'wss://'}${this.store.chatEndpoint}/socket`)

      this.socket.onOpen(this.handlerConnected.bind(this))
      this.socket.onClose(this.handlerDisconnected.bind(this))
      this.socket.connect()

      this.servicChannel = this.socket.channel(`chat-client:${this.store.appKey}`)
      this.servicChannel.join()
        .receive('error', () => this.handlerFailJoined.bind(this, this.servicChannel.topic))
      this.servicChannel.on('agent:entered', this.handlerAgentStatus.bind(this, true))
      this.servicChannel.on('agent:exited', this.handlerAgentStatus.bind(this, false))

      this.clientChannel = this.socket.channel(`room:${this.store.appKey}:${this.store.uid}`)
      this.clientChannel.join()
        .receive('ok', this.handlerJoined.bind(this))
        .receive('error', this.handlerFailJoined.bind(this, this.clientChannel.topic))
      this.clientChannel.on('client:entered', this.handlerClientEntered.bind(this))
      this.clientChannel.on('message:new', this.handlerMsg.bind(this))
      this.clientChannel.on('message:resend', this.handlerMsgResend.bind(this))
      this.clientChannel.on('agent:assign', this.handlerAgentAssign.bind(this))
      this.clientChannel.on('survey:show', this.handlerSurveyShow.bind(this))
      this.clientChannel.on('event:survey_submitted', this.handlerSurveySubmitted.bind(this))
    })
  },
  handlerConnected () {
    this.notifier.call(() => {
      this.view.connected()
    })
  },
  handlerDisconnected () {
    this.notifier.call(() => {
      this.view.disconnected()
    })
  },
  handlerJoined () {
    this.notifier.call(() => {
      this.view.visibleChat()
      this.view.scrollBottom()
      this.view.enableSending()
      this.log('chat', 'joined')
    })
  },
  handlerFailJoined (topic) {
    const error = new Error(`Cannot join channel ${topic}`)
    this.notifier.notify(error)
  },
  handlerAgentStatus (isOnline, {agent_id}) {
    this.notifier.call(() => {
      const agent = this.getAgent(agent_id)
      if (!agent) return
      agent.isOnline = isOnline
      this.updateAgentState()
    })
  },
  handlerClientEntered (msg) {
    this.notifier.call(() => {
      this.setAgents(msg.agents)
      this.sessionsCount = msg.sessionsCount
      this.setCurrentAgent(msg.current_agent_id)
      this.updateAgentState()
      if (this.libs.eEmit) this.libs.eEmit.emit('plugin.chat.channel.entered')
      this.log('chat', 'ClientEntered', msg)
    })
  },
  handlerSurveyShow (msg) {
    this.notifier.call(() => {
      if (this.view.windowFocus) surveyForm.trackShow(msg.custom_fields.uid)
      this.handlerMsg(msg)
    })
  },
  handlerMsg (msg) {
    this.notifier.call(() => {
      msg = this.addMsg(msg)
      this.stateChangeMsg(msg)
      this.view.scrollBottom()
      this.log('chat', 'Msg', msg)
    })
  },
  handlerMsgResend (msg) {
    this.notifier.call(() => {
      msg = this.addMsg(msg)
      this.stateChangeMsg(msg)
      this.view.scrollBottom()
      this.setCurrentAgent(msg.current_agent_id)
      this.log('chat', 'Resend', msg)
    })
  },
  handlerAgentAssign (msg) {
    this.notifier.call(() => {
      this.setCurrentAgent(msg.target_agent_id)
    })
  },
  handlerCollapse (collapsed) {
    this.notifier.call(() => {
      if (collapsed === true) return

      const muids = msgDelivered.getList()
      for (const muid of muids) this.pusherMsgState(muid, 'read')
      if (muids.length > 0) {
        msgDelivered.resetList()
        this.view.renderUnread()
      }
    })
  },
  handlerSurveySubmitted (payload) {
    this.notifier.call(() => {
      const msg = msgStory.findMsg(payload.custom_fields.muid)
      if (!msg) return

      msg.custom_fields.submitted = true
      msgStory.addMsg(msg)
      this.view.renderMessage(msg)

      msgStory.batchUpdateMsg(
        (m) => m.muid !== msg.muid && m.msg_type === 'survey:show' && m.custom_fields.uid === msg.custom_fields.uid,
        (m) => m.custom_fields.hidden = true
      ).map((m) => this.view.renderMessage(m))
    })
  },
  pusherTyping (text) {
    if (!text) return

    return this.clientChannel.push('client:activity', {
      type: 'typing',
      text: text
    })
  },
  pusherNewMsg (text) {
    if (!text) return

    const timestamp = +(new Date)
    const uid = this.store.uid
    const payload = {
      muid: `${uid}:c:${timestamp}`,
      text: text,
      status: 'sent',
      sent_at: this.getDateTime()
    }

    const history = msgStory.getHistory()
    const lastMsg = history.length > 0 && history[history.length - 1]
    if (lastMsg && lastMsg.msg_type === 'message:auto') {
      payload.prev_auto_message = {
        auto_message_uid: lastMsg.auto_message_uid,
        muid: lastMsg.muid,
        agent_id: 0,
        text: lastMsg.text,
        sender_type: 'auto',
        status: 'read',
        sent_at: lastMsg.sent_at,
        device_uid: uid
      }
      autoMsg.trackReply(lastMsg.muid)
    }

    return this.clientChannel.push('message:new', payload)
  },
  pusherMsgState (muid, state) {
    if (!muid) return

    this.clientChannel.push('message:status:change', {
      muid: muid,
      new_status: state,
      sent_at: this.getDateTime()
    })
  },
  pusherNewSurveyMsg (muid, visitorInfo) {
    const msg = msgStory.findMsg(muid)
    if (!msg) return

    this.clientChannel.push('survey:submit', {
      muid: muid,
      title: msg.custom_fields.title
    })

    surveyForm.trackSubmit(msg.custom_fields.uid, visitorInfo)
  },
  getDateTime () {
    return (new Date).toISOString().replace('Z', '000Z')
  },
  stateChangeMsg (msg) {
    if (msg.agent_id !== null) {
      // Status changes only for agent messages
      if (this.view.collapsed === false) this.pusherMsgState(msg.muid, 'read')
      else {
        this.pusherMsgState(msg.muid, 'delivered')
        msgDelivered.addItem(msg.muid)
        this.view.renderUnread()
      }
    }
  },
  addMsg (msg) {
    if (msg.agent_id !== null) {
      const agent = this.getAgent(msg.agent_id)
      if (agent) {
        msg.sender_avatar_url = agent.avatar_url || agent.sender_avatar_url
        msg.sender_name = agent.name || msg.sender_name
      }
      if (!this.view.windowFocus || this.view.collapsed) this.sound.play()
      if (this.view.collapsed === true) {
        this.view.showBeacon(true)
      }
    }

    msgStory.addMsg(msg)
    const nextMsg = msgStory.getNextMsg(msg.muid)
    this.view.renderMessage(msg, nextMsg)

    return msg
  },
  setCurrentAgent (currentAgentId) {
    // Set current agent by first online agent when current agent is empty
    if (!currentAgentId && !this.currentAgent) {
      const firstOnlineAgent = Object.values(this.agents).find((a) => a.isOnline)
      if (firstOnlineAgent) currentAgentId = firstOnlineAgent.id
      else return
    }

    this.currentAgent = this.getAgent(currentAgentId)
    if (this.currentAgent) this.view.assignAgent()
    else this.view.unassignAgent()
  },
  setAgents (agents) {
    this.agents = agents.reduce((obj, agent) => {
      obj[agent.id] = agent
      return obj
    }, {})
  },
  getAgent (id) {
    return this.agents[id] || null
  },
  updateAgentState () {
    if (this.currentAgent) {
      this.agentIsOnline = this.currentAgent.isOnline
    } else {
      this.agentIsOnline = Object.values(this.agents).find((agent) => agent.isOnline) && true
    }
    this.view.renderAgentState()
  }

}
