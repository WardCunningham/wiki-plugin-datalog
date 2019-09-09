
(function() {

  function expand(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
  };

  function absolute(url) {
    // https://github.com/bitinn/node-fetch/issues/481
    return url.replace(/^(https?:)\/([^\/])/,`$1//${location.host}/$2`)
  }

  function parse(text) {
    var schedule = {sites:{}, chunk:'hour', interval:5000, keep:24}
    let output = text.split(/\r?\n/).map (line => {
      var m
      if (m = line.match(/^HOUR (\d+)$/)) {
        schedule.chunk = 'hour'
        schedule.interval = 1000*60*60 / m[1]
      } else if (m = line.match(/^DAY (\d+)$/)) {
        schedule.chunk = 'day'
        schedule.interval = 1000*60*60*24 / m[1]
      } else if (m = line.match(/^MONTH (\d+)$/)) {
        schedule.chunk = 'month'
        schedule.interval = 1000*60*60*24*30 / m[1]
      } else if (m = line.match(/^KEEP (\d+)$/)) {
        schedule.keep = m[1]*1
      } else if (m = line.match(/^SENSOR (\w+) (https?:\S+)$/)) {
        schedule.sites[m[1]] = absolute(m[2])
        line = `SENSOR <a href="${absolute(m[2])}" target=_blank>${m[1]} <img src="/images/external-link-ltr-icon.png"></a>`
      } else {
        line = `<font color=gray>${expand(line)}</font>`
      }
      return line
    }).join('<br>')
    return {output, schedule}
  }

  function emit($item, item) {
    let $page = $item.parents('.page')
    if (!($page.hasClass('local') || $page.hasClass('remote'))) {
      $item.addClass('server-source')
      let site = location.host
      let slug = $page.attr('id').split('_')[0]
      let title = $page.find('h1').text().trim()
      let sensors = Object.keys(parse(item.text).schedule.sites)
      $item.get(0).service = () => {
        return {site, page: $page.data('key'), slug, title, id:item.id, plugin: 'datalog', sensors}
      }
    }


    let parsed = parse(item.text)
    $item.addClass('output-item')
    $item.append(`
      <div>
        ${parsed.output}
        <center><span>\u25CF</span><button disabled>wait</button></center>
      </div>`);
  };

  class PluginEvent extends Event {
    constructor(type, props) {
      super(type)
      this.pageItem = props.pageItem
      this.result = props.result
    }
  }

  const pageFor = (pageKey) => {
    let $page = $('.page').filter((_i, page) => $(page).data('key') == pageKey)
    if ($page.length == 0) return null
    if ($page.length > 1) console.log('warning: more than one page found for', key, $page)
    return $page[0]
  }

  const itemElemFor = (pageItem) => {
    let [pageKey, item] = pageItem.split('/')
    let page = pageFor(pageKey)
    if(!page) return null
    let $item = $(page).find(`.item[data-id=${item}]`)
    if ($item.length == 0) return null
    if ($item.length > 1) console.log('warning: more than one item found for', pageItem, $item)
    return $item[0]
  }

  const slugItemFor = (itemElem) => {
    let slug = $(itemElem).parents('.page:first').attr('id').split('_')[0]
    let id = $(itemElem).attr('data-id')
    let slugItem = `${slug}/${id}`
    return slugItem
  }

  // map of client producers keyed by server consumers
  // client producers are identified by their pageItem
  // server consumers are identified by their slugItem
  const cProducers = {}
  const sConsumers = []
  var withSocket = new Promise((resolve, reject) => {
    $.getScript('/socket.io/socket.io.js').done(() => {
      console.log('socket.io loaded successfully!')
      var socket = io()
      socket.on('reconnect', () => {
        console.log('reconnected: reregistering client side listeners', sConsumers)
        sConsumers.forEach(sConsumer => {
          // only need to inform the server since client side listeners survive a disconnect
          socket.emit('subscribe', sConsumer)
        })
      })
      window.socket = socket
      resolve(socket)
    }).fail(() => {
      console.log('unable to load socket.io')
      reject(Error('unable to load socket.io'))
    })
  })

  let listener = ({slugItem, result}) => {
    let sConsumer = slugItem
    let missing = []
    cProducers[sConsumer].forEach(cProducer => {
      let [pageKey, item] = cProducer.split('/')
      let itemElem = itemElemFor(cProducer)
      //console.log('item is', itemElem)
      if (!itemElem) {
        missing.push(cProducer)
        return
      }
      $(itemElem).find('span').fadeOut(250).fadeIn(250)
      document.dispatchEvent(new PluginEvent('.server-source', {pageItem: cProducer, result}))
      //console.log('received', result)
    })
    missing.forEach(cProducer => {
      // The item for the producer has been moved or removed, unregister the listener.
      console.log("Removing client side listener for", cProducer)
      cProducers[sConsumer].splice(cProducers[sConsumer].indexOf(cProducer), 1)
      if (cProducers[sConsumer].length == 0) {
        delete cProducers[sConsumer]
        console.log('Removing server side listener for', sConsumer)
        sConsumers.splice(sConsumers.indexOf(sConsumer), 1)
        withSocket.then(socket => {
          // stop listening and tell the server to stop sending
          socket.off(sConsumer, listener)
          socket.emit('unsubscribe', sConsumer)
        })
      }
    })
  }

  const registerHandler = ({sConsumer, cProducer, socket}) => {
    if (!cProducers[sConsumer]) cProducers[sConsumer] = []
    if (sConsumers.indexOf(sConsumer) == -1) {
      sConsumers.push(sConsumer)
      console.log(`subscribing to ${sConsumer}`, sConsumers)
      socket.on(sConsumer, listener)
      socket.emit('subscribe', sConsumer)
    }
    if (cProducers[sConsumer].indexOf(cProducer) == -1) {
      cProducers[sConsumer].push(cProducer)
      console.log('adding producer', cProducer, cProducers)
    }
  }

  function bind($item, item) {
    let bound = withSocket.then((socket) => {
      let {page, slug, id} = $item[0].service()
      let cProducer = `${page}/${id}`
      let sConsumer = `${slug}/${id}`
      return {sConsumer, cProducer, socket}
    })
    bound.then(registerHandler)
    $item.dblclick(() => {
      return wiki.textEditor($item, item);
    })

    let $button = $item.find('button')
    let parsed = parse(item.text)

    function action(command) {
      $button.prop('disabled',true)
      $page = $item.parents('.page')
      if($page.hasClass('local')) {
        return
      }
      slug = $page.attr('id').split('_')[0]
      let sConsumer = `${slug}/${item.id}`
      let cProducer = `${$page.data('key')}/${item.id}`
      $.ajax({
        type: "POST",
        url: `/plugin/datalog/${slug}/id/${item.id}`,
        data: JSON.stringify(command),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(data) {
          console.log('action', cProducers, sConsumers)
          $button.text((data.status == 'active') ? 'stop' : 'start')
          $button.prop('disabled',false)
          if (data.status == 'active') {
            bound.then(registerHandler)
          }
          if (data.status != 'active') {
            let count = 0
            console.log('in action', sConsumer, cProducers, cProducers[sConsumer]);
            for (producer of (cProducers[sConsumer] || [])) {
              if (producer == cProducer) {
                cProducers[sConsumer].splice(cProducers[sConsumer].indexOf(cProducer), 1)
              }
              let itemElem = itemElemFor(cProducer)
              if (itemElem != null) {
                let slugItem = slugItemFor(itemElem)
                if (slugItem == sConsumer) {
                  count += 1
                }
              }
            }
            if (count == 1) {
              console.log('removing', sConsumer, 'as its last consumer was removed')
              sConsumers.splice(sConsumers.indexOf(sConsumer), 1)
              bound.then(({sConsumer, cProducer, socket}) => {
                console.log('cleaning up', sConsumer)
                socket.off(sConsumer, listener)
                socket.emit('unsubscribe', sConsumer)
              })
              console.log({sConsumers, cProducers})
            }
          }
        },
        failure: function(err) {
          console.log(err)
        }
      })
    }
    $button.click(event => action({action:$button.text(),schedule:parsed.schedule}))
    action({})
  }

  if (typeof window !== "undefined" && window !== null) {
    window.plugins.datalog = {emit, bind};
  }

  if (typeof module !== "undefined" && module !== null) {
    module.exports = {expand};
  }

}).call(this);
