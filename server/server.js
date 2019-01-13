// datalog plugin, server-side component
// These handlers are launched with the wiki server.

"use strict";

(function() {

  const fs = require('fs')
  const fetch = require("node-fetch")

  var scheds = {} // "slug/item" => schedule
  var timers = {} // "slug/item" => timer

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


  function startServer(params) {
    var app = params.app,
        argv = params.argv,
        assets = argv.assets

    function mkdir(dir) {
      if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
      }
    }

    mkdir(`${assets}`)
    mkdir(`${assets}/plugins`)
    mkdir(`${assets}/plugins/datalog`)

    function logfile(slug,clock,chunk) {
      return `${argv.assets}/plugins/datalog/${slug}/${utc(new Date(clock),chunk)}.log`
    }

    function activate(slugitem) {

      console.log('activate', slugitem)
      let schedule = scheds[slugitem]
      let chunk = schedule.chunk||'year'
      let keep = schedule.keep||10
      let sites = schedule.sites||{}
      let slug = slugitem.split('/')[0]
      let item = slugitem.split('/')[1]

      mkdir(`${assets}/plugins/datalog/${slug}`)

      // function logfile(clock) {
      //   return `${assets}/plugins/datalog/${slug}/${utc(new Date(clock),chunk)}.log`
      // }

      function timeout(duration) {
        // https://stackoverflow.com/a/49857905
        return new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${duration} msec`)), duration))
      }

      function sample() {

        let clock = Date.now()
        let queries = Object.keys(sites).map((name) =>
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
        fs.appendFile(logfile(slug, result.clock, chunk), `${payload}\n`)
      }

      sample()
      return setInterval(sample,schedule.interval)
    }


    let status = `${assets}/plugins/datalog/schedules.json`
    let scheds = JSON.parse(fs.readFileSync(status, 'utf8'))
    let slugitems = Object.keys(scheds)
    for (var i=0; i<slugitems.length; i++) {
      let slugitem = slugitems[i]
      timers[slugitem] = activate(slugitem)
    }

    function start(slugitem,schedule) {
      scheds[slugitem] = schedule
      timers[slugitem] = activate(slugitem)
      fs.writeFileSync(status, JSON.stringify(scheds))
    }

    function stop(slugitem) {
      clearInterval(timers[slugitem])
      delete timers[slugitem]
      delete scheds[slugitem]
      fs.writeFileSync(status, JSON.stringify(scheds))
    }


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

    var minute = 60000,
        hour = 60*minute,
        day = 24*minute,
        month = 30*day

    app.get('/plugin/datalog/:slug/hour/:offset', (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(hour*req.params.offset),'hour'))
    })

    app.get('/plugin/datalog/:slug/day/:offset', (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(day*req.params.offset),'day'))
    })

    app.get('/plugin/datalog/:slug/month/:offset', (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(month*req.params.offset),'month'))
    })

  }

  module.exports = {startServer}

}).call(this)
