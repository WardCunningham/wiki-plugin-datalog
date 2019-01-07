// datalog plugin, server-side component
// These handlers are launched with the wiki server.

(function() {

  const fs = require('fs')
  const fetch = require("node-fetch")

  sensors = [
    {name: 'desk', site: 'http://home.c2.com:8020'},
    {name: 'office', site: 'http://home.c2.com:8021'},
    {name: 'bedroom', site: 'http://home.c2.com:8022'}
  ]

  function decimal(number, digits) {
    var result = []
    for (var i = 0; i < digits; i++) {
      result.push(number % 10)
      number = Math.floor(number / 10)
    }
    return result.reverse().join('')
  }

  function utc (date) {
    let y = decimal(date.getUTCFullYear(), 4)
    let m = decimal(date.getUTCMonth()+1, 2)
    let d = decimal(date.getUTCDate(), 2)
    let h = decimal(date.getUTCHours(), 2)
    return `${y}-${m}-${d}-${h}`
  }

  function startRecorder(assets,slug) {

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
      return `${assets}/plugins/datalog/${slug}/${utc(new Date(clock))}.log`
    }

    function timeout(duration) {
      // https://stackoverflow.com/a/49857905
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${duration} msec`)), duration))
    }

    function sample() {
      let clock = Date.now()
      queries = sensors.map((sensor) =>
        Promise.race([
          fetch(sensor.site),
          timeout(2000)
        ])
        .then(response => response.json())
        .then(json => ({name:sensor.name, data:json}))
        .catch(error => console.log(error)||{})
      )
      Promise.all(queries)
        .then(result => save({clock,result}))
    }

    function save(result) {
      let payload = JSON.stringify(result)
      fs.appendFile(logfile(result.clock), `${payload}\n`)
    }

    setInterval(sample,5000)

  }


  function startServer(params) {
    var app = params.app,
        argv = params.argv

    var slug = 'testing-datalog'

    var minute = 60000,
        hour = 60*minute

    function logfile(clock) {
      return `${argv.assets}/plugins/datalog/${slug}/${utc(new Date(clock))}.log`
    }

    startRecorder(argv.assets,slug)

    app.get('/plugin/datalog/:slug/current', (req, res) => {
      return res.sendFile(logfile(Date.now()-minute))
    })

    app.get('/plugin/datalog/:slug/previous', (req, res) => {
      return res.sendFile(logfile(Date.now()-hour-minute))
    })
  }

  module.exports = {startServer}

}).call(this)
