const Socket = require('phoenix/assets/js/phoenix').Socket
const msgStory = require('./msgStory')
const msgDelivered = require('./msgDelivered')
const View = require('./view').default
const Sound = require('./sound').default

module.exports = {
  store: null, // Store from the main app
  libs: null, // Libraries from the main app
  currentAgent: null,
  agents: [],
  sessionsCount: 0,
  history: [],
  settings: {
    typingTimeout: 1000,
    whitelabel: false,
    copyright: 'Powered by Markeaze',
    offline: 'Leave message',
    placeholder: 'Type your message here...',
    noticeIcon: '/assets/images/tooltip.png',
    noticeText: 'Looking for<br />halloween gifts?',
    noticeShowTimeout: 1000,
    noticeHideTimeout: 10000,
    margin: '20px',
    iconColor: '#000',
    iconBg: '#F28E24',
    iconText: 'We’re here. Let’s chat!',
    iconPosition: 'r-b', // l-t / r-t / l-b / r-b
    iconType: 'bubble', // bar / bubble
    soundUrl: 'https://dmyqxi5zjm55y.cloudfront.net/public/chat/sounds',
    soundName: 'vk_1'
  },
  ready (nameVariable) {
    // Abort if tracker app is undefined
    if (!window[nameVariable]) return false

    const self = this
    window[nameVariable](function() {
      self.store = this.store
      self.libs = this.libs
      self.createConnection.apply(self)
      self.libs.log.push('chat', 'init')
    })

    this.sound = new Sound(this.settings.soundUrl, this.settings.soundName)
  },
  createConnection () {
    this.socket = new Socket(`//${this.store.chatEndpoint}/socket`)
    
    this.view = new View(this)

    this.socket.onOpen(this.handlerConnected.bind(this))
    this.socket.onClose(this.handlerDisconnected.bind(this))
    this.socket.connect()

    this.channelName = `room:${this.store.appKey}:${this.store.uid}`

    this.channel = this.socket.channel(this.channelName)
    this.channel.join()
      .receive('ok', this.handlerJoined.bind(this))
      .receive('error', this.handlerJoinError.bind(this))
    this.channel.on('client:entered', this.handlerClientEntered.bind(this))
    this.channel.on('message:new', this.handlerMsg.bind(this))
    this.channel.on('message:resend', this.handlerMsgResend.bind(this))
    this.channel.on('agent:assign', this.handlerAgentAssign.bind(this))
  },
  handlerConnected () {
    this.view.connected()
  },
  handlerDisconnected () {
    this.view.disconnected()
  },
  handlerJoined () {
    this.history = msgStory.getData()
    this.view.render()
    this.view.scrollBottom()
    this.libs.log.push('chat', 'joined')
  },
  handlerClientEntered (msg) {
    this.setAgents(msg.agents)
    this.sessionsCount = msg.sessionsCount
    this.setCurrentAgent(msg.current_agent_id)
    this.libs.log.push('chat', 'ClientEntered', msg)
  },
  handlerJoinError () {
    console.error(`Cannot join channel ${this.channelName}`)
  },
  handlerMsg (msg) {
    this.parseMsg(msg)
    this.libs.log.push('chat', 'Msg', msg)
    this.view.scrollBottom()
  },
  handlerMsgResend (msg) {
    this.parseMsg(msg)
    this.view.scrollBottom()
    this.setCurrentAgent(msg.current_agent_id)
    this.libs.log.push('chat', 'Resend', msg)
  },
  handlerAgentAssign () {
    this.setCurrentAgent(msg.agent_id)
  },
  handlerCollapse (collapsed) {
    if (collapsed === true) return

    const muids = msgDelivered.getList()
    for (const muid of muids) this.pusherMsgState(muid, 'delivered')
    msgDelivered.resetList()
    this.view.renderUnread()
  },
  pusherTyping (text) {
    if (!text) return

    return this.channel.push('client:activity', {
      type: 'typing',
      text: text
    })
  },
  pusherNewMsg (text) {
    if (!text) return

    const timestamp = +(new Date)
    const uid = this.store.uid
    return this.channel.push('message:new', {
      muid: `${uid}:c:${timestamp}`,
      text: text,
      sent_at: this.getDateTime()
    })
  },
  pusherMsgState (muid, state) {
    if (!muid) return

    this.channel.push('message:status:change', {
      muid: muid,
      new_status: state,
      sent_at: this.getDateTime()
    })
  },
  getDateTime () {
    return (new Date).toISOString()
  },
  parseMsg (msg) {
    if (msg.agent_id) {
      const agent = this.getAgent(msg.agent_id)
      msg.sender_avatar_url = agent ? agent.sender_avatar_url : null
      // Status changes only for agent messages
      if (this.view.collapsed === false) this.pusherMsgState(msg.muid, 'read')
      else {
        this.pusherMsgState(msg.muid, 'delivered')
        msgDelivered.addItem(msg.muid)
        this.view.renderUnread()
      }
      this.sound.play()
    }
    this.history = msgStory.addData(this.history, msg)
    this.view.render()
  },
  setCurrentAgent (currentAgentId) {
    if (!currentAgentId && !this.currentAgent) return

    this.currentAgent = this.getAgent(currentAgentId)
    if (this.currentAgent) this.view.assignAgent()
    else this.view.unassignAgent()
  },
  setAgents (agents) {
    this.agents = agents.reduce((obj, item) => {
      obj[item.id] = item
      return obj
    }, {})
  },
  getAgent (id) {
    return this.agents[id] || null
  }
}
