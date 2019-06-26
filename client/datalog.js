
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

  const produces = ['.server-source']

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
    $item.append(`
      <div style="background-color:#eee; padding:15px; margin-block-start:1em; margin-block-end:1em;">
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
    if ($page.length > 1) console.log('warning: more than one page found for', key)
    return $page[0]
  }

  const itemFor = (pageItem) => {
    let [pageKey, item] = pageItem.split('/')
    let page = pageFor(pageKey)
    if(!page) return null
    let $item = $(page).find(`.item[data-id=${item}]`)
    if ($item.length == 0) return null
    if (item.length > 1) console.log('warning: more than one item found for', pageItem)
    return $item[0]
  }

  const producers = []
  const slugItems = []
  let listener = (result) => {
    // for each producer
    // find the dom element
    producers.forEach(pageItem => {
      let [pageKey, item] = pageItem.split('/')
      let found = false
      let itemElem = itemFor(pageItem)
      if (!itemElem) {
        // The item has been moved, unregister the listener for the old location.
        producers.splice(produces.indexOf(pageItem), 1)
        console.log("Unregistering listener for", pageItem)
        socket.off(pageItem, listener)
        return
      }
      $(itemElem).find('span').fadeOut(250).fadeIn(250)
      document.dispatchEvent(new PluginEvent('.server-source', {pageItem, result}))
      //console.log('received', result)
    })
  }

  var loadSocketIO = new Promise((resolve, reject) => {
    $.getScript('/socket.io/socket.io.js').done(() => {
      console.log('socket.io loaded successfully!')
      var socket = io()
      socket.on('reconnect', () => {
        console.log('reconnected: reregistering client side listeners', slugItems)
        slugItems.forEach(slugItem => {
          socket.emit('subscribe', slugItem)
        })
      })
      window.socket = socket
      resolve(socket)
    }).fail(() => {
      console.log('unable to load socket.io')
      reject(Error('unable to load socket.io'))
    })
  })
  function bind($item, item) {
    loadSocketIO.then((socket) => {
      let {page, slug, id} = $item[0].service()
      let pageItem = `${page}/${id}`
      let slugItem = `${slug}/${id}`
      if (slugItems.indexOf(slugItem) == -1) {
        slugItems.push(slugItem)
        console.log(`subscribing to ${slugItem}`)
        socket.on(slugItem, listener)
        socket.emit('subscribe', slugItem)
      }
      if (producers.indexOf(pageItem) == -1) {
        producers.push(pageItem)
      }
    })
    $item.dblclick(() => {
      return wiki.textEditor($item, item);
    });

    let $button = $item.find('button')
    let parsed = parse(item.text)

    function action(command) {
      $button.prop('disabled',true)
      $page = $item.parents('.page')
      if($page.hasClass('local')) {
        return
      }
      slug = $page.attr('id').split('_')[0]
      $.ajax({
        type: "POST",
        url: `/plugin/datalog/${slug}/id/${item.id}`,
        data: JSON.stringify(command),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(data){
          $button.text((data.status == 'active') ? 'stop' : 'start')
          $button.prop('disabled',false)
          // TODO: Remove on stop
          /*producers
            .map(pageItem => itemFor(pageItem))
            .filter(item => item != null)
            .map(item => slugItemFor(item))*/
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
    window.plugins.datalog = {produces, emit, bind};
  }

  if (typeof module !== "undefined" && module !== null) {
    module.exports = {expand};
  }

}).call(this);
