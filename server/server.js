// datalog plugin, server-side component
// These handlers are launched with the wiki server.

"use strict";


(function() {

  const fs = require('fs')
  const fetch = require("node-fetch")
  const exec = require('child_process').exec
  const events = require('events')

  function cors (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*')
    next()
  }

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
        assets = argv.assets,
        emitter = params.emitter;
    var scheds = {} // "slug/item" => schedule
    var timers = {} // "slug/item" => timer

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

    function msec (chunk, offset) {
      const minute = 60000,
        hour = 60*minute,
        day = 24*hour,
        month = 30*day,
        year = 365*day
      if (chunk == 'hour') return offset*hour
      if (chunk == 'day') return offset*day
      if (chunk == 'month') return offset*month
      return offset*year
    }

    function timeout(duration) {
      // https://stackoverflow.com/a/49857905
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${duration} msec`)), duration))
    }


    function activate(sProducer) {

      console.log('activate', sProducer)
      let schedule = scheds[sProducer]
      let chunk = schedule.chunk||'year'
      let keep = schedule.keep||10
      let sites = schedule.sites||{}
      let slug = sProducer.split('/')[0]
      let item = sProducer.split('/')[1]

      mkdir(`${assets}/plugins/datalog/${slug}`)

      // function logfile(clock) {
      //   return `${assets}/plugins/datalog/${slug}/${utc(new Date(clock),chunk)}.log`
      // }

      function sample() {
        console.log('sampling', {sites})
        let clock = Date.now()
        let queries = Object.keys(sites).map((name) =>
          Promise.race([
            fetch(sites[name]),
            timeout(3100)
          ])
          .then(response => response.json())
          .then(data => ({name, data}))
          .catch(error => console.log('sample', error.message)||{})
        )
        Promise.all(queries)
          .then(result => save({clock,result}))
      }

      var previous = null

      function save(result) {
        let payload = JSON.stringify(result)
        let current = logfile(slug, result.clock, chunk)
        emitter.emit(sProducer, result)
        fs.appendFile(current, `${payload}\n`, (err)=>{
          if(err)console.log('append', err.message)
          // TODO: Understand use case - possibly model as event property?
          //emitter.emit('append',current)
        })
        if (current != previous) {
          previous = current
          let retire = logfile(slug, result.clock - msec(chunk, keep), chunk)
          console.log('retire', retire)
          fs.unlink(retire,(err) => {
            if(err) console.log('retire', err.message)
          })
        }
      }

      sample()
      return setInterval(sample,schedule.interval)
    }


    let status = `${assets}/plugins/datalog/schedules.json`
    try {
      scheds = JSON.parse(fs.readFileSync(status, 'utf8'))
      let slugitems = Object.keys(scheds)
      for (var i=0; i<slugitems.length; i++) {
        let slugitem = slugitems[i]
        timers[slugitem] = activate(slugitem)
      }
    } catch (err) { }

    function start(sProducer,schedule) {
      console.log(`starting ${sProducer}`)
      scheds[sProducer] = schedule
      timers[sProducer] = activate(sProducer)
      fs.writeFileSync(status, JSON.stringify(scheds))
    }

    function stop(sProducer) {
      console.log(`stopping ${sProducer}`)
      clearInterval(timers[sProducer])
      delete timers[sProducer]
      delete scheds[sProducer]
      fs.writeFileSync(status, JSON.stringify(scheds))
    }

    function owner(req, res, next) {
      if(app.securityhandler.isAuthorized(req)) {
        next()
      } else {
        res.status(403).send({
          error: 'operation reserved for site owner'
        })
      }
    }

    app.post('/plugin/datalog/:slug/id/:id/', owner, (req, res) => {
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
        day = 24*hour,
        month = 30*day


    // app.get('/plugin/datalog/:slug/:chunk(hour|day|month)/:offset(\d+)', (req, res) => {

    app.get('/plugin/datalog/:slug/hour/:offset', cors, (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(hour*req.params.offset),'hour'))
    })

    app.get('/plugin/datalog/:slug/day/:offset', cors, (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(day*req.params.offset),'day'))
    })

    app.get('/plugin/datalog/:slug/month/:offset', cors, (req, res) => {
      return res.sendFile(logfile(req.params.slug,Date.now()-(month*req.params.offset),'month'))
    })

    app.get('/plugin/datalog/random', cors, (req, res) => {
      let tries = [1,2,3,4,5,6]
      let sample = {
        uniform: Math.random(),
        gaussian: tries.reduce((sum,_)=>sum+=Math.random())/tries.length
      }
      res.send(JSON.stringify(sample))
    })

    app.get('/plugin/datalog/waves', cors, (req, res) => {
      let angle=Date.now()/(3*60*1000)*2*Math.PI
      let sample = {
        sin: Math.sin(angle),
        cos: Math.cos(angle)
      }
      res.send(JSON.stringify(sample))
    })

    app.get('/plugin/datalog/curl', cors, (req, res) => {
      let url = /^http/.test(req.query.url) ? req.query.url : `http://${req.query.url}`
      let t0 = Date.now()

      function send(sample) {
        sample.time = Date.now() - t0
        res.send(JSON.stringify(sample))
      }

      Promise.race([
        fetch(url,{redirect:'manual'}),
        timeout(3000)
      ])
      .then(response => {
        console.log('response received:', response)
        if (!response.ok && !response.status==302) {
          return send({exit: 1, error: response.statusText, code: response.status})
        }
        return response.text()
      })
      .then(data => {
        return send({exit: 0, stdout:data.length})
      })
      .catch(error => {
        return send({exit: 2, error: error.message})
      })
    })

  }

  module.exports = {startServer}

}).call(this)
