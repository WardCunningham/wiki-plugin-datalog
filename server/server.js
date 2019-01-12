// datalog plugin, server-side component
// These handlers are launched with the wiki server.

(function() {

  const fs = require('fs')
  const fetch = require("node-fetch")

  scheds = {} // "slug/item" => schedule
  timers = {} // "slug/item" => timer

  function decimal(number, digits) {
    var result = []
    for (var i = 0; i < digits; i++) {
      result.push(number % 10)
      number = Math.floor(number / 10)
    }
    return result.reverse().join('')
  }

  function utc (date,chunk) {
    let y = decimal(date.getUTCFullYear(), 4)
    let m = decimal(date.getUTCMonth()+1, 2)
    let d = decimal(date.getUTCDate(), 2)
    let h = decimal(date.getUTCHours(), 2)
    if (chunk == 'hour') return `${y}-${m}-${d}-${h}`
    if (chunk == 'day') return `${y}-${m}-${d}`
    if (chunk == 'month') return `${y}-${m}`
    return `${y}`
  }

  function readyRecorder(assets,slug) {

    var chunk
    var keep
    var sites

    function mkdir(dir) {
      if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
      }
    }

    mkdir(`${assets}`)
    mkdir(`${assets}/plugins`)
    mkdir(`${assets}/plugins/datalog`)
    mkdir(`${assets}/plugins/datalog/${slug}`)

    function logfile(clock) {
      return `${assets}/plugins/datalog/${slug}/${utc(new Date(clock),chunk)}.log`
    }

    function timeout(duration) {
      // https://stackoverflow.com/a/49857905
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${duration} msec`)), duration))
    }

    function sample(schedule) {
      chunk = schedule.chunk||'year'
      keep = schedule.keep||10
      sites = schedule.sites||{}

      let clock = Date.now()
      queries = Object.keys(sites).map((name) =>
        Promise.race([
          fetch(sites[name]),
          timeout(2000)
        ])
        .then(response => response.json())
        .then(data => ({name, data}))
        .catch(error => console.log(error)||{})
      )
      Promise.all(queries)
        .then(result => save({clock,result}))
    }

    function save(result) {
      let payload = JSON.stringify(result)
      fs.appendFile(logfile(result.clock), `${payload}\n`)
    }

    function recorder(schedule) {
      sample(schedule)
      return setInterval(()=>sample(schedule),schedule.interval)
    }

    return recorder
  }


  function startServer(params) {
    var app = params.app,
        argv = params.argv

    var slug = 'testing-datalog'

    var minute = 60000,
        hour = 60*minute,
        day = 24*minute,
        month = 30*day

    function logfile(clock,chunk) {
      return `${argv.assets}/plugins/datalog/${slug}/${utc(new Date(clock),chunk)}.log`
    }

    let recorder = readyRecorder(argv.assets, slug)
    let status = `${argv.assets}/plugins/datalog/schedules.json`
    restart()

    function start(slugitem,schedule) {
      timers[slugitem] = recorder(schedule)
      scheds[slugitem] = schedule
      fs.writeFileSync(status, JSON.stringify(scheds))
    }

    function stop(slugitem) {
      clearInterval(timers[slugitem])
      delete timers[slugitem]
      delete scheds[slugitem]
      fs.writeFileSync(status, JSON.stringify(scheds))
    }

    function restart() {
      let json = fs.readFileSync(status, 'utf8');
      let scheds = JSON.parse(json)
      let slugitems = Object.keys(scheds)
      for (var i=0; i<slugitems.length; i++) {
        let slugitem = slugitems[i]
        let schedule = scheds[slugitems]
        timers[slugitem] = recorder(schedule)
      }
    }

    app.get('/plugin/datalog/:slug/hour/:offset', (req, res) => {
      return res.sendFile(logfile(Date.now()-(hour*req.params.offset),'hour'))
    })

    app.get('/plugin/datalog/:slug/day/:offset', (req, res) => {
      return res.sendFile(logfile(Date.now()-(day*req.params.offset),'day'))
    })

    app.get('/plugin/datalog/:slug/month/:offset', (req, res) => {
      return res.sendFile(logfile(Date.now()-(month*req.params.offset),'month'))
    })


    app.post('/plugin/datalog/:slug/id/:id/', (req, res) => {
      let slug = req.params['slug']
      let item = req.params['id']
      let slugitem = `${slug}/${item}`
      let command = req.body
      console.log('action',command.action||'status',slugitem)
      if (command.action) {
        if (command.action == 'start') {
          start(slugitem, command.schedule)
        } else if (command.action == 'stop') {
          stop(slugitem)
        }
      }
      let status = timers[slugitem] ? 'active' : 'inactive'
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({status}));
    })

  }

  module.exports = {startServer}

}).call(this)
