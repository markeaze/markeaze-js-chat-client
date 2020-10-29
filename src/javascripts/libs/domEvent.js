// http://javascript.ru/tutorial/events/crossbrowser

module.exports = {
  guid: 0,
  fixEvent (event) {
    event = event || window.event

    if ( event.isFixed ) {
      return event
    }
    event.isFixed = true

    event.preventDefault = event.preventDefault || function(){this.returnValue = false}
    event.stopPropagation = event.stopPropagaton || function(){this.cancelBubble = true}

    if (!event.target) {
        event.target = event.srcElement
    }

    if (!event.relatedTarget && event.fromElement) {
        event.relatedTarget = event.fromElement == event.target ? event.toElement : event.fromElement;
    }

    if ( event.pageX == null && event.clientX != null ) {
        var html = document.documentElement, body = document.body;
        event.pageX = event.clientX + (html?.scrollLeft || body?.scrollLeft || 0) - (html.clientLeft || 0);
        event.pageY = event.clientY + (html?.scrollTop || body?.scrollTop || 0) - (html.clientTop || 0);
    }

    if ( !event.which && event.button ) {
        event.which = (event.button & 1 ? 1 : ( event.button & 2 ? 3 : ( event.button & 4 ? 2 : 0 ) ));
    }

    return event
  },

  /* Вызывается в контексте элемента всегда this = element */
  commonHandle (event, self) {
    event = self.fixEvent(event)

    var handlers = this.events[event.type]

  for ( var g in handlers ) {
      var handler = handlers[g]

      var ret = handler.call(this, event)
      if ( ret === false ) {
          event.preventDefault()
          event.stopPropagation()
      }

      if (event.stopNow) break;
    }
  },
  add (elem, type, handler) {
    let self = this;

    if (elem.setInterval && ( elem != window && !elem.frameElement ) ) {
      elem = window;
    }

    if (!handler.guid) {
      handler.guid = ++this.guid
    }

    if (!elem.events) {
      elem.events = {}
      elem.handle = function(event) {
        return self.commonHandle.call(elem, event, self)
      }
    }

    if (!elem.events[type]) {
      elem.events[type] = {}

      if (elem.addEventListener)
        elem.addEventListener(type, elem.handle, false)
      else if (elem.attachEvent)
        elem.attachEvent("on" + type, elem.handle)
    }

    elem.events[type][handler.guid] = handler
  },
  remove (elem, type, handler) {
    var handlers = elem.events && elem.events[type]

    if (!handlers) return

    delete handlers[handler.guid]

    for(var any in handlers) return
    if (elem.removeEventListener)
    elem.removeEventListener(type, elem.handle, false)
    else if (elem.detachEvent)
    elem.detachEvent("on" + type, elem.handle)

    delete elem.events[type]


    for (var any in elem.events) return
    try {
      delete elem.handle
      delete elem.events
    } catch(e) { // IE
      elem.removeAttribute("handle")
      elem.removeAttribute("events")
    }
  }
}
