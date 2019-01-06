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

    function sample() {
      let clock = Date.now()
      let payload = JSON.stringify({clock})
      let logfile = `${assets}/plugins/datalog/${slug}.log`
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
