// datalog plugin, server-side component
// These handlers are launched with the wiki server.

(function() {

  const fs = require('fs');

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

    function decimal(number, digits) {
      result = []
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

    function sample() {
      let clock = Date.now()
      let payload = JSON.stringify({clock})
      let logfile = `${assets}/plugins/datalog/${slug}/${utc(new Date(clock))}.log`
      fs.appendFile(logfile, `${payload}\n`)
    }

    setInterval(sample,5000)

  }


  function startServer(params) {
    var app = params.app,
        argv = params.argv

    startRecorder(argv.assets,'testing-datalog')

    return app.get('/plugin/datalog/:thing', (req, res) => {
      let thing = req.params.thing
      let clock = Date.now()
      return res.json({thing, clock})
    })
  }

  module.exports = {startServer}

}).call(this)
